import { useEffect, useRef, useState } from "react";
import { getRotatedImageFit, normalizeRotation } from "../utils/imageRotation";
import "./Modal.css";

function RotateLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7v5h5" />
      <path d="M5.5 16a8 8 0 1 0 .7-9.6L3 9" />
    </svg>
  );
}

function RotateRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 7v5h-5" />
      <path d="M18.5 16a8 8 0 1 1-.7-9.6L21 9" />
    </svg>
  );
}

function Modal({ src, onClose }) {
  const frameRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const updateFrameSize = () => {
      setFrameSize({ width: frame.clientWidth, height: frame.clientHeight });
    };
    updateFrameSize();

    window.addEventListener("resize", updateFrameSize);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateFrameSize);
    observer?.observe(frame);

    return () => {
      window.removeEventListener("resize", updateFrameSize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const normalizedRotation = normalizeRotation(rotation);
  const fit = getRotatedImageFit({
    naturalWidth: imageSize.width,
    naturalHeight: imageSize.height,
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    rotation: normalizedRotation,
    zoom
  });
  const sideways = normalizedRotation % 180 === 90;
  function showWhole() {
    setZoom(1);
    frameRef.current?.scrollTo({ top: 0, left: 0 });
  }

  return (
    <div className="modal modal--zoomable" onClick={onClose}>
      <div className="modal__content" role="dialog" aria-modal="true" aria-label="Просмотр фото" onClick={event => event.stopPropagation()}>
        <div className="modal__toolbar" aria-label="Управление изображением" onClick={(event) => event.stopPropagation()}>
          <button className="modal__tool" type="button" title="Уменьшить" aria-label="Уменьшить" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 1.5))}>−</button>
          <output className="modal__scale" aria-label="Масштаб">{Math.round(fit.scale * 100)}%</output>
          <button className="modal__tool" type="button" title="Увеличить" aria-label="Увеличить" disabled={zoom >= 16} onClick={() => setZoom(value => Math.min(16, value * 1.5))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M7 10h6M10 7v6"/></svg>
          </button>
          <button className="modal__tool" type="button" title="Показать целиком" aria-label="Показать целиком" onClick={showWhole}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
          </button>
          <button
            className="modal__tool"
            type="button"
            onClick={() => setRotation((value) => value - 90)}
            title="Повернуть влево"
            aria-label="Повернуть влево"
          >
            <RotateLeftIcon />
          </button>
          <button
            className="modal__tool"
            type="button"
            onClick={() => setRotation((value) => value + 90)}
            title="Повернуть вправо"
            aria-label="Повернуть вправо"
          >
            <RotateRightIcon />
          </button>
          <button
            className="modal__tool modal__tool--reset"
            type="button"
            onClick={() => setRotation(0)}
            disabled={normalizedRotation === 0}
            title="Сбросить поворот"
            aria-label="Сбросить поворот"
          >
            <span aria-hidden="true">0°</span>
          </button>
          <button className="modal__close" type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="modal__image-frame" ref={frameRef} tabIndex={0} role="region" aria-label="Фото с прокруткой">
          <div className="modal__image-stage" style={{ width: sideways ? fit.height : fit.width, height: sideways ? fit.width : fit.height }}>
          <img
            src={src}
            className="modal__image"
            alt=""
            onClick={(event) => event.stopPropagation()}
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight
              });
            }}
            style={fit.width > 0 ? {
              width: `${fit.width}px`,
              height: `${fit.height}px`,
              maxWidth: "none",
              maxHeight: "none",
              transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg)`
            } : undefined}
          />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Modal;
