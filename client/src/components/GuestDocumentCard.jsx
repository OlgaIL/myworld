import { getGuestDocumentStatusMeta } from "../constants/documentStatuses";
import { getGuestDocumentFileUrl } from "../services/api";

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

function GuestDocumentCard({ document, onOpen, onLogin }) {
  const statusMeta = getGuestDocumentStatusMeta(document.status);
  const fileUrl = getGuestDocumentFileUrl(document.id);
  const createdAtLabel = formatCreatedAt(document.createdAt);

  return (
    <article className="guest-card">
      <div className="guest-card__top">
        <button
          type="button"
          className="guest-card__preview"
          onClick={() => onOpen(fileUrl)}
        >
          <img src={fileUrl} alt="" />
        </button>

        <div className="guest-card__meta">
          <p className={`gallery__status-badge ${statusMeta.badgeClassName}`}>
            {statusMeta.label}
          </p>
          {createdAtLabel && <p className="gallery__date">{createdAtLabel}</p>}
        </div>
      </div>

      <div className="guest-card__content">
        <h3 className="guest-card__title">Результат OCR</h3>
        <p className="guest-card__text">
          {document.text || document.error || statusMeta.emptyText}
        </p>
      </div>

      <div className="guest-card__cta">
        <button className="auth-button" type="button" onClick={onLogin}>
          {statusMeta.ctaLabel}
        </button>
        <p className="guest-card__hint">{statusMeta.ctaHint}</p>
      </div>
    </article>
  );
}

export default GuestDocumentCard;
