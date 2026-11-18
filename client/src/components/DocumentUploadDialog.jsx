import DocumentActionDialog from "./DocumentActionDialog";

export default function DocumentUploadDialog({upload}) {
  if(!upload.selection)return null;
  const {selection,chooseMode,confirmUpload,clearSelection,balanceError,limitError}=upload;
  const standalone=!selection.context.mode;
  const multiple=selection.items.length>1;
  return <DocumentActionDialog title={standalone?(multiple?"Как загрузить фотографии?":"Загрузить фото"):selection.mode==="replace"?"Заменить фото":"Добавить страницы"} onClose={clearSelection} footer={<>
    <button className="confirm-modal__button confirm-modal__button--secondary" onClick={clearSelection}>Отмена</button>
    <button className="confirm-modal__button" disabled={Boolean(balanceError||limitError)} onClick={confirmUpload}>Загрузить</button>
  </>}><p>Выбрано {selection.items.length} фото. 1 фото — 1 обработка.</p>
    {standalone&&multiple&&<div className="document-upload-modes"><label><input type="radio" name="upload-mode" checked={selection.mode==="separate"} onChange={()=>chooseMode("separate")} /> Отдельные документы</label><label><input type="radio" name="upload-mode" checked={selection.mode==="group"} onChange={()=>chooseMode("group")} /> Страницы одного документа</label></div>}
    <div className="document-upload-thumbnails">{selection.items.map((item,index)=><figure key={item.name}><img src={item.url} alt={`Фото ${index+1}`} /><figcaption>{index+1}</figcaption></figure>)}</div>
    {selection.mode!=="separate"&&<p>Максимум — {upload.pageLimit} страниц в одном документе.</p>}
    {(balanceError||limitError)&&<p className="document-improvement__error" role="alert">{balanceError||limitError}</p>}
  </DocumentActionDialog>;
}
