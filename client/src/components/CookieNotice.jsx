import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INSPECTLET_CONSENT_KEY, inspectletController } from "../services/inspectlet";

const COOKIE_NOTICE_KEY = "word2you_cookie_notice_accepted";

function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setVisible(!localStorage.getItem(INSPECTLET_CONSENT_KEY));
      } catch {
        setVisible(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function acceptCookies(granted) {
    inspectletController?.chooseConsent(granted);
    try { localStorage.setItem(COOKIE_NOTICE_KEY, "true"); } catch { /* Optional storage. */ }
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-notice" role="region" aria-label="Уведомление о cookie">
      <p>
        Мы используем cookie, чтобы сайт работал корректно, сохранял вашу сессию и помогал нам улучшать сервис с помощью аналитики.
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
