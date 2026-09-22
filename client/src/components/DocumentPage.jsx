import { useEffect } from "react";
import { getPhotoStatusMeta, getTextQualityMeta } from "../constants/documentStatuses";
import { getImprovementRequestStatusMeta } from "../constants/improvementRequestStatuses";
import { canShowGuestDocumentSaveCta } from "../utils/guestSaveCta";
import DocumentTextVariants, { CopyButton } from "./DocumentTextVariants";
import GuestDocumentSaveCta from "./GuestDocumentSaveCta";
import HourglassIcon from "./HourglassIcon";
import { trackGoal, trackGoalOnce } from "../services/analytics";

function PostAuthNextStep({ userId, processingOrdinal, onProcessAnother }) {
  useEffect(() => {
    if (userId) {
      trackGoalOnce("post_auth_process_another_view", `${userId}:${processingOrdinal}`, {
        route: "document",
        processing_ordinal: processingOrdinal
      });
    }
  }, [processingOrdinal, userId]);

  return (
    <section className="post-auth-next-step" aria-label="Следующий шаг">
      <h2>Готово — текст сохранён в вашем архиве</h2>
      <p>Теперь можно добавить следующую фотографию.</p>
      <button type="button" onClick={() => {
        try {
          window.sessionStorage.setItem("word2you_post_auth_follow_up", String(processingOrdinal));
        } catch {
          // Measurement must not block the next upload.
        }
        trackGoal("post_auth_process_another_click", {
          route: "document",
          processing_ordinal: processingOrdinal
        });
        onProcessAnother?.();
      }}>
        Обработать ещё фото
      </button>
    </section>
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

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.35-4.35" />
    </svg>
  );
}

function DocumentPage({
  photo,
  info,
  copiedMap,
  onBack,
  onOpenImage,
  onCopy,
  onSelectCategory,
  onSelectTag,
  authProviders = [],
  onProviderLogin,
  improvementRequest = null,
  improvementRequestLoading = false,
  improvementRequestError = "",
  onRequestImprovement,
  onRetryProcessing,
  retryProcessing = false,
  retryProcessingError = "",
  onToggleCorrection,
  updatingCorrectionId = "",
  correctionError = "",
  isAuthenticated = false,
  showPostAuthNextStep = false,
  postAuthUserId = "",
  postAuthProcessingOrdinal = 0,
  onProcessAnother
}) {
  if (!photo || !info) {
    return (
      <main className="document-page">
        <button className="document-page__back" type="button" onClick={onBack}>
          Назад к списку
        </button>
        <p className="document-page__empty">Запись не найдена или еще загружается.</p>
      </main>
    );
  }

  const statusMeta = getPhotoStatusMeta(info?.status);
  const textQualityMeta = getTextQualityMeta(info?.textQuality);
  const createdAtLabel = formatCreatedAt(info?.createdAt);
  const processedText = info?.cleanText || "";
  const ocrText = info?.text || "";
  const enrichmentPending = info?.status === "recognized"
    || (info?.status === "error" && ocrText.trim() && info?.error === "Yandex GPT failed");
  const hasTags = Array.isArray(info?.tags) && info.tags.length > 0;
  const hasSideMeta = Boolean(info?.category || hasTags);
  const showGuestSaveCta = canShowGuestDocumentSaveCta({
    isAuthenticated,
    documentStatus: info?.status,
    recognizedText: processedText || ocrText,
    providers: authProviders,
    onProviderLogin
  });
  const improvementStatusMeta = getImprovementRequestStatusMeta(improvementRequest?.status);
  const improvementAvailable = (
    info?.status === "processed" && info?.hasRecognitionErrors === true
  ) || (
    info?.status === "no_text" && info?.textQuality === "no_meaningful_text"
  );
  const showImprovementSection = improvementAvailable || Boolean(improvementRequest);
  const showInlineImprovementStatus = Boolean(improvementStatusMeta && improvementRequest?.status !== "improved");
  const canRequestImprovement = Boolean(onRequestImprovement)
    && improvementAvailable
    && (!improvementRequest || improvementRequest.status === "cancelled");

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
        {improvementStatusMeta?.cardLabel && (
          <p className={`gallery__improvement-badge gallery__improvement-badge--${improvementStatusMeta.tone}`}>
            {improvementStatusMeta.tone === "pending" && <HourglassIcon />}
            {improvementStatusMeta.cardLabel}
          </p>
        )}
      </div>

      <div className="document-page__layout">
        <section className="document-page__content">
          <div className="document-page__field">
            <h2>{info?.title || "Запись"}</h2>
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

          {info?.notes && <p className="gallery__ai-note">{info.notes}</p>}

          <DocumentTextVariants
            documentId={photo.name}
            info={info}
            improvementRequest={improvementRequest}
            textQualityMeta={textQualityMeta}
            copiedMap={copiedMap}
            onCopy={onCopy}
            authProviders={authProviders}
            onProviderLogin={onProviderLogin}
            onToggleCorrection={onToggleCorrection}
            updatingCorrectionId={updatingCorrectionId}
            correctionError={correctionError}
            isAuthenticated={isAuthenticated}
            enrichmentPending={enrichmentPending}
          />

          {enrichmentPending && onRetryProcessing && (
            <section className="document-improvement document-processing-retry" aria-label="Повторная обработка">
              {retryProcessingError && <p className="document-improvement__error">{retryProcessingError}</p>}
              <button
                className="document-improvement__button"
                type="button"
                onClick={onRetryProcessing}
                disabled={retryProcessing}
              >
                {retryProcessing ? "Повторяем обработку..." : "Повторить обработку"}
              </button>
            </section>
          )}

          {showImprovementSection && (
            <section className="document-improvement" aria-label="Улучшение распознавания">
              {improvementRequestLoading && (
                <p className="document-improvement__loading">Проверяем статус запроса...</p>
              )}

              {!improvementRequestLoading && showInlineImprovementStatus && (
                <div className={`document-improvement__status document-improvement__status--${improvementStatusMeta.tone}`}>
                  <strong>{improvementStatusMeta.label}</strong>
                  <span>{improvementStatusMeta.details}</span>
                </div>
              )}

              {improvementRequestError && (
                <p className="document-improvement__error">{improvementRequestError}</p>
              )}

              {!improvementRequestLoading && canRequestImprovement && (
                <button className="document-improvement__button" type="button" onClick={onRequestImprovement}>
                  Запросить улучшение результата
                </button>
              )}
            </section>
          )}

          {showGuestSaveCta && (
            <GuestDocumentSaveCta
              documentId={info?.id || photo.name}
              documentStatus={info?.status}
              providers={authProviders}
              onProviderLogin={onProviderLogin}
            />
          )}

          {isAuthenticated && showPostAuthNextStep && (
            <PostAuthNextStep
              userId={postAuthUserId}
              processingOrdinal={postAuthProcessingOrdinal}
              onProcessAnother={onProcessAnother}
            />
          )}

        </section>

        <aside className="document-page__side">
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

          {hasSideMeta && (
            <div className="document-page__side-meta">
              {info?.category && (
                <div className="gallery__ai-meta">
                  <button
                    className="gallery__ai-meta-button"
                    type="button"
                    onClick={() => onSelectCategory?.(info.category)}
                  >
                    {info.category}
                  </button>
                </div>
              )}

              {hasTags && (
                <div className="gallery__tags">
                  {info.tags.map((tag) => (
                    <button
                      className="gallery__tag-button"
                      type="button"
                      key={tag}
                      onClick={() => onSelectTag?.(tag)}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

export default DocumentPage;
