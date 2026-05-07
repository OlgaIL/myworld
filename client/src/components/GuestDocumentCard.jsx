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

function GuestDocumentCard({ document, guestAccess, onOpen, onLogin, onUploadAnother }) {
  const statusMeta = getGuestDocumentStatusMeta(document.status);
  const fileUrl = getGuestDocumentFileUrl(document.id);
  const createdAtLabel = formatCreatedAt(document.createdAt);
  const isTextPreviewLimited = document.status === "processed" || document.status === "claimed";
  const canUploadAnother = document.status === "no_text" || document.status === "error";
  const handleCtaClick = canUploadAnother ? onUploadAnother : onLogin;
  const ctaHint =
    document.status === "claimed" && guestAccess?.uploadAllowed
      ? "Документ сохранен в кабинете. Войдите, чтобы открыть его или загрузить новые документы."
      : statusMeta.ctaHint;

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
        <h3 className="guest-card__title">Результат</h3>
        <div className={`guest-card__text ${isTextPreviewLimited ? "guest-card__text--preview" : ""}`}>
          <p>{document.text || document.error || statusMeta.emptyText}</p>
        </div>
      </div>

      <div className="guest-card__cta">
        <button className="auth-button" type="button" onClick={handleCtaClick}>
          {statusMeta.ctaLabel}
        </button>
        <p className="guest-card__hint">{ctaHint}</p>
      </div>
    </article>
  );
}

export default GuestDocumentCard;
