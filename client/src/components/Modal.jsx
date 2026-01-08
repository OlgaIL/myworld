function Modal({ src, onClose }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__content" onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose}>✕</button>
        <img src={src} className="modal__image" alt="" />
      </div>
    </div>
  );
}

export default Modal;
