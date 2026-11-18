import DocumentActionDialog from "./DocumentActionDialog";

export default function ArchiveMergeWarningDialog({message,onClose}) {
  if(!message)return null;
  return <DocumentActionDialog title="Нельзя объединить выбранные документы" onClose={onClose}
    footer={<button className="confirm-modal__button" onClick={onClose}>Понятно</button>}>
    <p>{message}</p>
  </DocumentActionDialog>;
}
