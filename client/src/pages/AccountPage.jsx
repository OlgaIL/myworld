import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AppHeader from "../components/AppHeader";
import PageFooter from "../components/PageFooter";
import { useAuthContext } from "../contexts/AuthContext";
import { getAccessRequests } from "../services/api";

function getAccessTitle(user) {
  if (user?.unlimitedAccess) {
    return "Безлимитный доступ";
  }

  if (user?.extendedAccessActive) {
    return "Расширенный доступ";
  }

  if (Number(user?.packageRemaining || 0) > 0) {
    return "Пакет обработок";
  }

  return "Бесплатный пакет";
}

function getAccessStatus(user) {
  const limit = Number(user?.recordLimit || 0);
  const used = Number(user?.recordsUsed || 0);
  const remaining = Number(user?.recordsRemaining || 0);

  if (user?.unlimitedAccess) {
    return "Без ограничений по обработкам";
  }

  if (user?.extendedAccessActive) {
    return "Новые загрузки доступны";
  }

  if (Number(user?.packageRemaining || 0) > 0) {
    return `Баланс обработок: доступно ${user.packageRemaining} из ${user.packageQuota}`;
  }

  if (!limit) {
    return "Пакет обработок пока не настроен";
  }

  if (remaining <= 0) {
    return `Лимит достигнут · использовано ${used} из ${limit} обработок`;
  }

  return `Использовано ${used} из ${limit} обработок · осталось ${remaining}`;
}

function getPackageTitleFromRequest(request) {
  const match = String(request?.message || "").match(/^Запрос пакета:\s*([^,]+)/);
  return match?.[1]?.trim() || "";
}

function getAccountStatusHeading(user) {
  if (user?.unlimitedAccess || user?.extendedAccessActive) {
    return "Текущий доступ";
  }

  if (Number(user?.packageRemaining || 0) > 0) {
    return "Текущий пакет";
  }

  if (Number(user?.recordsRemaining || 0) <= 0) {
    return "Бесплатный пакет исчерпан";
  }

  return "Бесплатный пакет";
}

function AccountPage() {
  const location = useLocation();
  const { user, authProviders, authLoading, login, loginWithYandex, logout, reloadUser } = useAuthContext();
  const [accessRequests, setAccessRequests] = useState([]);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const requestedPackageFromUrl = new URLSearchParams(location.search).get("requestedPackage");
  const packageActive = Number(user?.packageRemaining || 0) > 0;
  const limitReached = !user?.unlimitedAccess && !user?.extendedAccessActive && !packageActive && Number(user?.recordsRemaining || 0) <= 0;
  const latestPackageRequest = useMemo(
    () =>
      accessRequests.find((request) => {
        const isActiveStatus = request.status === "new" || request.status === "reviewed";
        return isActiveStatus && getPackageTitleFromRequest(request);
      }) || null,
    [accessRequests]
  );
  const requestedPackage = requestedPackageFromUrl || getPackageTitleFromRequest(latestPackageRequest);
  const showRequestedPackage =
    requestedPackage && !user?.unlimitedAccess && !user?.extendedAccessActive;
  const showPackagesLink = !showRequestedPackage && !user?.unlimitedAccess && !user?.extendedAccessActive;
  const accountStatusHeading = user ? getAccountStatusHeading(user) : "";
  const accountAccessTitle = user ? getAccessTitle(user) : "";

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setAccessRequests([]);
      return undefined;
    }

    getAccessRequests()
      .then((requests) => {
        if (!cancelled) {
          setAccessRequests(Array.isArray(requests) ? requests : []);
        }
      })
      .catch((error) => {
        console.error("Access requests load failed:", error);
        if (!cancelled) {
          setAccessRequests([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function refreshAccountStatus() {
    try {
      setStatusRefreshing(true);
      await reloadUser();
      const requests = await getAccessRequests();
      setAccessRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      console.error("Account status refresh failed:", error);
    } finally {
      setStatusRefreshing(false);
    }
  }

  if (authLoading) {
    return <div className="page page--centered">Загрузка...</div>;
  }

  if (!user) {
    return (
      <div className="page">
        <AppHeader
          user={null}
          recordsUsed={0}
          recordLimit={0}
          authProviders={authProviders}
          onLogin={login}
          onYandexLogin={loginWithYandex}
          onLogout={logout}
        />
        <main className="account-page">
          <section className="account-card account-card--signin">
            <h1>Личный кабинет</h1>
            <p>Для доступа к Личному кабинету войдите в аккаунт.</p>
          </section>
        </main>
        <PageFooter />
      </div>
    );
  }

  return (
    <div className="page">
      <AppHeader
        user={user}
        recordsUsed={Number(user.recordsUsed || 0)}
        recordLimit={Number(user.recordLimit || 0)}
        authProviders={authProviders}
        onLogin={login}
        onYandexLogin={loginWithYandex}
        onLogout={logout}
        profileLinkEnabled={false}
      />

      <main className="account-page">
        <section className="account-card account-card--hero">
          <p className="requisites-eyebrow">Личный кабинет</p>
          <h1>{user.displayName || "Пользователь"}</h1>
          {user.email && <p className="account-card__email">{user.email}</p>}
        </section>

        <section className={`account-card ${limitReached && !showRequestedPackage ? "account-card--warning" : ""}`}>
          <h2>{accountStatusHeading}</h2>
          {accountAccessTitle !== accountStatusHeading && <strong>{accountAccessTitle}</strong>}
          <p>{getAccessStatus(user)}</p>
          {!showRequestedPackage && (
            <button
              className="account-refresh-button"
              type="button"
              onClick={refreshAccountStatus}
              disabled={statusRefreshing}
            >
              {statusRefreshing ? "Обновляем..." : "Обновить статус"}
            </button>
          )}
        </section>

        {showRequestedPackage && (
          <section className="account-card account-card--request">
            <h2>Запрошенный пакет</h2>
            <p>Пакет «{requestedPackage}»</p>
            <strong className="account-card__status">Заявка отправлена</strong>
            <p>Мы получили заявку и свяжемся с вами. На вашу почту отправлена инструкция по оплате.</p>
            <button
              className="account-refresh-button"
              type="button"
              onClick={refreshAccountStatus}
              disabled={statusRefreshing}
            >
              {statusRefreshing ? "Обновляем..." : "Обновить статус"}
            </button>
          </section>
        )}

        {showPackagesLink && (
          <nav className="account-actions" aria-label="Действия личного кабинета">
            <Link className="account-link" to="/packages">
              {limitReached ? "Выбрать пакет" : packageActive ? "Пополнить пакет" : "Посмотреть другие пакеты"}
            </Link>
          </nav>
        )}
      </main>

      <PageFooter />
    </div>
  );
}

export default AccountPage;
