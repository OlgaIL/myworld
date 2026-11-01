import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CLARITY_CONSENT_KEY, clarityController } from "../services/clarity";

const COOKIE_NOTICE_KEY = "word2you_cookie_notice_accepted";

function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setVisible(!localStorage.getItem(CLARITY_CONSENT_KEY));
      } catch {
        setVisible(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function acceptCookies(granted) {
    clarityController?.chooseConsent(granted);
    try { localStorage.setItem(COOKIE_NOTICE_KEY, "true"); } catch { /* Optional storage. */ }
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-notice" role="region" aria-label="Уведомление о cookie">
      <p>
        Мы используем cookie для работы сайта и Яндекс Метрику для аналитики.
        Разрешить Microsoft Clarity записывать действия, загруженные фото, распознанные тексты,
        а также отображаемые имя, почту и аватар аккаунта для проверки качества сервиса?
        Эти данные и содержимое документов будут передаваться Microsoft.
        Поля входа, пароли и коды входа скрыты.
      </p>
      <div className="cookie-notice__actions">
        <Link className="cookie-notice__link" to="/privacy">
          Подробнее
        </Link>
        <button className="cookie-notice__button" type="button" onClick={() => acceptCookies(false)}>
          Без записи визитов
        </button>
        <button className="cookie-notice__button" type="button" onClick={() => acceptCookies(true)}>
          Разрешить запись
        </button>
      </div>
    </div>
  );
}

export default CookieNotice;
