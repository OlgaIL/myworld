import { useEffect, useState } from "react";
import AuthProviderButtons from "./AuthProviderButtons";

function ImprovementRequestModal({
  requiresAuth = false,
  authProviders = [],
  submitting = false,
  error = "",
  onProviderLogin,
  onSubmit,
  onClose
}) {
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !submitting) {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  function submit(event) {
    event.preventDefault();
    if (!consent || submitting) {
      return;
    }
    onSubmit?.({ comment });
  }

  return (
    <div
      className="improvement-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="improvement-modal-title"
      onClick={() => !submitting && onClose?.()}
    >
      <div className="improvement-modal__content" onClick={(event) => event.stopPropagation()}>
        <button
          className="improvement-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          disabled={submitting}
        >
          ×
        </button>

        {requiresAuth ? (
          <>
            <h2 id="improvement-modal-title">Войдите, чтобы запросить улучшение</h2>
            <p>После входа мы вернём вас к этому документу.</p>
            <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} />
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 id="improvement-modal-title">Запросить улучшение результата</h2>
            <p>
              Мы повторно проверим распознавание и структуру документа. Обычно проверяем в течение нескольких часов,
              в сложных случаях — до 2 рабочих дней.
              Дополнительная обработка не спишется.
            </p>

            <label className="improvement-modal__field">
              <span>Что именно распознано неправильно? <small>Необязательно</small></span>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                rows={4}
                disabled={submitting}
              />
            </label>

            <label className="improvement-modal__consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                disabled={submitting}
              />
              <span>Я согласен передать изображение и результат распознавания специалисту Word2you для проверки.</span>
            </label>

            {error && <p className="improvement-modal__error" role="alert">{error}</p>}

            <button className="improvement-modal__submit" type="submit" disabled={!consent || submitting}>
              {submitting ? "Отправляем..." : "Отправить запрос"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ImprovementRequestModal;
