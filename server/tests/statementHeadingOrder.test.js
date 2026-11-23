import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeStatementHeadingOrder } from '../utils/statementHeadingOrder.js';
import { previewStatementHeadingOrder } from '../services/statementHeadingPreviewService.js';
import { formattedContentToText, getEffectiveTextContent } from '../utils/textCorrections.js';
import { getFormattedHtml, getFormattedText } from '../../client/src/utils/formattedClipboard.js';
import { combineDocumentCopy } from '../../client/src/utils/documentCopy.js';
import { statementFixture, statementHeader, statementSubtitle, paragraph, heading } from './fixtures/statementHeading.js';

function unchanged(input, expectedStatus) {
  const before = structuredClone(input);
  const result = proposeStatementHeadingOrder(input);
  assert.notEqual(result.status, 'changed');
  if (expectedStatus) assert.equal(result.status, expectedStatus);
  assert.equal(result.content, input.content);
  assert.deepEqual(input, before);
  return result;
}

test('moves only the title after a complete header; preserves all blocks and is idempotent', () => {
  const input = statementFixture(), before = structuredClone(input);
  const result = proposeStatementHeadingOrder(input);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.content.blocks.map(b => b.text), [...statementHeader, 'Заявление', statementSubtitle, input.content.blocks.at(-1).text]);
  assert.deepEqual(result.content.blocks.map(b => JSON.stringify(b)).sort(), input.content.blocks.map(b => JSON.stringify(b)).sort());
  assert.ok(result.content.blocks.every(block => input.content.blocks.includes(block)));
  assert.deepEqual(input, before);
  unchanged({ ...input, content: result.content }, 'unchanged');
});

test('already correct header/title order is returned untouched', () => {
  unchanged(statementFixture({ order: 'correct' }), 'unchanged');
});

test('retains preceding header fields when the title splits the header', () => {
  const input = statementFixture();
  const [title, first, ...tail] = input.content.blocks;
  input.content.blocks = [first, title, ...tail];
  const result = proposeStatementHeadingOrder(input);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.content.blocks.slice(0, 4).map(b => b.text), statementHeader);
});

test('a verified subtitle moves with the title if both were before the header', () => {
  const input = statementFixture({ order: 'subtitle-first' });
  const result = proposeStatementHeadingOrder(input);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.evidence.movedBlockIndices, [0, 1]);
  assert.equal(result.content.blocks[4].text, 'Заявление');
  assert.equal(result.content.blocks[5].text, statementSubtitle);
});

test('a subtitle already after the header stays next to the relocated title', () => {
  const input = statementFixture();
  const result = proposeStatementHeadingOrder(input);
  assert.equal(result.content.blocks[5], input.content.blocks[5]);
  assert.equal(result.content.blocks[4].type, 'heading');
});

test('supports a two-line title and does not mistake its last line for another title', () => {
  const result = proposeStatementHeadingOrder(statementFixture({ title: 'Исковое заявление', titleLines: ['Исковое', 'заявление'] }));
  assert.equal(result.status, 'changed');
  assert.equal(result.content.blocks[4].text, 'Исковое заявление');
});

test('uses geometry instead of provider word order, including moderate skew', () => {
  assert.equal(proposeStatementHeadingOrder(statementFixture({ reverse: true, slope: 0.06 })).status, 'changed');
});

test('handles a complaint with a clear header; no specific court or person is hardcoded', () => {
  assert.equal(proposeStatementHeadingOrder(statementFixture({ title: 'Жалоба' })).status, 'changed');
});

test('OCR spelling errors require an explicit applied correction, not fuzzy guessing', () => {
  const input = statementFixture();
  input.layout.textAnnotations.find(a => a.description === 'Заявление').description = 'Заявпение';
  unchanged(input);
  input.corrections = [{ id: 'heading-spelling', original: 'Заявпение', replacement: 'Заявление', applied: true }];
  assert.equal(proposeStatementHeadingOrder(input).status, 'changed');
  input.corrections[0].applied = false;
  unchanged(input);
});

test('a heading alone or an address alone cannot identify a statement header', () => {
  for (const keep of ['Адрес', 'Заявитель', 'суд']) {
    const input = statementFixture();
    for (const annotation of input.layout.textAnnotations.slice(1)) {
      if (['Адрес', 'Заявитель', 'суд'].includes(annotation.description) && annotation.description !== keep) annotation.description = 'Пример';
    }
    unchanged(input, 'not_applicable');
  }
});

test('bank certificates, notes, recipes and ordinary letters are not statement forms', () => {
  for (const title of ['Справка', 'Памятка', 'Рецепт', 'Письмо']) unchanged(statementFixture({ title }), 'not_applicable');
});

test('bank fields do not become an applicant header even with the word Statement', () => {
  const input = statementFixture();
  for (const word of input.layout.textAnnotations.slice(1)) {
    if (word.description === 'Заявитель') word.description = 'Получатель';
    if (word.description === 'суд') word.description = 'банк';
  }
  unchanged(input, 'not_applicable');
});

test('a heading physically above the fields is not moved below them', () => {
  const input = statementFixture();
  input.layout.textAnnotations.find(a => a.description === 'Заявление').boundingPoly.vertices.forEach(p => { p.y -= 280; });
  unchanged(input, 'not_applicable');
});

test('mentions of a statement inside prose are not a standalone geometric heading', () => {
  const input = statementFixture({ titleLines: ['В тексте упоминается Заявление как пример'] });
  unchanged(input, 'not_applicable');
});

test('two source headings or duplicate formatted titles are ambiguous', () => {
  const input = statementFixture();
  const word = structuredClone(input.layout.textAnnotations.find(a => a.description === 'Заявление'));
  word.boundingPoly.vertices.forEach(p => { p.y += 300; });
  input.layout.textAnnotations.push(word);
  unchanged(input, 'ambiguous');
  const other = statementFixture();
  other.content.blocks.push(heading('Заявление'));
  unchanged(other, 'ambiguous');
});

test('mixed header/body paragraphs and table headers are not silently moved', () => {
  const mixed = statementFixture();
  mixed.content.blocks[1].text += ' Прошу установить факт';
  unchanged(mixed);
  const table = statementFixture();
  table.content.blocks.splice(1, 4, { type: 'table', headers: ['Поле', 'Значение'], rows: [['Заявитель', 'Иванов']] });
  unchanged(table);
});

test('refuses an incomplete header or a header interrupted by unrelated content', () => {
  const missing = statementFixture(); missing.content.blocks.splice(2, 1); unchanged(missing);
  const interrupted = statementFixture(); interrupted.content.blocks.splice(2, 0, paragraph('Постороннее содержание')); unchanged(interrupted);
});

test('does not reuse the same OCR word twice to justify duplicate header fields', () => {
  const input = statementFixture(); input.content.blocks.splice(2, 0, paragraph(statementHeader[0])); unchanged(input);
});

test('requires verified image identity, matching OCR and usable coordinates', () => {
  for (const change of [input => { input.sourceVerified = false; }, input => { input.sourceText = 'different OCR'; },
    input => { input.layout.sourceSha256 = ''; }, input => { input.layout.width = null; },
    input => { input.layout.provider = 'other'; }, input => { input.layout.version = 2; },
    input => { input.layout.textAnnotations[2].boundingPoly.vertices = []; },
    input => { input.layout.textAnnotations[2].boundingPoly.vertices[0].y = -10; }]) {
    const input = statementFixture(); change(input); unchanged(input);
  }
});

test('does not move an unverified subtitle or a body paragraph across the header', () => {
  const input = statementFixture({ order: 'subtitle-first' });
  input.content.blocks[1] = paragraph('Прошу выполнить просьбу');
  unchanged(input);
});

test('preview keeps OCR, corrections, lists, tables, zeros and copy order intact', () => {
  const input = statementFixture();
  input.content.blocks.push({ type: 'list', ordered: true, start: 3, items: ['Приложение 001', 'Приложение 002'] },
    { type: 'table', headers: ['Код', 'Сумма'], rows: [['00123', '100,00']] });
  const corrections = [{ id: 'x', original: 'опечатка', replacement: 'исправление', applied: true }];
  const original = { title: 'Синтетический документ', formattedContent: input.content,
    cleanText: formattedContentToText(input.content), corrections, sourceText: input.sourceText, notes: 'До проверки' };
  const before = structuredClone(original);
  const { result, status } = previewStatementHeadingOrder(original, input.layout, input);
  assert.equal(status, 'changed'); assert.deepEqual(original, before);
  assert.equal(result.sourceText, input.sourceText); assert.equal(result.corrections, corrections);
  assert.equal(result.notes, original.notes); assert.match(result.cleanText, /00123\t100,00/u);
  assert.equal(result.cleanText, getFormattedText(result.formattedContent));
  assert.equal(result.cleanText, getEffectiveTextContent(result.formattedContent, corrections).cleanText);
  const html = getFormattedHtml(result.formattedContent);
  assert.ok(html.indexOf('В районный суд') < html.indexOf('<h3>Заявление</h3>'));
  assert.ok(html.indexOf('<h3>Заявление</h3>') < html.indexOf(statementSubtitle));
  const second = 'Вторая страница остаётся на месте';
  const combined = combineDocumentCopy([{ text: result.cleanText, html }, { text: second }]);
  assert.ok(combined.text.endsWith(second));
});

test('failed formatting and non-applicable previews retain the original result object', () => {
  const input = statementFixture();
  const failure = { error: 'TIMEWEB_TIMEOUT' };
  assert.equal(previewStatementHeadingOrder(failure, input.layout, input).result, failure);
  const result = { formattedContent: input.content };
  assert.equal(previewStatementHeadingOrder(result, input.layout, { ...input, sourceVerified: false }).result, result);
});

test('malformed results and unavailable correction metadata fail without data mutation', () => {
  for (const mutate of [input => { input.content.blocks[1] = null; }, input => { input.layout.textAnnotations[2] = null; },
    input => { input.sourceText = input.layout.text = ''; }]) {
    const input = statementFixture(); mutate(input); unchanged(input);
  }
  const input = statementFixture(); input.corrections = null;
  assert.equal(proposeStatementHeadingOrder(input).status, 'changed');
});
