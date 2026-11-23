export const paragraph = text => ({ type: 'paragraph', text });
export const heading = text => ({ type: 'heading', text });
export const statementHeader = ['В районный суд', 'Заявитель Иванов', 'Адрес Город Улица', 'Телефон 00123456789'];
export const statementSubtitle = 'об установлении факта принятия наследства';
export const statementBody = 'Прошу установить факт принятия наследства';

export function statementFixture({ title = 'Заявление', titleLines = [title], subtitle = statementSubtitle,
  order = 'wrong', slope = 0, reverse = false } = {}) {
  const rows = [...statementHeader.map((text, index) => ({ text, x: 610, y: 60 + index * 40 })),
    ...titleLines.map((text, index) => ({ text, x: 420, y: 300 + index * 22 })),
    { text: subtitle, x: 100, y: 350 }, { text: statementBody, x: 100, y: 430 }];
  const annotations = [];
  for (const row of rows) {
    let x = row.x;
    for (const text of row.text.split(' ')) {
      const width = text.length * 6;
      annotations.push({ description: text, boundingPoly: { vertices: [
        { x, y: row.y + slope * x }, { x: x + width, y: row.y + slope * (x + width) },
        { x: x + width, y: row.y + 16 + slope * (x + width) }, { x, y: row.y + 16 + slope * x }
      ] } });
      x += width + 5;
    }
  }
  const sourceText = [title, ...statementHeader, subtitle, statementBody].join('\n');
  const headerBlocks = statementHeader.map(paragraph), titleBlock = heading(title), subtitleBlock = paragraph(subtitle), bodyBlock = paragraph(statementBody);
  const blocks = order === 'correct' ? [...headerBlocks, titleBlock, subtitleBlock, bodyBlock]
    : order === 'subtitle-first' ? [titleBlock, subtitleBlock, ...headerBlocks, bodyBlock]
    : [titleBlock, ...headerBlocks, subtitleBlock, bodyBlock];
  return { content: { blocks }, sourceText, sourceVerified: true, corrections: [],
    layout: { provider: 'google', version: 1, width: 1000, height: 1400, sourceSha256: 'a'.repeat(64),
      text: sourceText, rawText: sourceText, textAnnotations: [{ description: sourceText }, ...(reverse ? annotations.reverse() : annotations)] } };
}
