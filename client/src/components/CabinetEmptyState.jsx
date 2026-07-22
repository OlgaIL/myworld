import UploadZone from "./UploadZone";

function CabinetEmptyState({ uploading, uploadAllowed, onUpload }) {
  return (
    <section className="cabinet-empty-state">
      <UploadZone
        title="Загрузите первую запись"
        description="Фото конспекта, заметки, документа или любого текста — мы превратим его в удобную запись."
        uploading={uploading}
        disabled={uploading || !uploadAllowed}
        onUpload={onUpload}
      />
    </section>
  );
}

export default CabinetEmptyState;
