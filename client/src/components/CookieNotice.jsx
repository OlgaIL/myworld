import { useState } from "react";
import { Link } from "react-router-dom";

const COOKIE_NOTICE_KEY = "word2you_cookie_notice_accepted";

function CookieNotice() {
  const [visible, setVisible] = useState(() => localStorage.getItem(COOKIE_NOTICE_KEY) !== "true");

  function acceptCookies() {
    localStorage.setItem(COOKIE_NOTICE_KEY, "true");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="cookie-notice" role="region" aria-label="Уведомление о cookie">
      <p>
        Мы используем cookie, чтобы сайт работал корректно, сохранял вашу сессию и помогал нам улучшать сервис
        с помощью аналитики.
      </p>
      <div className="cookie-notice__actions">
        <Link className="cookie-notice__link" to="/privacy">
          Подробнее
        </Link>
        <button className="cookie-notice__button" type="button" onClick={acceptCookies}>
          Понятно
        </button>
      </div>
    </div>
  );
}

export default CookieNotice;
