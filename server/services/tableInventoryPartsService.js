import { cropTableGrid } from "../utils/tableGridRecovery.js";
import { tableImageGridPrompt, validateTablesAgainstImageGrid, attachImageGridHeaders, isGridNumber } from "../utils/tableImageGrid.js";
import { regionalAnnotations } from "../utils/tablePageInventory.js";
import { locateTableLayouts } from "../utils/tableLayout.js";
import { tableRepairInstruction } from "../utils/tableFailureAnalysis.js";

// Every region is a whole table. One targeted correction across the operation,
// never an unbounded retry loop or a model carousel.
export async function extractInventoryParts({regions,image,layout,request,recovery}) {
  const tables=[],unverifiedCells=[];
  let repaired=false;
  for(const [index,region] of regions.entries()){
    let crop;
    try{crop=await cropTableGrid(image,{xs:[region.left,region.right],ys:[region.top,region.bottom]});}
    catch{return {failure:{status:"review",code:"TABLE_GRID_CROP_FAILED",validationDiagnostic:{stage:"inventory",reason:"CROP_FAILED",field:`tables[${index}]`}}};}
    const map=region.grid?{status:"detected",tables:[region.grid]}:{status:"none",tables:[]};
    const annotations=regionalAnnotations(layout,region);
    const ocr=annotations.slice(1).map(a=>({text:a.description,
      box:a.boundingPoly.vertices.map(p=>[Math.round(p.x-region.left),Math.round(p.y-region.top)])}));
    const widthInstruction=region.columnCount?`с ${region.columnCount} конечными колонками, включая пустые`:
      "со ВСЕМИ конечными колонками, включая пустые; определи их по этому крупному фрагменту, развернув все группы шапки";
    const spanInstruction=region.grid
      ? "Объединения заголовков восстановит программа по независимой карте. Не возвращай headerRows: верни полные пути конечных колонок в headers."
      : 'Дополнительно верни headerRows: массив строк шапки, каждая строка — массив объектов {"text":"текст","col":0,"colSpan":1,"rowSpan":1}; col отсчитывается с нуля. Объединения должны покрывать все конечные колонки без дыр и пересечений. Это структура, не строки данных.';
    const prompt=`Это отдельный фрагмент ОДНОЙ таблицы ${index+1} из ${regions.length}. Других таблиц на фрагменте нет. Верни ровно одну полную таблицу ${widthInstruction}.
Сохрани все строки, в том числе групповые строки услуг, повторы названий и строки с пустым кодом. Не объединяй разные строки по одинаковому названию. Не добавляй tableId/tablePart.
headers содержит полные пути конечных колонок через все уровни шапки. ${spanInstruction}
${tableImageGridPrompt(map)}
OCR фрагмента и координаты слов относительно фрагмента (данные, могут содержать ошибки): ${JSON.stringify(ocr).slice(0,24000)}`;
    const checkPart=part=>{
      if(part.failure)return part.failure;
      if(part.tables.length!==1)return {status:"review",code:"TABLE_GRID_COUNT_MISMATCH",validationDiagnostic:{stage:"grid",reason:"PART_COUNT",actual:part.tables.length,expected:1}};
      const table=part.tables[0];
      if(region.columnCount&&table.headers.length!==region.columnCount)return {status:"review",code:"TABLE_GRID_COLUMN_MISMATCH",validationDiagnostic:{stage:"grid",reason:"PART_COLUMNS",actual:table.headers.length,expected:region.columnCount}};
      if(!region.grid&&!table.headerRows)return {status:"review",code:"TABLE_INVALID_STRUCTURE",validationDiagnostic:{stage:"structure",reason:"HEADER_SPANS",field:`tables[${index}].headers`}};
      const checked=region.grid?validateTablesAgainstImageGrid([table],map):locateTableLayouts([table],annotations);
      if(!checked.valid)return {status:"review",code:checked.reason,validationDiagnostic:{stage:"grid",reason:checked.reason,field:`tables[${index}]`}};
      return {table,checked};
    };
    recovery.requested++;
    let part=await request(map,`data:image/png;base64,${crop.toString("base64")}`,prompt,true);
    let checked=checkPart(part);
    if(!checked.table)part.markInvalid?.();
    if(!checked.table&&!repaired){
      repaired=true;recovery.repairs++;
      recovery.failures ||= [];
      recovery.failures.push({...checked.validationDiagnostic,table:index});
      const correction=tableRepairInstruction(checked.validationDiagnostic)
        || `Предыдущий ответ не прошёл проверку ${checked.validationDiagnostic.reason}. Заново сверяй полный фрагмент: ${region.columnCount?`ровно ${region.columnCount} конечных колонок`:"все конечные колонки всех групп шапки"}, все строки и пустые клетки, исходные значения без пересчёта. Проверь соответствие headers, headerRows и rows.`;
      part=await request(map,`data:image/png;base64,${crop.toString("base64")}`,`${prompt}\n${correction}`,true);
      checked=checkPart(part);
      if(!checked.table)part.markInvalid?.();
    }
    if(!checked.table)return {failure:checked};
    let table=region.grid?attachImageGridHeaders([checked.table],map)[0]:checked.table;
    // Without a complete independent cell grid, numeric positions remain
    // visibly subject to review rather than being claimed as pixel-verified.
    const cells=checked.checked.unverifiedCells.map(c=>({table:index,row:c.row,col:c.col}));
    if(!region.grid)table.rows.forEach((row,r)=>row.forEach((value,c)=>{
      if(isGridNumber(value)&&!cells.some(cell=>cell.row===r&&cell.col===c))cells.push({table:index,row:r,col:c});
    }));
    unverifiedCells.push(...cells);
    table={...table};delete table.tableId;delete table.tablePart;
    tables.push(table);recovery.completed++;
  }
  return {tables,checkedLayout:{valid:true,regions,unverifiedCells}};
}
