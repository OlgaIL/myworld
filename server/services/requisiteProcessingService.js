import { recoverRequisiteLayout } from '../utils/requisiteLayout.js';
import { formattedContentToText } from '../utils/textCorrections.js';

// Keep the original local-only flag safe when a local env file is copied.
export function isLocalRequisiteLayoutEnabled(env = process.env) {
  if (env.LOCAL_REQUISITE_LAYOUT_ENABLED !== 'true' || env.NODE_ENV === 'production') return false;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.DATABASE_URL).hostname); }
  catch { return false; }
}

// Production rollout requires this separate explicit switch. False also
// disables the local trial, so rollback does not depend on the DB hostname.
export function isRequisiteLayoutEnabled(env = process.env) {
  if (env.REQUISITE_LAYOUT_ENABLED !== undefined) return env.REQUISITE_LAYOUT_ENABLED === 'true';
  return isLocalRequisiteLayoutEnabled(env);
}

function fieldWarnings(field) {
  const warnings = [...field.geometryWarnings];
  if (field.validation.status === 'mismatch') {
    warnings.push(`Формат не совпал: ${field.validation.checks.join('; ')}. Исходные символы сохранены.`);
  }
  if (field.validation.status === 'missing') warnings.push('Значение не найдено. Сверьте поле с фото.');
  if (field.type === 'unknown') warnings.push('Тип поля не определён. Сверьте его назначение с фото.');
  return warnings;
}

export function applyLocalRequisiteResult(text, result, layout, { pipeline, env = process.env } = {}) {
  if (!isRequisiteLayoutEnabled(env) || result?.error || !result
    || pipeline?.pipeline !== 'standard' || pipeline?.ocrProvider !== 'google'
    || layout?.provider !== 'google' || layout?.version !== 1
    || String(layout.text || '').trim() !== String(text || '').trim()
    || !Array.isArray(layout.textAnnotations) || layout.textAnnotations.length > 3000) return result;
  let recovered;
  try { recovered = recoverRequisiteLayout(layout); }
  catch { return result; }
  const fields = recovered.sections.flatMap(section => section.fields);
  const numericTypes = new Set(['bik', 'inn', 'swift', 'account', 'correspondent_account']);
  if (recovered.status !== 'review' || !recovered.wordCoverageComplete
    || fields.filter(field => numericTypes.has(field.type)).length < 2 || fields.length < 3) return result;

  const yOf = ids => {
    const words = ids.map(id => layout.textAnnotations[id].boundingPoly.vertices);
    return Math.min(...words.map(points => {
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      return ys.reduce((n, y) => n + y, 0) / 4 - recovered.skew * (Math.min(...xs) + Math.max(...xs)) / 2;
    }));
  };
  const fieldEvents = recovered.sections.flatMap((section, sectionIndex) => section.fields.map(field => ({
    y: yOf(field.labelWordIds), sectionIndex, field, warnings: fieldWarnings(field)
  })));
  const firstFieldY = Math.min(...fieldEvents.map(event => event.y));
  const lastFieldY = Math.max(...fieldEvents.map(event => event.y));
  const events = [...fieldEvents, ...recovered.unplacedLines.map(line => ({
    y: line.y, text: line.text, needsReview: line.y > firstFieldY && line.y < lastFieldY
  }))].sort((a, b) => a.y - b.y);
  const blocks = [];
  let table = null, tableSection = null;
  for (const event of events) {
    if (!event.field) {
      table = null;
      blocks.push({ type: 'paragraph', text: event.text,
        ...(event.needsReview ? { needsReview: true, reviewReason: 'Связь этой строки с полем не определена. Сверьте с фото.' } : {}) });
      continue;
    }
    if (!table || tableSection !== event.sectionIndex) {
      table = { type: 'table', headers: ['Поле', 'Значение'], rows: [], unverifiedCells: [] };
      blocks.push(table); tableSection = event.sectionIndex;
    }
    const row = table.rows.length;
    table.rows.push([event.field.label, event.field.value]);
    if (event.warnings.length) table.unverifiedCells.push({ row, col: 1, reason: event.warnings.join(' ') });
  }
  const mismatchCount = fields.filter(field => field.validation.status === 'mismatch').length;
  const looseCount = events.filter(event => event.needsReview).length;
  const formattedContent = { blocks, requisiteLayout: { version: 1, source: 'google_coordinates',
    requiresReview: true, groups: recovered.sections.length, fields: fields.length, mismatchCount, looseCount } };
  const note = 'Реквизиты собраны по расположению строк. Сверьте их с фото, особенно отмеченные фрагменты. '
    + 'Проверка формата не подтверждает правильность всех цифр.'
    + (mismatchCount ? ` Формат не совпал у ${mismatchCount} полей; исходные значения сохранены.` : '');
  return { ...result, formattedContent, cleanText: formattedContentToText(formattedContent),
    hasTable: false, corrections: [], hasRecognitionErrors: true, textQuality: 'low_confidence',
    notes: [note, result.notes].filter(Boolean).join(' ') };
}
