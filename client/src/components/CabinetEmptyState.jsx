import UploadZone from "./UploadZone";

function CabinetEmptyState({ uploading, uploadAllowed, onUpload, uploadAreaRef }) {
  return (
    <section className="cabinet-empty-state" ref={uploadAreaRef}>
      <UploadZone
        title="Загрузите одно или несколько фото"
        actionLabel="Выбрать фото"
        description={<>Распознаем текст с конспектов, заметок и документов.<br />Каждое фото — отдельная обработка и запись.</>}
        formatsLabel="JPEG, PNG, WEBP и другие · до 10 МБ на файл"
        uploading={uploading}
        disabled={uploading || !uploadAllowed}
        onUpload={onUpload}
      />
    </section>
  );
}

export default CabinetEmptyState;
