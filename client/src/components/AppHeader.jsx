import { Link } from "react-router-dom";

function formatShortAccessDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function getProfileAccessText(user, recordsUsed, recordLimit) {
  if (user?.unlimitedAccess) {
    return "Безлимитный доступ";
  }

  if (user?.extendedAccessActive && user?.accessExpiresAt) {
    return `Без ограничений до ${formatShortAccessDate(user.accessExpiresAt)}`;
  }

  return `Бесплатный тариф · ${recordsUsed}/${recordLimit} записей`;
}

function AppHeader({ user, recordsUsed, recordLimit, onLogin, onLogout }) {
  return (
    <header className="topbar">
      <h1 className="header__logo">
        Word2you <span className="header__logo-accent">Записи</span>
      </h1>

      {!user ? (
        <div className="topbar__actions">
          <Link className="topbar__link" to="/about">
            О проекте
          </Link>
          <button className="auth-button" type="button" onClick={onLogin}>
            Войти через Google
          </button>
        </div>
      ) : (
        <div className="profile">
          {user.avatarUrl && (
            <img className="profile__avatar" src={user.avatarUrl} alt={user.displayName} />
          )}
          <div className="profile__meta">
            <span className="profile__name">{user.displayName}</span>
            <span className="profile__hint">{getProfileAccessText(user, recordsUsed, recordLimit)}</span>
          </div>
          <button className="profile__logout" type="button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      )}
    </header>
  );
}

export default AppHeader;
