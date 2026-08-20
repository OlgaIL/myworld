import { Link } from "react-router-dom";
import AuthMenu from "./AuthMenu";
import {
  getAvailableProcessingCount,
  getProcessingBalanceProgress
} from "../utils/processingAccessText";

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

  if (Number(user?.packageQuota || 0) > 0) {
    const totalRemaining = getAvailableProcessingCount(user, recordsUsed, recordLimit);
    return {
      label: "Платный пакет",
      details: `доступно ${totalRemaining} обработок`
    };
  }

  return {
    label: "Бесплатный пакет",
    details: `доступно ${getAvailableProcessingCount(user, recordsUsed, recordLimit)} обработок`
  };
}

function AppHeader({
  user,
  recordsUsed,
  recordLimit,
  authProviders,
  onProviderLogin,
  onLogout,
  profileLinkEnabled = true,
  logoLinkEnabled = true
}) {
  const accessText = user ? getProfileAccessText(user, recordsUsed, recordLimit) : null;
  const balanceProgress = user ? getProcessingBalanceProgress(user, recordsUsed, recordLimit) : null;

  return (
    <header className="topbar">
      {logoLinkEnabled ? (
        <Link className="header__logo" to="/">
          Word2you <span className="header__logo-accent">Записи</span>
        </Link>
      ) : (
        <span className="header__logo">
          Word2you <span className="header__logo-accent">Записи</span>
        </span>
      )}

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
            {typeof accessText === "string" ? (
              <span className="profile__hint">{accessText}</span>
            ) : (
              <span className="profile__hint profile__hint--package">
                <span>{accessText.label}</span>
                <span className="profile__hint-separator"> · </span>
                <span>{accessText.details}</span>
              </span>
            )}
            {balanceProgress && (
              <span
                className={`profile__balance profile__balance--${balanceProgress.tone}`}
                role="progressbar"
                aria-label={`Осталось ${balanceProgress.available} из ${balanceProgress.total} обработок`}
                aria-valuemin="0"
                aria-valuemax={balanceProgress.total}
                aria-valuenow={balanceProgress.available}
                title={`Осталось ${balanceProgress.available} из ${balanceProgress.total} обработок`}
              >
                <span
                  className="profile__balance-value"
                  style={{ width: `${balanceProgress.percentage}%` }}
                />
              </span>
            )}
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
