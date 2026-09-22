import { useEffect, useRef, useState } from "react";
import { getRotatedImageFit, normalizeRotation } from "../utils/imageRotation";

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
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

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
    rotation: normalizedRotation
  });

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__content">
        <div className="modal__toolbar" aria-label="Управление изображением" onClick={(event) => event.stopPropagation()}>
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

        <div className="modal__image-frame" ref={frameRef}>
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
  );
}

export default Modal;
