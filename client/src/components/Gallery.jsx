import { useEffect, useState } from "react";
import { getPhotoInfo } from "../services/api";

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

function getStatusMeta(status) {
  if (status === "processing") {
    return {
      label: "Обработка",
      className: "gallery__status-badge gallery__status-badge--processing"
    };
  }

  if (status === "processed") {
    return {
      label: "Готово",
      className: "gallery__status-badge gallery__status-badge--processed"
    };
  }

  if (status === "no_text") {
    return {
      label: "Текст не найден",
      className: "gallery__status-badge gallery__status-badge--warning"
    };
  }

  if (status === "error") {
    return {
      label: "Ошибка",
      className: "gallery__status-badge gallery__status-badge--error"
    };
  }

  return null;
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

function Gallery({ photos, onOpen, onDelete }) {
  const [infoMap, setInfoMap] = useState({});
  const [expandedTextMap, setExpandedTextMap] = useState({});
  const [copiedMap, setCopiedMap] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

    async function hydratePhotoInfo() {
      const photosToRefresh = photos.filter((photo) => {
        const info = infoMap[photo.name];

        if (!info) {
          return true;
        }

        return info.status === "uploaded" || info.status === "processing";
      });

      if (photosToRefresh.length === 0) {
        return;
      }

      for (const photo of photosToRefresh) {
        try {
          const info = await getPhotoInfo(photo.name);

          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: info.status,
              title: info.title || "",
              summary: info.summary || "",
              text: info.text || "",
              tags: Array.isArray(info.tags) ? info.tags : [],
              error: info.error || null,
              createdAt: info.createdAt || null
            }
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }

          setInfoMap((prev) => ({
            ...prev,
            [photo.name]: {
              status: "error",
              error: error.message
            }
          }));
        }
      }
    }

    timeoutId = setTimeout(hydratePhotoInfo, 800);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [photos, infoMap]);

  async function handleCopy(key, text) {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Не удалось скопировать текст");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await onDelete(pendingDelete);
    setPendingDelete(null);
  }

  function toggleText(name) {
    setExpandedTextMap((prev) => ({
      ...prev,
      [name]: !prev[name]
    }));
  }

  function renderIconButton({ className = "", label, title, onClick, children }) {
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

  if (photos.length === 0) {
    return <p className="gallery__empty">Пока тут пусто. Загрузите ваши фото.</p>;
  }

  return (
    <>
      <section className="gallery">
        {photos.map((photo) => {
          const info = infoMap[photo.name];
          const summaryCopied = copiedMap[`${photo.name}-summary`];
          const textCopied = copiedMap[`${photo.name}-text`];
          const isExpanded = expandedTextMap[photo.name];
          const statusMeta = getStatusMeta(info?.status);
          const createdAtLabel = formatCreatedAt(info?.createdAt);

          return (
            <article className="gallery__item" key={photo.name}>
              {renderIconButton({
                className: "gallery__delete-button",
                label: "Удалить фото",
                title: "Удалить фото",
                onClick: () => setPendingDelete(photo.name),
                children: <CloseIcon />
              })}

              <div className="gallery__top">
                <div className="gallery__preview">
                  <img
                    src={photo.url}
                    className="gallery__image"
                    alt=""
                    onClick={() => onOpen(photo.name)}
                  />
                  <div className="gallery__preview-overlay" onClick={() => onOpen(photo.name)}>
                    <span className="gallery__preview-zoom" aria-hidden="true">
                      <ZoomIcon />
                    </span>
                  </div>
                </div>

                <div className="gallery__meta">
                  {statusMeta && <p className={statusMeta.className}>{statusMeta.label}</p>}
                  {createdAtLabel && (
                    <p className="gallery__date" title={`Загружено: ${createdAtLabel}`}>
                      {createdAtLabel}
                    </p>
                  )}
                </div>
              </div>

              <div className="gallery__content">
                {info?.status === "processed" && (
                  <>
                    <h4>{info.title}</h4>

                    <div className="gallery__summary-row">
                      <p>{info.summary}</p>
                      {info.summary &&
                        renderIconButton({
                          label: summaryCopied ? "Summary скопирован" : "Скопировать summary",
                          title: summaryCopied ? "Summary скопирован" : "Скопировать summary",
                          onClick: () => handleCopy(`${photo.name}-summary`, info.summary),
                          children: <CopyIcon />
                        })}
                    </div>

                    <div className="gallery__tags">
                      {info.tags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>

                    {info.text && (
                      <div className="gallery__text-section">
                        <div className="gallery__text-actions">
                          {renderIconButton({
                            label: isExpanded ? "Скрыть текст" : "Показать текст",
                            title: isExpanded ? "Скрыть текст" : "Показать текст",
                            onClick: () => toggleText(photo.name),
                            children: isExpanded ? <EyeOffIcon /> : <EyeIcon />
                          })}
                          {isExpanded &&
                            renderIconButton({
                              label: textCopied ? "Текст скопирован" : "Скопировать текст",
                              title: textCopied ? "Текст скопирован" : "Скопировать текст",
                              onClick: () => handleCopy(`${photo.name}-text`, info.text),
                              children: <CopyIcon />
                            })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {info?.status === "no_text" && <p>Текст не найден.</p>}

                {info?.status === "error" && (
                  <>
                    <p>Ошибка обработки.</p>
                    {info.error && <p>{info.error}</p>}
                  </>
                )}
              </div>

              {info?.status === "processed" && isExpanded && (
                <p className="gallery__text-block">{info.text}</p>
              )}
            </article>
          );
        })}
      </section>

      {pendingDelete && (
        <div className="confirm-modal" onClick={() => setPendingDelete(null)}>
          <div className="confirm-modal__content" onClick={(event) => event.stopPropagation()}>
            <h3 className="confirm-modal__title">Удалить фото?</h3>
            <p className="confirm-modal__text">Это действие нельзя отменить.</p>
            <div className="confirm-modal__actions">
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--secondary"
                onClick={() => setPendingDelete(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="confirm-modal__button confirm-modal__button--danger"
                onClick={confirmDelete}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Gallery;
