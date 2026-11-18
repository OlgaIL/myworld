import { useState } from "react";
import { createRoot } from "react-dom/client";
import DocumentActionDialog from "../../src/components/DocumentActionDialog";
import "../../src/index.css";
import "../../src/components/MultipageDocument.css";

export default function ArchivePickerCheck(){
  const [open,setOpen]=useState(true),[selected,setSelected]=useState([]);
  return <main className="page"><p>Учебная проверка длинного списка. Рабочий архив не используется.</p>
    <button onClick={()=>setOpen(true)}>Добавить из архива</button>
    {open&&<DocumentActionDialog title="Добавить из архива" scrollBody onClose={()=>setOpen(false)} footer={<>
      <button className="confirm-modal__button confirm-modal__button--secondary" onClick={()=>setOpen(false)}>Отмена</button>
      <button className="confirm-modal__button" disabled={!selected.length} onClick={()=>setOpen(false)}>Добавить</button>
    </>}><p>Только одностраничные документы. Добавление бесплатно. Максимум — 25 страниц.</p>
      {Array.from({length:80},(_,i)=><label className="document-archive-choice" key={i}><input type="checkbox" checked={selected.includes(i)} onChange={()=>setSelected(previous=>previous.includes(i)?previous.filter(id=>id!==i):[...previous,i])}/>Учебный документ {i+1}: договор и приложения</label>)}
    </DocumentActionDialog>}
  </main>;
}
createRoot(document.getElementById("root")).render(<ArchivePickerCheck/>);
