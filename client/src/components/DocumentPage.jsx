import { useState } from "react";
import { getPhotoStatusMeta, getTextQualityMeta } from "../constants/documentStatuses";
import { getImprovementRequestStatusMeta } from "../constants/improvementRequestStatuses";
import { buildManualFormattedContent, formatFormattedLine, getFormattedList } from "../utils/formattedText";
import { canShowGuestDocumentSaveCta } from "../utils/guestSaveCta";
import AuthProviderButtons from "./AuthProviderButtons";
import GuestDocumentSaveCta from "./GuestDocumentSaveCta";
import HourglassIcon from "./HourglassIcon";

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

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function getFormattedText(content) {
  return (content?.blocks || []).map((block) => {
    if (block.type === "list") {
      const list = getFormattedList(block);
      return list.items.map((item, index) => (
        list.ordered ? `${list.start + index}. ${formatFormattedLine(item)}` : `- ${formatFormattedLine(item)}`
      )).join("\n");
    }

    return formatFormattedLine(block.text);
  }).filter(Boolean).join("\n\n");
}

function buildFallbackFormattedContent(text) {
  const blocks = String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ type: "paragraph", text: part }));

  return blocks.length > 0 ? { blocks } : null;
}

function renderHighlightedText(value, highlight) {
  const text = String(value || "");
  const phrase = String(highlight || "");
  const searchableText = text.toLocaleLowerCase("ru-RU");
  const searchablePhrase = phrase.toLocaleLowerCase("ru-RU");

  if (!phrase || !searchableText.includes(searchablePhrase)) {
    return text;
  }

  const parts = [];
  let cursor = 0;
  let matchIndex = searchableText.indexOf(searchablePhrase);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(text.slice(cursor, matchIndex));
    }
    parts.push(
      <mark className="document-page__correction-highlight" key={`${matchIndex}-${parts.length}`}>
        {text.slice(matchIndex, matchIndex + phrase.length)}
      </mark>
    );
    cursor = matchIndex + phrase.length;
    matchIndex = searchableText.indexOf(searchablePhrase, cursor);
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function FormattedContent({ content, highlightedText }) {
  return (
    <div className="document-page__formatted-content">
      {content.blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3 key={`${block.type}-${index}`}>
              {renderHighlightedText(formatFormattedLine(block.text), highlightedText)}
            </h3>
          );
        }

        if (block.type === "list") {
          const list = getFormattedList(block);
          const ListTag = list.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={`${block.type}-${index}`}
              {...(list.ordered && list.start !== 1 ? { start: list.start } : {})}
            >
              {list.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {renderHighlightedText(formatFormattedLine(item), highlightedText)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`${block.type}-${index}`}>
            {renderHighlightedText(formatFormattedLine(block.text), highlightedText)}
          </p>
        );
      })}
    </div>
  );
}

function TextCorrections({ corrections, onToggle, onHighlight, updatingId, error }) {
  return (
    <div className="document-page__corrections">
      <p className="document-page__corrections-title">Сделаны замены:</p>
      <div className="document-page__corrections-list" role="list">
        {corrections.map((correction) => {
          const updating = updatingId === correction.id;
          const actionLabel = correction.applied
            ? `Отменить замену «${correction.original}» на «${correction.replacement}»`
            : `Вернуть замену «${correction.original}» на «${correction.replacement}»`;

          return (
            <span
              className={`document-page__correction ${correction.applied ? "" : "document-page__correction--inactive"}`}
              role="listitem"
              key={correction.id}
              onMouseEnter={() => onHighlight?.(correction)}
              onMouseLeave={() => onHighlight?.(null)}
            >
              <span className="document-page__correction-control">
                <button
                  className="document-page__correction-change"
                  type="button"
                  onClick={() => onToggle?.(correction)}
                  disabled={!onToggle || Boolean(updatingId)}
                  title={actionLabel}
                >
                  <span className="document-page__correction-original">{correction.original}</span>
                  <span className="document-page__correction-arrow" aria-hidden="true">→</span>
                  <span className="document-page__correction-replacement">{correction.replacement}</span>
                </button>
                <button
                  className="document-page__correction-toggle"
                  type="button"
                  onClick={() => onToggle?.(correction)}
                  disabled={!onToggle || Boolean(updatingId)}
                  title={actionLabel}
                  aria-label={actionLabel}
                >
                  <span aria-hidden="true">{updating ? "…" : correction.applied ? "↶" : "↷"}</span>
                </button>
              </span>
            </span>
          );
        })}
      </div>
      {error && <p className="document-page__corrections-error">{error}</p>}
    </div>
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
  isAuthenticated = false
}) {
  const [textTabSelection, setTextTabSelection] = useState({ documentId: null, tab: "text" });
  const [correctionHighlight, setCorrectionHighlight] = useState({ documentId: null, correctionId: "" });

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
  const originalText = improvementRequest?.originalCleanText || processedText || ocrText;
  const originalOcrText = improvementRequest?.originalOcrText || ocrText;
  const improvedText = improvementRequest?.status === "improved"
    ? improvementRequest.improvedText || processedText
    : "";
  const enrichmentPending = info?.status === "recognized"
    || (info?.status === "error" && ocrText.trim() && info?.error === "Yandex GPT failed");
  const storedFormattedContent = Array.isArray(info?.formattedContent?.blocks)
    && info.formattedContent.blocks.length > 0
    ? info.formattedContent
    : null;
  const formattedContent = isAuthenticated && !enrichmentPending
    ? improvedText.trim()
      ? buildManualFormattedContent(improvedText)
      : storedFormattedContent || buildFallbackFormattedContent(originalText)
    : null;
  const formattedText = getFormattedText(formattedContent);
  const textVariants = [
    { id: "text", label: "Текст", text: originalText },
    ...(originalOcrText.trim() && originalOcrText.trim() !== originalText.trim()
      ? [{ id: "source", label: "Исходный", text: originalOcrText }]
      : []),
    ...(improvedText.trim() && improvedText.trim() !== originalText.trim()
      ? [{ id: "improved", label: "Улучшенный", text: improvedText }]
      : []),
    { id: "formatted", label: "Оформленный", text: formattedText, formatted: true, locked: !isAuthenticated }
  ];
  const activeTextTab = textTabSelection.documentId === photo.name ? textTabSelection.tab : "text";
  const activeTextVariant = textVariants.find((variant) => variant.id === activeTextTab) || textVariants[0];
  const readableText = activeTextVariant?.text || "";
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
  const corrections = Array.isArray(info?.corrections) ? info.corrections : [];
  const highlightedCorrection = correctionHighlight.documentId === photo.name
    ? corrections.find((correction) => correction.id === correctionHighlight.correctionId)
    : null;
  const highlightedCorrectionText = highlightedCorrection
    ? (highlightedCorrection.applied ? highlightedCorrection.replacement : highlightedCorrection.original)
    : "";
  const showCorrections = info?.hasRecognitionErrors === true
    && corrections.length > 0
    && !["source", "improved"].includes(activeTextVariant.id);
  const handleCorrectionHighlight = (correction) => {
    setCorrectionHighlight({
      documentId: photo.name,
      correctionId: correction?.id || ""
    });
  };

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

          <section className="document-page__text">
            {textVariants.length > 1 && (
              <div className="document-page__text-tabs" role="tablist" aria-label="Варианты текста">
                {textVariants.map((variant) => (
                  <button
                    className={`document-page__text-tab ${activeTextVariant.id === variant.id ? "document-page__text-tab--active" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeTextVariant.id === variant.id}
                    key={variant.id}
                    onClick={() => setTextTabSelection({ documentId: photo.name, tab: variant.id })}
                  >
                    {variant.label}
                    {variant.locked && <LockIcon />}
                  </button>
                ))}
              </div>
            )}

            {activeTextVariant.formatted ? (
              <div className="document-page__formatted">
                {formattedContent ? (
                  <div className="document-page__text-body">
                    <FormattedContent
                      content={formattedContent}
                      highlightedText={highlightedCorrectionText}
                    />
                    <CopyButton
                      label="Скопировать оформленный текст"
                      copied={Boolean(copiedMap?.["text-formatted"])}
                      onClick={() => onCopy("text-formatted", formattedText)}
                    />
                  </div>
                ) : enrichmentPending && isAuthenticated ? (
                  <div className="document-page__format-login">
                    <p>Описание и оформление временно недоступны. Попробуйте повторить обработку.</p>
                  </div>
                ) : (
                  <div className="document-page__format-login">
                    <p>Оформленный вариант доступен после входа.</p>
                    <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} compact />
                  </div>
                )}
              </div>
            ) : (
              <div className="document-page__text-body">
                <p>
                  {readableText
                    ? renderHighlightedText(readableText, highlightedCorrectionText)
                    : "Текст пока не загружен."}
                </p>
                {readableText && (
                  <CopyButton
                    label="Скопировать текст"
                    copied={Boolean(copiedMap?.[`text-${activeTextVariant.id}`])}
                    onClick={() => onCopy(`text-${activeTextVariant.id}`, readableText)}
                  />
                )}
              </div>
            )}

            {!activeTextVariant.formatted && textQualityMeta && (
              <p className="document-page__quality">
                Пометка: {textQualityMeta.label.toLowerCase()}
              </p>
            )}

            {showCorrections && (
              <TextCorrections
                corrections={corrections}
                onToggle={onToggleCorrection}
                onHighlight={handleCorrectionHighlight}
                updatingId={updatingCorrectionId}
                error={correctionError}
              />
            )}
          </section>

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
