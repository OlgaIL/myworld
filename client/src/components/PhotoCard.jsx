import { getPhotoStatusMeta, getTextQualityMeta } from "../constants/documentStatuses";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-4.2 4.7" />
      <path d="M6.7 6.7A18 18 0 0 0 2 12s3.5 6 10 6a10.7 10.7 0 0 0 5.2-1.3" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
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

function formatCreatedAt(value) {
  if (!value) {
    return "";
  }

  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));

  return formatted.replace(".", "");
}

function IconButton({ className = "", label, title, onClick, children }) {
  const classes = ["icon-button", className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      title={title || label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function PhotoCard({
  photo,
  info,
  uploadMessage = "",
  isExpanded,
  summaryCopied,
  textCopied,
  onOpen,
  onRequestDelete,
  onToggleText,
  onCopy
}) {
  const statusMeta = getPhotoStatusMeta(info?.status);
  const textQualityMeta = getTextQualityMeta(info?.textQuality);
  const createdAtLabel = formatCreatedAt(info?.createdAt);
  const readableText = info?.cleanText || info?.text || "";
  const isPendingUpload = Boolean(photo.isPendingUpload);

  return (
    <article className={`gallery__item ${isPendingUpload ? "gallery__item--uploading" : ""}`}>
      {!isPendingUpload && (
        <IconButton
          className="gallery__delete-button"
          label="Удалить фото"
          title="Удалить фото"
          onClick={() => onRequestDelete(photo.name)}
        >
          <CloseIcon />
        </IconButton>
      )}

      <div className="gallery__meta">
        {createdAtLabel && (
          <p className="gallery__date" title={`Загружено: ${createdAtLabel}`}>
            {createdAtLabel}
          </p>
        )}
        {isPendingUpload ? (
          <p className="gallery__status-badge gallery__status-badge--processing">
            Загружается
          </p>
        ) : statusMeta && (
          <p className={`gallery__status-badge ${statusMeta.badgeClassName}`}>
            {statusMeta.label}
          </p>
        )}
      </div>

      <div className="gallery__body">
        <div className="gallery__content">
          {isPendingUpload && (
            <>
              <h4>Новый документ</h4>
              <p>{uploadMessage || "Документ загружается и обрабатывается..."}</p>
            </>
          )}

          {info?.status === "processed" && (
            <>
              <h4>{info.title}</h4>

              <div className="gallery__summary-row">
                <p>{info.summary}</p>
                {info.summary && (
                  <IconButton
                    label={summaryCopied ? "Summary скопирован" : "Скопировать summary"}
                    title={summaryCopied ? "Summary скопирован" : "Скопировать summary"}
                    onClick={() => onCopy(`${photo.name}-summary`, info.summary)}
                  >
                    <CopyIcon />
                  </IconButton>
                )}
              </div>

              {(info.category || textQualityMeta) && (
                <div className="gallery__ai-meta">
                  {info.category && <span>{info.category}</span>}
                  {textQualityMeta && <span>{textQualityMeta.label}</span>}
                </div>
              )}

              {info.notes && <p className="gallery__ai-note">{info.notes}</p>}

              <div className="gallery__tags">
                {info.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>

              {readableText && (
                <div className="gallery__text-section">
                  <div className="gallery__text-actions">
                    <IconButton
                      label={isExpanded ? "Скрыть текст" : "Показать текст"}
                      title={isExpanded ? "Скрыть текст" : "Показать текст"}
                      onClick={() => onToggleText(photo.name)}
                    >
                      {isExpanded ? <EyeOffIcon /> : <EyeIcon />}
                    </IconButton>
                    {isExpanded && (
                      <IconButton
                        label={textCopied ? "Текст скопирован" : "Скопировать текст"}
                        title={textCopied ? "Текст скопирован" : "Скопировать текст"}
                        onClick={() => onCopy(`${photo.name}-text`, readableText)}
                      >
                        <CopyIcon />
                      </IconButton>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {!isPendingUpload && info?.status === "no_text" && <p>Текст не найден.</p>}

          {!isPendingUpload && info?.status === "error" && (
            <>
              <p>Ошибка обработки.</p>
              {info.error && <p>{info.error}</p>}
            </>
          )}
        </div>

        <div className="gallery__preview">
          <img
            src={photo.url}
            className="gallery__image"
            alt=""
            onClick={() => !isPendingUpload && onOpen(photo.name)}
          />
          {isPendingUpload ? (
            <div className="gallery__upload-overlay">
              <div className="gallery__upload-spinner" aria-hidden="true" />
            </div>
          ) : (
            <div className="gallery__preview-overlay" onClick={() => onOpen(photo.name)}>
              <span className="gallery__preview-zoom" aria-hidden="true">
                <ZoomIcon />
              </span>
            </div>
          )}
        </div>
      </div>

      {info?.status === "processed" && isExpanded && readableText && (
        <p className="gallery__text-block">{readableText}</p>
      )}
    </article>
  );
}

export default PhotoCard;
