import UploadZone from "./UploadZone";

function CabinetEmptyState({ uploading, uploadAllowed, onUpload, uploadAreaRef }) {
  return (
    <section className="cabinet-empty-state" ref={uploadAreaRef}>
      <UploadZone
        title="Загрузите одно или несколько фото"
        actionLabel="Выбрать фото"
        description={<>Распознаем текст с конспектов, заметок и документов.<br />Страницы одного документа или отдельные документы. 1 фото — 1 обработка.</>}
        formatsLabel="JPEG, PNG, WEBP и другие · до 10 МБ на файл"
        uploading={uploading}
        disabled={uploading || !uploadAllowed}
        onUpload={onUpload}
      />
    </section>
  );
}

export default CabinetEmptyState;
