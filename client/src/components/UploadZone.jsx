function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function UploadZone({
  title,
  description,
  footnote,
  uploading = false,
  disabled = false,
  onUpload
}) {
  return (
    <button
      className="upload-zone"
      type="button"
      onClick={() => onUpload()}
      disabled={disabled}
      aria-label={uploading ? "Загрузка записи" : title}
    >
      <span className="upload-zone__plus" aria-hidden="true">
        <PlusIcon />
      </span>
      <span className="upload-zone__title">
        {uploading ? "Загружаем запись..." : title}
      </span>
      {!uploading && <span className="upload-zone__action">или выберите файл</span>}
      <span className="upload-zone__description">{description}</span>
      <span className="upload-zone__formats">JPEG, PNG, WEBP до 20 МБ</span>
      {footnote && <span className="upload-zone__footnote">{footnote}</span>}
    </button>
  );
}

export default UploadZone;
