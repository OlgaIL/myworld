import { useEffect, useState } from "react";
import { getPhotoInfo, processPhoto } from "../services/api";

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

function Gallery({ photos, processingAllowed, onOpen, onDelete }) {
  const [infoMap, setInfoMap] = useState({});
  const [processingMap, setProcessingMap] = useState({});
  const [expandedTextMap, setExpandedTextMap] = useState({});
  const [copiedMap, setCopiedMap] = useState({});

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
              error: info.error || null
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

  async function handleProcess(name) {
    try {
      setProcessingMap((prev) => ({ ...prev, [name]: true }));
      setInfoMap((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          status: "processing",
          error: null
        }
      }));

      await processPhoto(name);
      const info = await getPhotoInfo(name);

      setInfoMap((prev) => ({
        ...prev,
        [name]: {
          status: info.status,
          title: info.title || "",
          summary: info.summary || "",
          text: info.text || "",
          tags: Array.isArray(info.tags) ? info.tags : [],
          error: info.error || null
        }
      }));
    } catch (error) {
      console.error(error);

      setInfoMap((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          status: "error",
          error: error.message
        }
      }));
    } finally {
      setProcessingMap((prev) => ({ ...prev, [name]: false }));
    }
  }

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

  function toggleText(name) {
    setExpandedTextMap((prev) => ({
      ...prev,
      [name]: !prev[name]
    }));
  }

  function renderIconButton({ label, title, onClick, children }) {
    return (
      <button
        type="button"
        className="icon-button"
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
    <section className="gallery">
      {photos.map((photo) => {
        const info = infoMap[photo.name];
        const summaryCopied = copiedMap[`${photo.name}-summary`];
        const textCopied = copiedMap[`${photo.name}-text`];
        const isExpanded = expandedTextMap[photo.name];

        return (
          <div className="gallery__item" key={photo.name}>
            <img
              src={photo.url}
              className="gallery__image"
              alt=""
              onClick={() => onOpen(photo.name)}
            />

            <div className="gallery__primary-actions">
              <button type="button" onClick={() => onDelete(photo.name)}>
                Удалить
              </button>
              {processingAllowed && (
                <button
                  type="button"
                  onClick={() => handleProcess(photo.name)}
                  disabled={processingMap[photo.name]}
                >
                  {processingMap[photo.name] ? "Обработка..." : "Обработать"}
                </button>
              )}
            </div>

            {info?.status === "processing" && <p>Обработка...</p>}

            {info?.status === "processed" && (
              <div className="gallery__details">
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
                      {renderIconButton({
                        label: textCopied ? "Текст скопирован" : "Скопировать текст",
                        title: textCopied ? "Текст скопирован" : "Скопировать текст",
                        onClick: () => handleCopy(`${photo.name}-text`, info.text),
                        children: <CopyIcon />
                      })}
                    </div>

                    {isExpanded && <p className="gallery__text-block">{info.text}</p>}
                  </div>
                )}
              </div>
            )}

            {info?.status === "no_text" && (
              <div className="gallery__details">
                <p>Текст не найден</p>
              </div>
            )}

            {info?.status === "error" && (
              <div className="gallery__details">
                <p>Ошибка обработки</p>
                {info.error && <p>{info.error}</p>}
                {processingAllowed && (
                  <button type="button" onClick={() => handleProcess(photo.name)}>
                    Повторить
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default Gallery;
