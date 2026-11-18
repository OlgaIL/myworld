import { useEffect, useRef } from "react";
import "./ArchiveBulkActions.css";

export default function DocumentActionDialog({title,children,onClose,footer,busy=false,scrollBody=false}) {
  const ref=useRef(null);
  useEffect(()=>{const previous=document.activeElement;ref.current?.focus();return()=>previous?.focus();},[]);
  return <div className="confirm-modal" onClick={()=>{if(!busy)onClose();}} onKeyDown={event=>{
    if(event.key==="Escape"&&!busy)onClose();
    if(event.key==="Tab"){
      const nodes=Array.from(ref.current.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex='0']"));
      if(!nodes.length){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===nodes[0]||document.activeElement===ref.current)){event.preventDefault();nodes.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}
    }
  }}><section className={`confirm-modal__content archive-delete-dialog${scrollBody?" document-action-dialog--scroll-body":""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} onClick={e=>e.stopPropagation()}>
    <h3 className="confirm-modal__title">{title}</h3>{scrollBody?<div className="document-action-dialog__body" role="region" aria-label="Список документов из архива" tabIndex={0}>{children}</div>:children}<div className="confirm-modal__actions">{footer}</div>
  </section></div>;
}
