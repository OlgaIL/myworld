import { memo } from "react";
import { getPhotoStatusMeta } from "../constants/documentStatuses";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
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
  onOpen,
  onOpenDocument,
  onRequestDelete,
  onSelectCategory,
  onSelectTag,
}) {
  const statusMeta = getPhotoStatusMeta(info?.status);
  const createdAtLabel = formatCreatedAt(info?.createdAt);
  const readableText = info?.cleanText || info?.text || "";
  const isPendingUpload = Boolean(photo.isPendingUpload);
  const hasReadableText = Boolean(readableText.trim());
  const canOpenDocument = !isPendingUpload && Boolean(info) && hasReadableText;
  const canDeleteFromContent = !isPendingUpload && (info?.status === "no_text" || info?.status === "error");

  function handleCardClick() {
    if (canOpenDocument) {
      onOpenDocument(photo, info);
    }
  }

  return (
    <article
      className={`gallery__item ${isPendingUpload ? "gallery__item--uploading" : ""} ${canOpenDocument ? "gallery__item--clickable" : ""}`}
      onClick={handleCardClick}
    >
      {!isPendingUpload && (
        <IconButton
          className="gallery__delete-button"
          label="Удалить фото"
          title="Удалить фото"
          onClick={(event) => {
            event.stopPropagation();
            onRequestDelete(photo.name);
          }}
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
              <p>{uploadMessage || "Загружаем документ..."}</p>
            </>
          )}

          {info?.status === "processed" && (
            <>
              <h4>{info.title}</h4>

              <div className="gallery__summary-row">
                <p>{info.summary}</p>
              </div>

              {info.category && (
                <div className="gallery__ai-meta">
                  <button
                    className="gallery__ai-meta-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectCategory?.(info.category);
                    }}
                  >
                    {info.category}
                  </button>
                </div>
              )}

              {info.notes && <p className="gallery__ai-note">{info.notes}</p>}

              <div className="gallery__tags">
                {info.tags.map((tag) => (
                  <button
                    className="gallery__tag-button"
                    type="button"
                    key={tag}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectTag?.(tag);
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>

            </>
          )}

          {!isPendingUpload && info?.status === "no_text" && (
            <>
              <p>
                Текст не найден.
                <br />
                Можно удалить и загрузить другой документ.
              </p>
            </>
          )}

          {!isPendingUpload && info?.status === "error" && (
            <>
              <p>
                Ошибка обработки.
                <br />
                Можно удалить и загрузить другой документ.
              </p>
              {info.error && <p>{info.error}</p>}
            </>
          )}

          {(hasReadableText || canDeleteFromContent) && (
            <div className="gallery__text-section">
              <div className="gallery__text-actions">
                {hasReadableText && (
                  <button
                    className="gallery__open-document"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDocument(photo, info);
                    }}
                  >
                    Открыть текст
                  </button>
                )}
                {canDeleteFromContent && (
                  <button
                    className="gallery__open-document"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDelete(photo.name);
                    }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="gallery__preview">
          <img
            src={photo.url}
            className="gallery__image"
            alt=""
            onClick={(event) => {
              event.stopPropagation();
              if (!isPendingUpload) {
                onOpen(photo.name);
              }
            }}
          />
          {isPendingUpload ? (
            <div className="gallery__upload-overlay">
              <div className="gallery__upload-spinner" aria-hidden="true" />
            </div>
          ) : (
            <div
              className="gallery__preview-overlay"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(photo.name);
              }}
            >
              <span className="gallery__preview-zoom" aria-hidden="true">
                <ZoomIcon />
              </span>
            </div>
          )}
        </div>
      </div>

    </article>
  );
}

function arePhotoCardPropsEqual(prev, next) {
  return (
    prev.photo?.name === next.photo?.name &&
    prev.photo?.url === next.photo?.url &&
    prev.photo?.isPendingUpload === next.photo?.isPendingUpload &&
    prev.info === next.info &&
    prev.uploadMessage === next.uploadMessage &&
    prev.onOpen === next.onOpen &&
    prev.onOpenDocument === next.onOpenDocument &&
    prev.onRequestDelete === next.onRequestDelete &&
    prev.onSelectCategory === next.onSelectCategory &&
    prev.onSelectTag === next.onSelectTag
  );
}

export default memo(PhotoCard, arePhotoCardPropsEqual);
