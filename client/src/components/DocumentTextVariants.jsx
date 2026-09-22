import { useState } from "react";
import { buildManualFormattedContent, formatFormattedLine, getFormattedList } from "../utils/formattedText";
import AuthProviderButtons from "./AuthProviderButtons";

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

function DocumentTextVariants({
  documentId,
  info,
  improvementRequest,
  textQualityMeta,
  copiedMap,
  onCopy,
  authProviders,
  onProviderLogin,
  onToggleCorrection,
  updatingCorrectionId,
  correctionError,
  isAuthenticated,
  enrichmentPending
}) {
  const [tabSelection, setTabSelection] = useState({ documentId: null, tab: "text" });
  const [correctionHighlight, setCorrectionHighlight] = useState({ documentId: null, correctionId: "" });
  const processedText = info?.cleanText || "";
  const ocrText = info?.text || "";
  const originalText = improvementRequest?.originalCleanText || processedText || ocrText;
  const originalOcrText = improvementRequest?.originalOcrText || ocrText;
  const improvedText = improvementRequest?.status === "improved"
    ? improvementRequest.improvedText || processedText
    : "";
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
  const variants = [
    { id: "text", label: "Текст", text: originalText },
    ...(originalOcrText.trim() && originalOcrText.trim() !== originalText.trim()
      ? [{ id: "source", label: "Исходный", text: originalOcrText }]
      : []),
    ...(improvedText.trim() && improvedText.trim() !== originalText.trim()
      ? [{ id: "improved", label: "Улучшенный", text: improvedText }]
      : []),
    { id: "formatted", label: "Оформленный", text: formattedText, formatted: true, locked: !isAuthenticated }
  ];
  const activeTab = tabSelection.documentId === documentId ? tabSelection.tab : "text";
  const activeVariant = variants.find((variant) => variant.id === activeTab) || variants[0];
  const readableText = activeVariant?.text || "";
  const corrections = Array.isArray(info?.corrections) ? info.corrections : [];
  const highlightedCorrection = correctionHighlight.documentId === documentId
    ? corrections.find((correction) => correction.id === correctionHighlight.correctionId)
    : null;
  const highlightedText = highlightedCorrection
    ? (highlightedCorrection.applied ? highlightedCorrection.replacement : highlightedCorrection.original)
    : "";
  const showCorrections = info?.hasRecognitionErrors === true
    && corrections.length > 0
    && !["source", "improved"].includes(activeVariant.id);

  function handleCorrectionHighlight(correction) {
    setCorrectionHighlight({
      documentId,
      correctionId: correction?.id || ""
    });
  }

  return (
    <section className="document-page__text">
      {variants.length > 1 && (
        <div className="document-page__text-tabs" role="tablist" aria-label="Варианты текста">
          {variants.map((variant) => (
            <button
              className={`document-page__text-tab ${activeVariant.id === variant.id ? "document-page__text-tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeVariant.id === variant.id}
              key={variant.id}
              onClick={() => setTabSelection({ documentId, tab: variant.id })}
            >
              {variant.label}
              {variant.locked && <LockIcon />}
            </button>
          ))}
        </div>
      )}

      {activeVariant.formatted ? (
        <div className="document-page__formatted">
          {formattedContent ? (
            <div className="document-page__text-body">
              <FormattedContent content={formattedContent} highlightedText={highlightedText} />
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
              ? renderHighlightedText(readableText, highlightedText)
              : "Текст пока не загружен."}
          </p>
          {readableText && (
            <CopyButton
              label="Скопировать текст"
              copied={Boolean(copiedMap?.[`text-${activeVariant.id}`])}
              onClick={() => onCopy(`text-${activeVariant.id}`, readableText)}
            />
          )}
        </div>
      )}

      {!activeVariant.formatted && textQualityMeta && (
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
  );
}

export { CopyButton };
export default DocumentTextVariants;
