// Span metadata must cover the same leaf columns exactly once. Keep the flat
// headers for TSV and validation, and fall back to them if metadata is invalid.
export function getTableHeaderRows(table) {
  const fallback=()=>[(table.headers||[]).map((text,col)=>({text,col,rowSpan:1,colSpan:1}))];
  const rows=table.headerRows,columns=table.headers?.length;
  if(!Array.isArray(rows)||!rows.length||rows.length>10||!columns)return fallback();
  const covered=Array.from({length:rows.length},()=>Array(columns).fill(false));
  for(let r=0;r<rows.length;r++){
    if(!Array.isArray(rows[r]))return fallback();
    let previous=-1;
    for(const cell of rows[r]){
      if(!cell||typeof cell.text!=='string'||!Number.isInteger(cell.col)||cell.col<=previous
        ||!Number.isInteger(cell.rowSpan)||!Number.isInteger(cell.colSpan)
        ||cell.col<0||cell.rowSpan<1||cell.colSpan<1||r+cell.rowSpan>rows.length||cell.col+cell.colSpan>columns)return fallback();
      previous=cell.col;
      for(let y=r;y<r+cell.rowSpan;y++)for(let x=cell.col;x<cell.col+cell.colSpan;x++){
        if(covered[y][x])return fallback();covered[y][x]=true;
      }
    }
  }
  return covered.every(row=>row.every(Boolean))?rows:fallback();
}
