import { getPhotoStatusMeta, getTextQualityMeta } from "../constants/documentStatuses";

function formatCreatedAt(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })
    .format(new Date(value))
    .replace(".", "");
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.35-4.35" />
    </svg>
  );
}

function CopyButton({ label, copied, onClick }) {
  return (
    <button
      className="document-page__copy"
      type="button"
      onClick={onClick}
      title={copied ? "Скопировано" : label}
      aria-label={copied ? "Скопировано" : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function DocumentPage({ photo, info, copiedMap, onBack, onOpenImage, onCopy }) {
  const statusMeta = getPhotoStatusMeta(info?.status);
  const textQualityMeta = getTextQualityMeta(info?.textQuality);
  const createdAtLabel = formatCreatedAt(info?.createdAt);
  const readableText = info?.cleanText || info?.text || "";

  return (
    <main className="document-page">
      <button className="document-page__back" type="button" onClick={onBack}>
        Назад к списку
      </button>

      <div className="document-page__meta">
        {createdAtLabel && <p className="gallery__date">{createdAtLabel}</p>}
        {statusMeta && (
          <p className={`gallery__status-badge ${statusMeta.badgeClassName}`}>
            {statusMeta.label}
          </p>
        )}
      </div>

      <div className="document-page__layout">
        <section className="document-page__content">
          <div className="document-page__field">
            <h2>{info?.title || "Документ"}</h2>
            {info?.title && (
              <CopyButton
                label="Скопировать название"
                copied={Boolean(copiedMap?.title)}
                onClick={() => onCopy("title", info.title)}
              />
            )}
          </div>

          {info?.summary && (
            <div className="document-page__field">
              <p className="document-page__summary">{info.summary}</p>
              <CopyButton
                label="Скопировать краткое описание"
                copied={Boolean(copiedMap?.summary)}
                onClick={() => onCopy("summary", info.summary)}
              />
            </div>
          )}

          {info?.category && (
            <div className="gallery__ai-meta">
              <span>{info.category}</span>
            </div>
          )}

          {info?.notes && <p className="gallery__ai-note">{info.notes}</p>}

          {Array.isArray(info?.tags) && info.tags.length > 0 && (
            <div className="gallery__tags">
              {info.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}

          <section className="document-page__text">
            <div className="document-page__field">
              <h3>Текст</h3>
              {readableText && (
                <CopyButton
                  label="Скопировать текст"
                  copied={Boolean(copiedMap?.text)}
                  onClick={() => onCopy("text", readableText)}
                />
              )}
            </div>
            <p>{readableText || "Текст пока не загружен."}</p>
            {textQualityMeta && (
              <p className="document-page__quality">
                Пометка: {textQualityMeta.label.toLowerCase()}
              </p>
            )}
          </section>
        </section>

        <button
          className="document-page__preview"
          type="button"
          onClick={() => onOpenImage(photo.name)}
        >
          <img src={photo.url} alt="" />
          <span className="document-page__preview-zoom" aria-hidden="true">
            <ZoomIcon />
          </span>
        </button>
      </div>
    </main>
  );
}

export default DocumentPage;
