import { useState } from "react";
import { Link } from "react-router-dom";

function LegalAgreementModal({ accepting = false, onAccept, onClose }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-modal-title">
      <div className="legal-modal__content">
        <button className="legal-modal__close" type="button" onClick={onClose} aria-label="Закрыть" disabled={accepting}>
          ×
        </button>
        <h2 id="legal-modal-title">Перед началом работы</h2>
        <p>
          Для использования Word2you необходимо принять условия использования сервиса.
        </p>
        <label className="legal-modal__checkbox">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={accepting}
          />
          <span>
            Я принимаю{" "}
            <Link to="/terms" target="_blank" rel="noreferrer">Пользовательское соглашение</Link>, ознакомился с{" "}
            <Link to="/privacy" target="_blank" rel="noreferrer">Политикой обработки персональных данных</Link> и даю{" "}
            <Link to="/consent" target="_blank" rel="noreferrer">Согласие на обработку персональных данных</Link>.
          </span>
        </label>
        <div className="legal-modal__actions">
          <button className="legal-modal__button" type="button" onClick={onAccept} disabled={!accepted || accepting}>
            {accepting ? "Сохраняем..." : "Продолжить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LegalAgreementModal;
