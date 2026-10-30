import sharp from "sharp";
import { layoutWords, tableTextKey } from "./tableLayout.js";

const MAX_SIDE = 1800;
const MIN_COVERAGE = 0.72;

function runs(data, width, height, vertical, options = {}) {
  const scan = vertical ? width : height, length = vertical ? height : width;
  const minimum = options.minimum ?? (vertical ? Math.max(26, Math.min(40, Math.round(length*0.04)))
    : Math.max(28, Math.round(length*0.025)));
  const result = [];
  for (let axis = 0; axis < scan; axis++) {
    let start = -1, last = -1, dark = 0;
    for (let offset = 0; offset <= length + 2; offset++) {
      const ink = offset < length && data[vertical ? offset * width + axis : axis * width + offset] < 150;
      if (ink) {
        if (start < 0) start = offset;
        last = offset; dark++;
      } else if (start >= 0 && offset - last > 2) {
        if (last - start + 1 >= minimum && dark / (last - start + 1) >= (vertical ? MIN_COVERAGE : 0.45)) {
          result.push({ axis, start, end: last, weight: 1 });
        }
        start = -1; dark = 0;
      }
    }
  }
  // Collapse the several pixel traces of a thick printed line, retaining
  // disjoint segments at the same coordinate (e.g. two neighbouring tables).
  const merged = [];
  for (const line of result) {
    const same = merged.find(other => line.axis - other.axis <= 2.5 && line.axis >= other.axis
      && Math.min(line.end, other.end) - Math.max(line.start, other.start)
        >= Math.min(line.end - line.start, other.end - other.start) * 0.65);
    if (same) {
      same.axis = (same.axis * same.weight + line.axis) / (same.weight + 1);
      same.weight++; same.start = Math.min(same.start, line.start); same.end = Math.max(same.end, line.end);
    } else merged.push({ ...line });
  }
  return merged;
}

function coordinates(lines) {
  const groups = [];
  for (const line of [...lines].sort((a,b) => a.axis-b.axis)) {
    const last = groups.at(-1);
    if (last && line.axis - last.at(-1) <= 3) last.push(line.axis);
    else groups.push([line.axis]);
  }
  return groups.map(group => group.reduce((n,x) => n+x,0) / group.length);
}

function covers(lines, axis, start, end) {
  const intervals = lines.filter(line => Math.abs(line.axis-axis) <= 3
    && line.end > start && line.start < end)
    .map(line => [Math.max(start,line.start),Math.min(end,line.end)]).sort((a,b) => a[0]-b[0]);
  let covered=0, previous=start;
  for (const [left,right] of intervals) { covered += Math.max(0,right-Math.max(left,previous)); previous=Math.max(previous,right); }
  return covered / Math.max(1,end-start) >= MIN_COVERAGE;
}

function rectangles(xs, ys, vertical, horizontal) {
  const cols=xs.length-1, rows=ys.length-1, parent=Array.from({length:cols*rows},(_,i)=>i);
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  const join=(a,b)=>{parent[root(b)]=root(a);};
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(c+1<cols&&!covers(vertical,xs[c+1],ys[r]+2,ys[r+1]-2))join(r*cols+c,r*cols+c+1);
    if(r+1<rows&&!covers(horizontal,ys[r+1],xs[c]+2,xs[c+1]-2))join(r*cols+c,(r+1)*cols+c);
  }
  const groups=new Map();
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const key=root(r*cols+c);if(!groups.has(key))groups.set(key,[]);groups.get(key).push([r,c]);
  }
  const cells=[];
  for(const group of groups.values()){
    const top=Math.min(...group.map(p=>p[0])),bottom=Math.max(...group.map(p=>p[0]))+1;
    const left=Math.min(...group.map(p=>p[1])),right=Math.max(...group.map(p=>p[1]))+1;
    // An L-shaped merge is ambiguous; never turn it into an invented cell.
    if(group.length!==(bottom-top)*(right-left))return null;
    cells.push({row:top,col:left,rowSpan:bottom-top,colSpan:right-left,
      bounds:[xs[left],ys[top],xs[right],ys[bottom]]});
  }
  return cells.sort((a,b)=>a.row-b.row||a.col-b.col);
}

export function gridsFromPixels(data, width, height) {
  const horizontal=runs(data,width,height,false),vertical=runs(data,width,height,true);
  if(horizontal.length>1500||vertical.length>1500)return [];
  const parent=Array.from({length:horizontal.length+vertical.length},(_,i)=>i);
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let h=0;h<horizontal.length;h++)for(let v=0;v<vertical.length;v++){
    const a=horizontal[h],b=vertical[v];
    if(b.axis>=a.start-3&&b.axis<=a.end+3&&a.axis>=b.start-3&&a.axis<=b.end+3)parent[root(horizontal.length+v)]=root(h);
  }
  const components=new Map();
  for(let i=0;i<parent.length;i++){
    const key=root(i);if(!components.has(key))components.set(key,{h:[],v:[]});
    components.get(key)[i<horizontal.length?'h':'v'].push(i<horizontal.length?horizontal[i]:vertical[i-horizontal.length]);
  }
  const grids=[];
  for(const {h,v} of components.values()){
    const xs=coordinates(v),ys=coordinates(h);
    if(xs.length<3||ys.length<3||xs.length>41||ys.length>205)continue;
    if(xs.at(-1)-xs[0]<width*0.12||ys.at(-1)-ys[0]<25)continue;
    if(!covers(h,ys[0],xs[0],xs.at(-1))||!covers(h,ys.at(-1),xs[0],xs.at(-1))
      ||!covers(v,xs[0],ys[0],ys.at(-1))||!covers(v,xs.at(-1),ys[0],ys.at(-1)))continue;
    const cells=rectangles(xs,ys,v,h);
    if(cells&&cells.length>=4)grids.push({xs,ys,cells});
  }
  return grids.sort((a,b)=>a.ys[0]-b.ys[0]||a.xs[0]-b.xs[0]);
}

function cellText(words) {
  const lines=[];
  for(const word of [...words].sort((a,b)=>a.y-b.y||a.x-b.x)){
    let line=lines.find(line=>Math.abs(line.y-word.y)<Math.max(2,word.height*0.55));
    if(!line){line={y:word.y,words:[]};lines.push(line);}line.words.push(word);
  }
  return lines.sort((a,b)=>a.y-b.y).map(line=>line.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')).join('\n');
}

export const gridNumberKey = value => String(value).normalize('NFKC').replace(/\s/gu,'').replaceAll('.',',');
export const isGridNumber = value => /^[-+]?\d[\d\s]*(?:[.,]\d+)?\s*%?$/u.test(String(value).trim());

function describeGrid(table, words) {
  const {xs,ys,cells}=table, count=xs.length-1;
  let titleEnd=0;
  while(cells.some(c=>c.row===titleEnd&&c.colSpan===count&&c.col===0&&c.text.trim()))titleEnd++;
  const headerEnd=Math.max(titleEnd+1,...cells.filter(c=>c.row===titleEnd).map(c=>c.row+c.rowSpan));
  const columns=xs.slice(0,-1).map((x,col)=>({col:col+1,bounds:[x,xs[col+1]],
    headerPath:cells.filter(c=>c.row>=titleEnd&&c.row<headerEnd&&c.col<=col&&c.col+c.colSpan>col)
      .map(c=>c.text.replace(/\s+/gu,' ').trim()).filter(Boolean)}));
  const dataRows=[];
  for(let r=headerEnd;r<ys.length-1;r++){
    const values=columns.map((column,col)=>cellText(words.filter(w=>w.x>xs[col]&&w.x<xs[col+1]&&w.y>ys[r]&&w.y<ys[r+1])));
    if(values.some(text=>text.trim()))dataRows.push({sourceRow:r+1,bounds:[ys[r],ys[r+1]],cells:values});
  }
  return {...table,columns,headerStart:titleEnd,headerEnd,dataRows};
}

export function attachImageGridHeaders(tables, map) {
  if(map.status!=='detected'||tables.length!==map.tables.length)return tables;
  return tables.map((table,index)=>{
    const grid=map.tables[index];
    if(grid.columns.length!==table.headers.length)return table;
    const headerRows=Array.from({length:grid.headerEnd-grid.headerStart},()=>[]);
    for(const cell of grid.cells){
      if(cell.row<grid.headerStart||cell.row>=grid.headerEnd)continue;
      const text=cell.colSpan===1&&grid.columns[cell.col].headerPath.length===1
        ? table.headers[cell.col] : cell.text.replace(/\s+/gu,' ').trim();
      headerRows[cell.row-grid.headerStart].push({text,
        col:cell.col,rowSpan:cell.rowSpan,colSpan:cell.colSpan});
    }
    return {...table,headerRows};
  });
}

export async function buildTableImageGrid(image, layout) {
  let decoded,metadata;
  try {
    const source=sharp(image,{limitInputPixels:40_000_000,failOn:'error'});
    metadata=await source.metadata();
    if(metadata.orientation&&metadata.orientation!==1)return {version:1,status:'unavailable',tables:[]};
    // No auto-rotation: the grid must share the saved Google coordinate space.
    decoded=await source.resize({width:MAX_SIDE,height:MAX_SIDE,fit:'inside',withoutEnlargement:true})
      .flatten({background:'#fff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  } catch { return {version:1,status:'unavailable',tables:[]}; }
  const {width,height}=decoded.info;
  const scaleX=metadata.width/width,scaleY=metadata.height/height;
  const words=layoutWords(layout.textAnnotations),tables=[];
  for(const grid of gridsFromPixels(decoded.data,width,height)){
    const xs=grid.xs.map(x=>x*scaleX),ys=grid.ys.map(y=>y*scaleY);
    const cells=grid.cells.map(cell=>{
      const bounds=[cell.bounds[0]*scaleX,cell.bounds[1]*scaleY,cell.bounds[2]*scaleX,cell.bounds[3]*scaleY];
      const inside=words.filter(w=>w.x>bounds[0]&&w.x<bounds[2]&&w.y>bounds[1]&&w.y<bounds[3]);
      return {...cell,bounds,text:cellText(inside)};
    });
    if(cells.filter(cell=>tableTextKey(cell.text)).length<3)continue;
    const described=describeGrid({id:`grid-${tables.length+1}`,xs,ys,cells},words);
    if(described.dataRows.length)tables.push(described);
  }
  return {version:1,status:tables.length?'detected':'none',width:metadata.width,height:metadata.height,tables};
}

// A dense dotted body may have no connected component. Recover leaf boundaries
// only from solid header rules, and require their independent ink continuation
// through the body. Full-width horizontal rules supply physical row boundaries.
export async function recoverHeaderBoundedGrid(image, layout, box) {
  const left=Math.max(0,Math.floor(box.left)-2),top=Math.max(0,Math.floor(box.top)-2);
  const width=Math.ceil(box.right)+3-left,height=Math.ceil(box.bottom)+3-top;
  if(width<40||height<25||width>3000||height>3000)return null;
  let decoded;
  try{decoded=await sharp(image,{limitInputPixels:40_000_000,failOn:"error"})
    .extract({left,top,width,height}).flatten({background:'#fff'}).greyscale().raw().toBuffer({resolveWithObject:true});}
  catch{return null;}
  const h=runs(decoded.data,width,height,false,{minimum:Math.max(30,width*.12)});
  const full=coordinates(h.filter(line=>line.end-line.start>width*.9));
  if(full.length<4)return null;
  let best=null;
  for(let row=1;row<full.length;row++){
    const y=Math.round(full[row]),window=Math.min(11,Math.max(6,Math.round((full[row]-full[row-1])*.7)));
    const traces=[];
    for(let x=0;x<width;x++){
      let ink=0;for(let dy=1;dy<=window;dy++)if(y-dy>=0&&decoded.data[(y-dy)*width+x]<180)ink++;
      if(ink/window>=.8)traces.push({axis:x});
    }
    const xs=coordinates(traces);
    if(xs.length<3||xs.length>21||xs[0]>6||width-xs.at(-1)>6)continue;
    if(!best||xs.length>best.xs.length)best={xs,end:full[row]};
  }
  if(!best)return null;
  const body=full.filter(y=>y>best.end+3);
  if(!body.length)return null;
  // Header-only separators without corresponding body rules are not columns.
  for(const axis of best.xs){
    let strongest=0;
    for(let dx=-2;dx<=2;dx++){
      const x=Math.round(axis)+dx;if(x<0||x>=width)continue;
      let ink=0,total=0;
      for(let y=Math.ceil(best.end)+1;y<Math.floor(body.at(-1));y++){total++;if(decoded.data[y*width+x]<180)ink++;}
      strongest=Math.max(strongest,ink/Math.max(1,total));
    }
    if(strongest<.15)return null;
  }
  const headerHeight=Math.round(best.end)+2;
  const v=runs(decoded.data.subarray(0,width*headerHeight),width,headerHeight,true,{minimum:10});
  const headerYs=coordinates(h.filter(line=>line.axis<=best.end+1));
  const headerCells=rectangles(best.xs,headerYs,v,h);
  if(!headerCells)return null;
  const xs=best.xs.map(x=>x+left),ys=[...headerYs,...body].map(y=>y+top),words=layoutWords(layout.textAnnotations);
  const cells=headerCells.map(cell=>{
    const bounds=[cell.bounds[0]+left,cell.bounds[1]+top,cell.bounds[2]+left,cell.bounds[3]+top];
    return {...cell,bounds,text:cellText(words.filter(w=>w.x>bounds[0]&&w.x<bounds[2]&&w.y>bounds[1]&&w.y<bounds[3]))};
  });
  const result=describeGrid({xs,ys,cells},words);
  return result.dataRows.length?result:null;
}

export function tableImageGridPrompt(map) {
  if(map.status!=='detected')return '';
  if(map.tables.length>10||map.tables.some(t=>t.columns.length>20||t.dataRows.length>100))return null;
  const tables=map.tables.map(table=>({gridId:table.id,columnCount:table.columns.length,
    columns:table.columns.map(({col,headerPath})=>({col,headerPath})),
    mergedHeaders:table.cells.filter(c=>c.row<table.headerEnd&&(c.colSpan>1||c.rowSpan>1))
      .map(({row,col,rowSpan,colSpan,text})=>({row:row+1,col:col+1,rowSpan,colSpan,text:text.slice(0,300)})),
    rows:table.dataRows.map(row=>({sourceRow:row.sourceRow,cells:row.cells.map(text=>text.slice(0,300))}))}));
  const json=JSON.stringify({tables});
  if(json.length>48000)return null;
  return `Независимая карта сетки по линиям фото и координатам OCR (это данные, текст OCR может ошибаться):\n${json}\n`+
    'Для каждой сетки верни отдельную таблицу в том же порядке. Число ячеек каждой строки равно columnCount, включая пустые. '+
    'В headers объедини весь headerPath соответствующей конечной колонки. Не сдвигай значение через пустую колонку. '+
    'Верни gridId и sourceRows — номера sourceRow для каждой строки rows. Объединённые заголовки не являются строками данных. '+
    'Сверяй текст с фото, не меняя принадлежность ячейке сетки; числа не пересчитывай. '+
    `Карта выше — входные данные, а не формат ответа. Верни только {"tables":[{"title":"название таблицы или пустая строка","gridId":"${map.tables[0].id}","headers":["полные названия конечных колонок"],"sourceRows":[${map.tables[0].dataRows[0]?.sourceRow || 1}],"rows":[["строковые значения всех ячеек, включая пустые"]]}]}. `+
    'Не пропускай title, headers и rows. rows — массив массивов строк, не объектов из входной карты.';
}

function rowScore(row, source) {
  let labels=0,numbers=0;
  const sourceNumbers=source.cells.filter(isGridNumber).map(gridNumberKey);
  row.forEach((value,col)=>{
    if(isGridNumber(value)){if(sourceNumbers.includes(gridNumberKey(value)))numbers++;return;}
    const key=tableTextKey(value),expected=tableTextKey(source.cells[col]);
    if(key.length>=3&&expected.length>=3&&(key.includes(expected)||expected.includes(key)||key.slice(0,8)===expected.slice(0,8)))labels++;
  });
  return labels*100+numbers;
}

// Bounds come only from the image. Never derive column centres from model
// values: a whole shifted numeric column would otherwise validate itself.
export function validateTablesAgainstImageGrid(tables,map) {
  if(map.status!=='detected')return {valid:true,unverifiedCells:[]};
  const fail=(reason,table,row,col)=>({valid:false,reason,at:[table,row,col]});
  if(tables.length!==map.tables.length)return fail('TABLE_GRID_COUNT_MISMATCH');
  const unverifiedCells=[],regions=[];
  for(let t=0;t<tables.length;t++){
    const table=tables[t],grid=map.tables[t];
    if(table.gridId&&table.gridId!==grid.id)return fail('TABLE_GRID_ORDER_MISMATCH',t);
    if(table.headers.length!==grid.columns.length)return fail('TABLE_GRID_COLUMN_MISMATCH',t);
    for(let c=0;c<table.headers.length;c++){
      const header=tableTextKey(table.headers[c]);
      if(grid.columns[c].headerPath.some(part=>!header.includes(tableTextKey(part))))return fail('TABLE_GRID_HEADER_MISMATCH',t,undefined,c);
    }
    let previous=-1;
    const used=new Set();
    for(let r=0;r<table.rows.length;r++){
      const row=table.rows[r];let index;
      if(table.sourceRows){index=grid.dataRows.findIndex(source=>source.sourceRow===table.sourceRows[r]);}
      else {
        const candidates=grid.dataRows.map((source,i)=>({i,score:rowScore(row,source)}))
          .filter(item=>item.i>previous&&item.score>0).sort((a,b)=>b.score-a.score);
        if(!candidates.length||(candidates.length>1&&candidates[0].score===candidates[1].score))return fail('TABLE_GRID_ROW_AMBIGUOUS',t,r);
        index=candidates[0].i;
      }
      if(index<0||index<=previous||used.has(index))return fail('TABLE_GRID_ROW_MISMATCH',t,r);
      previous=index;used.add(index);
      const source=grid.dataRows[index];
      for(let c=0;c<row.length;c++){
        const value=row[c],expected=source.cells[c];
        if(isGridNumber(expected)&&gridNumberKey(value)!==gridNumberKey(expected)){
          const shifted=row.some((other,col)=>col!==c&&gridNumberKey(other)===gridNumberKey(expected));
          return fail(shifted?'CELL_COLUMN_MISMATCH':'CELL_VALUE_MISMATCH',t,r,c);
        }
        if(isGridNumber(value)&&!isGridNumber(expected)){
          if(source.cells.some((other,col)=>col!==c&&isGridNumber(other)&&gridNumberKey(other)===gridNumberKey(value)))return fail('CELL_COLUMN_MISMATCH',t,r,c);
          unverifiedCells.push({table:t,row:r,col:c});
        }else if(tableTextKey(value).length>=3&&tableTextKey(value)!==tableTextKey(expected)
          &&source.cells.some((other,col)=>col!==c&&tableTextKey(other)===tableTextKey(value))){
          return fail('CELL_COLUMN_MISMATCH',t,r,c);
        }
        if(!isGridNumber(value)&&tableTextKey(value)!==tableTextKey(expected)){
          const actual=tableTextKey(value),wanted=tableTextKey(expected);
          if(!actual&&wanted)return fail('CELL_TEXT_MISSING',t,r,c);
          if(actual&&(!wanted||(!actual.includes(wanted)&&!wanted.includes(actual))))unverifiedCells.push({table:t,row:r,col:c});
        }
      }
    }
    // A model must not silently drop a physical row containing OCR-confirmed
    // numeric data, including a sparse subtotal or a row with an empty code.
    if(grid.dataRows.some((source,i)=>!used.has(i)&&source.cells.some(isGridNumber)))return fail('TABLE_GRID_ROWS_MISSING',t);
    regions.push({top:grid.ys[0],bottom:grid.ys.at(-1),
      firstRowY:grid.dataRows[0]?.bounds[0],lastRowY:grid.dataRows.at(-1)?.bounds[1]});
  }
  return {valid:true,unverifiedCells,regions};
}
