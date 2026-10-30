export function tableTextKey(value) {
  const twins = { а: "a", в: "b", с: "c", е: "e", н: "h", к: "k", м: "m", о: "o", р: "p", т: "t", у: "y", х: "x" };
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]/gu, "").replace(/[авсенкомртух]/gu, letter => twins[letter]);
}

export function layoutWords(annotations) {
  return (annotations || []).slice(1).flatMap((word, index) => {
    const points = word.boundingPoly?.vertices;
    if (!Array.isArray(points) || points.length < 2) return [];
    const xs = points.map(p => Number(p.x || 0)), ys = points.map(p => Number(p.y || 0));
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (![left, right, top, bottom].every(Number.isFinite) || bottom <= top) return [];
    return [{ index: index + 1, text: word.description, key: tableTextKey(word.description),
      left, right, top, bottom, x: (left + right) / 2, y: (top + bottom) / 2, height: bottom - top }];
  });
}

function linesOf(words) {
  const lines = [];
  for (const word of [...words].sort((a,b) => a.y-b.y || a.left-b.left)) {
    let line = lines.find(l => Math.abs(l.y-word.y) <= Math.min(l.height,word.height)*0.55);
    if (!line) { line = { y: word.y, height: word.height, words: [] }; lines.push(line); }
    line.words.push(word);
    line.y = line.words.reduce((n,w) => n+w.y,0)/line.words.length;
  }
  return lines.sort((a,b) => a.y-b.y).map(l => ({ ...l, words:l.words.sort((a,b) => a.left-b.left) }));
}

function matches(lines, key) {
  const found = [];
  if (!key) return found;
  for (const line of lines) for (let start=0;start<line.words.length;start++) {
    let combined = "";
    for (let end=start;end<Math.min(start+12,line.words.length);end++) {
      combined += line.words[end].key;
      if (combined === key) {
        const words = line.words.slice(start,end+1);
        found.push({ x:(words[0].left+words.at(-1).right)/2, y:line.y,
          top:Math.min(...words.map(w=>w.top)), bottom:Math.max(...words.map(w=>w.bottom)), height:line.height }); break;
      }
      if (!key.startsWith(combined)) break;
    }
  }
  return found;
}

const numeric = value => /^[-+]?\d[\d\s.,%]*$/u.test(String(value).trim());
const numberKey = value => String(value).normalize("NFKC").replace(/\s/gu,"").replaceAll(".",",");
function numberMatches(lines,value) {
  const key=numberKey(value),found=[];
  for(const line of lines)for(let start=0;start<line.words.length;start++){
    let combined="";
    for(let end=start;end<Math.min(start+6,line.words.length);end++){
      combined+=numberKey(line.words[end].text);
      if(combined===key){const words=line.words.slice(start,end+1);found.push({x:(words[0].left+words.at(-1).right)/2,
        y:line.y,top:Math.min(...words.map(w=>w.top)),bottom:Math.max(...words.map(w=>w.bottom)),height:line.height});break;}
      if(!key.startsWith(combined))break;
    }
  }
  return found;
}
const blank = value => !tableTextKey(value);
function labelKey(value) {
  const parts=String(value||"").trim().split(/\s+/u);
  return tableTextKey(parts.slice(0,Math.min(2,parts.length)).join(" "));
}
function labelMatches(lines,value) {
  const parts=String(value||"").trim().split(/\s+/u),patterns=[labelKey(value),tableTextKey(parts[0]),
    tableTextKey(parts.slice(-2).join(" ")),tableTextKey(parts.at(-1))];
  const found=patterns.flatMap((key,rank)=>matches(lines,key).map(p=>({...p,rank})));
  const first=tableTextKey(parts[0]);
  // A single spurious OCR character in a word is not evidence that the table
  // row is absent. This applies only to text labels, never to numeric cells.
  if(first.length>=3)for(const line of lines)for(const word of line.words){
    if(word.key.length===first.length+1&&(word.key.endsWith(first)||word.key.startsWith(first)))
      found.push({...word,rank:4});
  }
  return found;
}

// Row bands can contain wrapped cells. Numeric cells must still match literally,
// stay in their columns and occur below the preceding row, including sparse rows.
export function locateTableLayouts(tables, annotations) {
  const words=layoutWords(annotations), lines=linesOf(words), regions=[],unverifiedCells=[];
  if(lines.length<3) return {valid:false,reason:"NO_OCR_LAYOUT"};
  let afterY=-Infinity;
  for(const [tableIndex,table] of tables.entries()) {
    const anchors=[];
    let previousY=afterY;
    for(const [rowIndex,row] of table.rows.entries()) {
      let col=row.findIndex(cell=>!blank(cell)&&!numeric(cell));
      if(col<0) col=row.findIndex(cell=>!blank(cell));
      if(col<0) return {valid:false,reason:"ROW_LAYOUT_MISMATCH",at:[tableIndex,rowIndex]};
      const candidates=(numeric(row[col])?numberMatches(lines,row[col]):labelMatches(lines,row[col])).filter(p=>p.y>previousY+0.5);
      if(!candidates.length) return {valid:false,reason:"ROW_LAYOUT_MISMATCH",at:[tableIndex,rowIndex,"label"]};
      // Check numeric cells near each candidate before choosing repeated labels.
      const scored=candidates.map(p=>{
        let score=(p.rank||0)*0.05,matched=0,expected=0;
        for(let c=0;c<row.length;c++)if(c!==col&&numeric(row[c])){
          expected++;
          const nearby=numberMatches(lines,row[c]).filter(v=>Math.abs(v.y-p.y)<=Math.max(4*p.height,8)
            &&(c<col?v.x<p.x:v.x>p.x));
          if(nearby.length){matched++;score+=Math.min(...nearby.map(v=>Math.max(0,Math.abs(v.y-p.y)/p.height-1)));}
        }
        return {...p,score,matched,expected};
      }).filter(p=>!p.expected||p.matched).sort((a,b)=>a.score-b.score||a.y-b.y);
      const candidate=scored[0];
      if(!candidate) return {valid:false,reason:"ROW_LAYOUT_MISMATCH",at:[tableIndex,rowIndex]};
      anchors.push({...candidate,col});previousY=candidate.y;
    }
    const columnXs=table.headers.map(()=>[]),missing=[];
    let bottom=anchors.at(-1).bottom;
    for(let r=0;r<table.rows.length;r++) {
      const row=table.rows[r], anchor=anchors[r];
      const lower=r? (anchors[r-1].y+anchor.y)/2 : anchor.y-Math.max(2*anchor.height,4);
      const upper=r+1<anchors.length? (anchor.y+anchors[r+1].y)/2 : anchor.y+Math.max(4*anchor.height,8);
      let previousX=-Infinity;
      for(let c=0;c<row.length;c++) {
        const cell=row[c];if(blank(cell))continue;
        const key=numeric(cell)?tableTextKey(cell):c===anchor.col?labelKey(cell):labelKey(cell);
        let options=c===anchor.col?[anchor]:(numeric(cell)?numberMatches(lines,cell):matches(lines,key)).filter(p=>p.y>=lower&&p.y<upper);
        // Long text (e.g. an address) is located by its first word; numbers in
        // dedicated numeric cells never use this relaxed prefix path.
        if(!options.length&&!numeric(cell)) options=matches(lines,tableTextKey(String(cell).trim().split(/\s+/u)[0])).filter(p=>p.y>=lower&&p.y<upper);
        const position=options.filter(p=>p.x>previousX).sort((a,b)=>Math.abs(a.y-anchor.y)-Math.abs(b.y-anchor.y)||a.x-b.x)[0];
        if(!position){
          missing.push({row:r,col:c,lower,upper,numeric:numeric(cell)});continue;
        }
        columnXs[c].push(position.x);previousX=position.x;bottom=Math.max(bottom,position.bottom);
      }
    }
    const firstY=anchors[0].y;
    const headerLines=lines.filter(l=>l.y>afterY&&l.y<firstY);
    const headerMatches=[];
    for(const key of new Set(table.headers.map(h=>tableTextKey(String(h).trim().split(/\s+/u)[0])).filter(Boolean))) {
      const hit=matches(headerLines,key);if(hit.length)headerMatches.push(...hit);
    }
    if(new Set(headerMatches.map(p=>Math.round(p.x))).size<2) return {valid:false,reason:"HEADER_LAYOUT_MISMATCH",at:[tableIndex]};
    const centers=columnXs.map((positions,c)=>{
      if(positions.length)return positions.reduce((n,x)=>n+x,0)/positions.length;
      if(!missing.some(cell=>cell.col===c))return null;
      const hits=matches(headerLines,tableTextKey(String(table.headers[c]).trim().split(/\s+/u)[0]));
      return hits.length===1?hits[0].x:null;
    });
    let lastCenter=-Infinity;
    for(const center of centers){
      if(center===null)continue;
      if(center<=lastCenter)return {valid:false,reason:"COLUMN_LAYOUT_MISMATCH",at:[tableIndex]};
      lastCenter=center;
    }
    for(const cell of missing){
      const center=centers[cell.col];if(center===null)return {valid:false,reason:"ROW_LAYOUT_MISMATCH",at:[tableIndex,cell.row,cell.col,"missing-center"]};
      let left=-Infinity,right=Infinity;
      for(let c=cell.col-1;c>=0;c--)if(centers[c]!==null){left=(centers[c]+center)/2;break;}
      for(let c=cell.col+1;c<centers.length;c++)if(centers[c]!==null){right=(centers[c]+center)/2;break;}
      const conflicting=cell.numeric&&words.some(w=>w.y>=cell.lower&&w.y<cell.upper&&w.x>left&&w.x<right&&numeric(w.text));
      if(conflicting)return {valid:false,reason:"CELL_VALUE_MISMATCH",at:[tableIndex,cell.row,cell.col]};
      unverifiedCells.push({table:tableIndex,row:cell.row,col:cell.col});
    }
    let top=Math.min(...headerMatches.map(p=>p.top));
    const titleKey=labelKey(table.title);
    const titles=matches(headerLines,titleKey).filter(p=>p.y<=top);
    if(titles.length)top=Math.min(top,titles.at(-1).top);
    // Include wrapped text belonging to these rows, but never the next table.
    regions.push({top,bottom,firstRowY:firstY,lastRowY:anchors.at(-1).y});afterY=bottom;
  }
  return {valid:true,reason:null,regions,unverifiedCells};
}

// Exact word-to-source mapping prevents deletion of prose based on a fuzzy match.
export function tableSourceRanges(layout, regions) {
  const raw=layout.rawText, positions=[], normalized=[];
  for(let i=0;i<raw.length;i++)for(const c of tableTextKey(raw[i])){normalized.push(c);positions.push(i);}
  const key=normalized.join("");let cursor=0;
  const mapped=[];
  for(let index=1;index<layout.textAnnotations.length;index++) {
    const token=tableTextKey(layout.textAnnotations[index].description);if(!token)continue;
    if(!key.startsWith(token,cursor))return null;
    mapped.push({index,start:positions[cursor],end:positions[cursor+token.length-1]+1});cursor+=token.length;
  }
  if(cursor!==key.length)return null;
  const geometry=new Map(layoutWords(layout.textAnnotations).map(w=>[w.index,w]));
  const insideRegion=(g,region)=>g&&g.y>=region.top&&g.y<=region.bottom
    &&(region.left===undefined||g.x>=region.left)&&(region.right===undefined||g.x<=region.right);
  const candidates=[];
  for(const [tableIndex,region] of regions.entries()) {
    const inside=mapped.filter(w=>insideRegion(geometry.get(w.index),region));
    if(!inside.length)return null;
    const start=inside[0].start,end=inside.at(-1).end;
    const from=raw.lastIndexOf("\n",start-1)+1;
    const next=raw.indexOf("\n",end);
    candidates.push({start:from,end:next<0?raw.length:next,tableIndexes:[tableIndex]});
  }
  // OCR can read neighbouring grids column-by-column and interleave their
  // strings. Merge overlapping source spans only when every word belongs to
  // these grids; prose between tables must never be swallowed by that merge.
  const ranges=[];
  for(const range of candidates){
    const previous=ranges.at(-1);
    if(previous&&range.start<previous.end){
      previous.start=Math.min(previous.start,range.start);previous.end=Math.max(previous.end,range.end);
      previous.tableIndexes.push(...range.tableIndexes);
    }else ranges.push({...range});
  }
  for(const range of ranges)if(mapped.some(w=>{
    if(w.start<range.start||w.end>range.end)return false;
    const g=geometry.get(w.index);
    return !range.tableIndexes.some(i=>insideRegion(g,regions[i]));
  }))return null;
  return ranges;
}
