import { Link } from "react-router-dom";
import AuthMenu from "./AuthMenu";

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

  if (Number(user?.packageRemaining || 0) > 0) {
    return `Пакет · ${user.packageRemaining}/${user.packageQuota} обработок`;
  }

  return `Бесплатный пакет · ${recordsUsed}/${recordLimit} обработок`;
}

function AppHeader({
  user,
  recordsUsed,
  recordLimit,
  authProviders,
  onProviderLogin,
  onLogout,
  profileLinkEnabled = true
}) {
  return (
    <header className="topbar">
      <Link className="header__logo" to="/">
        Word2you <span className="header__logo-accent">Записи</span>
      </Link>

      {!user ? (
        <div className="topbar__actions">
          <Link className="topbar__link" to="/about">
            О проекте
          </Link>
          <AuthMenu providers={authProviders} onProviderLogin={onProviderLogin} />
        </div>
      ) : (
        <div className="profile">
          {user.avatarUrl && (
            <img className="profile__avatar" src={user.avatarUrl} alt={user.displayName} />
          )}
          <div className="profile__meta">
            {profileLinkEnabled ? (
              <Link className="profile__name profile__name--link" to="/account">{user.displayName}</Link>
            ) : (
              <span className="profile__name">{user.displayName}</span>
            )}
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
