export function requisiteDocument() {
  const rows = [
    ['Справка о банковских реквизитах', ''], ['Получатель', 'Тестовый получатель'],
    ['Адрес', 'Россия'], ['БИК', '044525225'], ['ИНН', '0123456789'],
    ['Корр / счет', '30101810400000000225'], ['Подпись исполнителя', '']
  ];
  const words = [];
  rows.forEach(([label, value], index) => {
    for (const [start, text] of [[20, label], [380, value]]) {
      let x = start;
      for (const description of text.split(' ').filter(Boolean)) {
        const right = x + description.length * 7, top = 30 + index * 30;
        words.push({ description, boundingPoly: { vertices: [
          { x, y: top }, { x: right, y: top }, { x: right, y: top + 12 }, { x, y: top + 12 }
        ] } });
        x = right + 5;
      }
    }
  });
  const text = rows.map(row => row.filter(Boolean).join(' ')).join('\n');
  return { version: 1, provider: 'google', width: 900, height: 500, text, rawText: text,
    textAnnotations: [{ description: text }, ...words] };
}
