import { getGuestDocumentStatusMeta } from "../constants/documentStatuses";
import { getGuestDocumentFileUrl } from "../services/api";

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

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })
    .format(new Date(value))
    .replace(".", "");
}

function GuestDocumentCard({ document, onOpen, onOpenDocument, onUploadAnother }) {
  const statusMeta = getGuestDocumentStatusMeta(document.status);
  const fileUrl = getGuestDocumentFileUrl(document.id, document.updatedAt || document.filename);
  const createdAtLabel = formatCreatedAt(document.createdAt);
  const readableText = document.cleanText || document.text || "";
  const hasReadableText = Boolean(readableText.trim());
  const canOpenDocument = (document.status === "processed" || document.status === "claimed") && hasReadableText;
  const canUploadAnother = document.status === "no_text" || document.status === "error";
  const hasTags = Array.isArray(document.tags) && document.tags.length > 0;

  function handleCardClick() {
    if (canOpenDocument) {
      onOpenDocument(document);
    }
  }

  return (
    <article
      className={`gallery__item ${canOpenDocument ? "gallery__item--clickable" : ""}`}
      onClick={handleCardClick}
    >
      <div className="gallery__meta">
        {createdAtLabel && <p className="gallery__date">{createdAtLabel}</p>}
        <p className={`gallery__status-badge ${statusMeta.badgeClassName}`}>
          {statusMeta.label}
        </p>
      </div>

      <div className="gallery__body">
        <div className="gallery__content">
          {(document.status === "processed" || document.status === "claimed") && (
            <>
              <h4>{document.title || "Запись"}</h4>

              {document.summary ? (
                <div className="gallery__summary-row">
                  <p>{document.summary}</p>
                </div>
              ) : (
                <p>{readableText || statusMeta.emptyText}</p>
              )}

              {document.category && (
                <div className="gallery__ai-meta">
                  <span className="gallery__ai-meta-button">{document.category}</span>
                </div>
              )}

              {document.notes && <p className="gallery__ai-note">{document.notes}</p>}

              {hasTags && (
                <div className="gallery__tags">
                  {document.tags.map((tag) => (
                    <span className="gallery__tag-button" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          {document.status === "no_text" && (
            <>
              <p>
                Текст не найден.
                <br />
                Можно загрузить другую запись.
              </p>
            </>
          )}

          {document.status === "error" && (
            <>
              <p>
                Ошибка обработки.
                <br />
                Можно загрузить другую запись.
              </p>
              {document.error && <p>{document.error}</p>}
            </>
          )}

          {hasReadableText && (
            <div className="gallery__text-section">
              <div className="gallery__text-actions">
                <button
                  className="gallery__open-document"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDocument(document);
                  }}
                >
                  Открыть текст
                </button>
              </div>
            </div>
          )}

          {canUploadAnother && (
            <div className="gallery__text-section">
              <div className="gallery__text-actions">
                <button
                  className="gallery__open-document"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUploadAnother(document.id);
                  }}
                >
                  Загрузить другую
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="gallery__preview">
          <img
            src={fileUrl}
            className="gallery__image"
            alt=""
            onClick={(event) => {
              event.stopPropagation();
              onOpen(fileUrl);
            }}
          />

          <div
            className="gallery__preview-overlay"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(fileUrl);
            }}
          >
            <span className="gallery__preview-zoom" aria-hidden="true">
              <ZoomIcon />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default GuestDocumentCard;
