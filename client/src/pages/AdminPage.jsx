import { useEffect, useMemo, useRef, useState } from "react";
import AdminAccessRequests from "../components/AdminAccessRequests";
import AdminImprovementRequests from "../components/AdminImprovementRequests";
import AdminProcessingCredits from "../components/AdminProcessingCredits";
import AdminSettingsPanel from "../components/AdminSettingsPanel";
import {
  createAdminManualProcessingCredit,
  getAdminAccessRequests,
  getAdminImprovementRequests,
  getAdminProcessingCredits,
  getAdminSession,
  getAdminSettings,
  getAdminUser,
  getAdminUsers,
  loginAdmin,
  logoutAdmin,
  updateAdminAccessRequestStatus,
  updateAdminImprovementRequestStatus,
  updateAdminUserProcessingAccess
} from "../services/adminApi";
import { getProcessingUsageText } from "../utils/processingAccessText";

const METRIKA_COUNTER_ID = import.meta.env.VITE_YANDEX_METRIKA_ID || "109386353";

function formatCompactDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getAcquisitionSourceLabel(context) {
  const source = String(context?.utm_source || "").toLowerCase();
  if (["yandex-direct", "ya-direct", "yandex_direct"].includes(source)) return "Директ";
  if (!source) return "Не определён";
  return context.utm_source;
}

function getDeviceLabel(user) {
  return [user.firstDeviceType, user.firstDeviceOs, user.firstDeviceBrowser]
    .filter(Boolean)
    .join(" · ") || "—";
}

function getCompactProcessingUsage(user) {
  if (user.processingEnabled) {
    return "безлимит";
  }

  return `${Number(user.processingUsed || 0)}/${Number(user.processingQuota || 0)}`;
}

function getWebvisorUrl() {
  return `https://metrika.yandex.ru/visor?period=week&id=${encodeURIComponent(METRIKA_COUNTER_ID)}`;
}

function formatAccessDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateInputValue(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function addOneMonth(value = new Date()) {
  const date = new Date(value);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function getProductAccessLabel(user) {
  if (user.processingEnabled) {
    return "Безлимитный доступ";
  }

  if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() > Date.now()) {
    return `Без ограничений до ${formatAccessDate(user.accessExpiresAt)}`;
  }

  const remaining = Math.max(Number(user.processingQuota || 0) - Number(user.processingUsed || 0), 0);

  if (remaining > 0) {
    return `Пакет обработок: осталось ${remaining} из ${user.processingQuota}`;
  }

  return "Бесплатный пакет";
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function AdminCopyButton({ label, value }) {
  async function handleCopy() {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
  }

  return (
    <button className="admin-copy-button" type="button" onClick={handleCopy} title={label} aria-label={label}>
      <CopyIcon />
    </button>
  );
}

function AdminLogin({ onLogin }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setLoading(true);
      setError("");
      await loginAdmin({ login, password });
      onLogin();
    } catch (adminError) {
      if (adminError.response?.status === 404) {
        setError("Админка выключена. Проверьте ADMIN_ENABLED и пароль в .env.");
      } else {
        setError("Не получилось войти. Проверьте логин и пароль.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-page admin-page--centered">
      <form className="admin-login" onSubmit={handleSubmit}>
        <div>
          <p className="admin-login__eyebrow">Word2you</p>
          <h1 className="admin-login__title">Панель управления</h1>
        </div>

        <label className="admin-field">
          <span>Логин</span>
          <input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" />
        </label>

        <label className="admin-field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="admin-error">{error}</p>}

        <button className="admin-button admin-button--primary" type="submit" disabled={loading}>
          {loading ? "Проверяем..." : "Войти"}
        </button>
      </form>
    </main>
  );
}

function AdminUsersList({
  users,
  selectedUserId,
  savedUserId,
  requestCountsByUser,
  improvementCountsByUser,
  onSelectUser,
  onShowImprovements
}) {
  return (
    <section className="admin-users">
      <h2>Пользователи</h2>

      {users.length === 0 ? (
        <p className="admin-muted">Пользователей пока нет.</p>
      ) : (
        <div className="admin-users__list">
          {users.map((user) => {
            const improvementCount = improvementCountsByUser.get(user.id) || 0;
            const acquisition = user.acquisitionContext || {};

            return (
            <article
              className={`admin-user-row ${selectedUserId === user.id ? "admin-user-row--active" : ""}`}
              key={user.id}
            >
              <button className="admin-user-row__select" type="button" onClick={() => onSelectUser(user.id)}>
                <span className="admin-user-row__main">
                <span className="admin-user-row__title">
                  <strong>{user.email || user.displayName || `Пользователь ${user.id}`}</strong>
                  {requestCountsByUser.get(user.id) > 0 && (
                    <span className="admin-user-row__request">
                      {requestCountsByUser.get(user.id) === 1 ? "заявка" : `${requestCountsByUser.get(user.id)} заявок`}
                    </span>
                  )}
                </span>
                <span>{user.displayName || "Без имени"}</span>
                {user.authProviders?.length > 0 && (
                  <span className="admin-auth-providers" aria-label="Способы входа">
                    {user.authProviders.map((provider) => (
                      <span className="admin-auth-provider" key={provider}>{provider}</span>
                    ))}
                  </span>
                )}
                </span>
                <span className="admin-user-row__metrics">
                  <span>Регистрация: {formatCompactDateTime(user.createdAt)}</span>
                  <span>Последняя обработка: {formatCompactDateTime(user.lastProcessingAt)}</span>
                  <span>Визиты: —</span>
                  <span>Источник: {getAcquisitionSourceLabel(acquisition)}</span>
                  <span>Фраза: {acquisition.utm_term || "—"}</span>
                  <span>Устройство: {user.firstDeviceType || "—"}</span>
                  <span>Обработки: {getCompactProcessingUsage(user)}</span>
                  <span>
                    Документы: сейчас {user.documentsCount} / создано {user.documentsCreatedTotal} / удалено {user.documentsDeletedTotal}
                  </span>
                </span>
              </button>
              <div className="admin-user-row__actions">
                <button
                  className="admin-user-row__improvement"
                  type="button"
                  onClick={() => onShowImprovements(user.id)}
                >
                  Улучшения: {improvementCount}
                </button>
                <a
                  className={`admin-user-row__webvisor ${user.metrikaClientId ? "" : "admin-user-row__webvisor--disabled"}`}
                  href={user.metrikaClientId ? getWebvisorUrl() : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!user.metrikaClientId}
                  onClick={(event) => {
                    if (!user.metrikaClientId) event.preventDefault();
                  }}
                >
                  Вебвизор
                </a>
                {savedUserId === user.id && (
                  <span className="admin-user-row__saved">✓ изменения сохранены</span>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AdminUserDetails({ user, onSaved }) {
  const [processingEnabled, setProcessingEnabled] = useState(false);
  const [processingQuota, setProcessingQuota] = useState(0);
  const [processingUsed, setProcessingUsed] = useState(0);
  const [accessExpiresAt, setAccessExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    setProcessingEnabled(user.processingEnabled);
    setProcessingQuota(user.processingQuota);
    setProcessingUsed(user.processingUsed);
    setAccessExpiresAt(formatDateInputValue(user.accessExpiresAt));
    setMessage("");
  }, [user]);

  if (!user) {
    return (
      <section className="admin-user-details">
        <p className="admin-muted">Выберите пользователя слева.</p>
      </section>
    );
  }

  async function handleSave(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setMessage("");
      const updatedUser = await updateAdminUserProcessingAccess(user.id, {
        processingEnabled,
        processingQuota,
        processingUsed,
        accessExpiresAt: accessExpiresAt || null
      });
      onSaved(updatedUser);
    } catch {
      setMessage("Не удалось сохранить изменения.");
    } finally {
      setSaving(false);
    }
  }

  function setUnlimited() {
    setProcessingEnabled(true);
  }

  function unsetUnlimited() {
    setProcessingEnabled(false);
  }

  function setTrialLimit() {
    setProcessingEnabled(false);
    setProcessingQuota(5);
    setProcessingUsed(0);
  }

  function extendOneMonth() {
    setAccessExpiresAt(addOneMonth(accessExpiresAt || new Date()));
  }

  function clearAccessDate() {
    setAccessExpiresAt("");
  }

  function resetUsed() {
    setProcessingUsed(0);
  }

  function addPackage(amount) {
    setProcessingEnabled(false);
    setProcessingQuota((currentQuota) => Number(currentQuota || 0) + amount);
  }

  return (
    <section className="admin-user-details">
      <div className="admin-user-details__header">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
        <div>
          <div className="admin-user-details__title-row">
            <h2>{user.email || "Без email"}</h2>
            {user.email && <AdminCopyButton label="Скопировать email" value={user.email} />}
          </div>
          <p>{user.displayName || "Без имени"}</p>
          <div className="admin-auth-providers" aria-label="Способы входа">
            {user.authProviders?.length > 0 ? (
              user.authProviders.map((provider) => (
                <span className="admin-auth-provider" key={provider}>{provider}</span>
              ))
            ) : (
              <span className="admin-muted">Способ входа не определён</span>
            )}
          </div>
        </div>
      </div>

      <div className="admin-stats">
        <div>
          <span>Документы сейчас</span>
          <strong>{user.documentsCount}</strong>
        </div>
        <div>
          <span>Обработано за всё время</span>
          <strong>{user.recordsProcessedTotal}</strong>
        </div>
        <div>
          <span>Регистрация</span>
          <strong>{formatCompactDateTime(user.createdAt)}</strong>
        </div>
        <div>
          <span>Последняя обработка</span>
          <strong>{formatCompactDateTime(user.lastProcessingAt)}</strong>
        </div>
      </div>

      <div className="admin-current-access">
        <span>История документов</span>
        <div className="admin-current-access__value">
          <div>
            <strong>
              Сейчас {user.documentsCount} · создано {user.documentsCreatedTotal} · удалено {user.documentsDeletedTotal}
            </strong>
            {!user.documentsHistoryComplete && (
              <p className="admin-muted">Для старого аккаунта создания восстановлены по текущему архиву, прежние удаления неизвестны.</p>
            )}
          </div>
        </div>
      </div>

      <div className="admin-current-access">
        <span>Текущий доступ</span>
        <div className="admin-current-access__value">
          <div>
            <strong>{getProductAccessLabel({
              ...user,
              processingEnabled,
              processingQuota,
              processingUsed,
              accessExpiresAt
            })}</strong>
            <p className="admin-muted">
              {getProcessingUsageText({
                ...user,
                processingEnabled,
                processingQuota,
                processingUsed,
                accessExpiresAt
              })}
            </p>
          </div>
          <AdminCopyButton
            label="Скопировать статус доступа"
            value={getProductAccessLabel({
              ...user,
              processingEnabled,
              processingQuota,
              processingUsed,
              accessExpiresAt
            })}
          />
        </div>
      </div>

      <div className="admin-current-access">
        <span>Первое привлечение</span>
        <dl className="admin-analytics-details">
          <div><dt>Источник</dt><dd>{getAcquisitionSourceLabel(user.acquisitionContext)}</dd></div>
          <div><dt>Кампания</dt><dd>{user.acquisitionContext?.utm_campaign || "—"}</dd></div>
          <div><dt>Фраза</dt><dd>{user.acquisitionContext?.utm_term || "—"}</dd></div>
          <div><dt>Landing path</dt><dd>{user.acquisitionContext?.landing_path || "—"}</dd></div>
          <div><dt>Устройство</dt><dd>{getDeviceLabel(user)}</dd></div>
        </dl>
        {user.acquisitionContext && (
          <AdminCopyButton
            label="Скопировать полные UTM"
            value={JSON.stringify(user.acquisitionContext)}
          />
        )}
      </div>

      <div className="admin-current-access">
        <span>Яндекс Метрика</span>
        <div className="admin-current-access__value">
          <div>
            <strong>ClientID: {user.metrikaClientId || "ещё не получен"}</strong>
            <p className="admin-muted">Визиты: — · точный подсчёт появится после подключения API Метрики.</p>
          </div>
          {user.metrikaClientId && <AdminCopyButton label="Скопировать ClientID" value={user.metrikaClientId} />}
        </div>
        <a
          className={`admin-button ${user.metrikaClientId ? "" : "admin-button--disabled"}`}
          href={user.metrikaClientId ? getWebvisorUrl() : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!user.metrikaClientId}
          onClick={(event) => {
            if (!user.metrikaClientId) event.preventDefault();
          }}
        >
          Открыть Вебвизор
        </a>
      </div>

      <form className="admin-access-form" onSubmit={handleSave}>
        <label className="admin-checkbox">
          <input
            type="checkbox"
            checked={processingEnabled}
            onChange={(event) => setProcessingEnabled(event.target.checked)}
          />
          <span>Безлимитная обработка</span>
        </label>

        <label className="admin-field">
          <span>Без ограничений до</span>
          <input
            type="date"
            value={accessExpiresAt}
            onChange={(event) => setAccessExpiresAt(event.target.value)}
          />
        </label>

        <div className="admin-access-form__grid">
          <label className="admin-field">
            <span>Всего обработок в пакетах</span>
            <input
              type="number"
              min="0"
              value={processingQuota}
              onChange={(event) => setProcessingQuota(Number(event.target.value || 0))}
            />
          </label>

          <label className="admin-field">
            <span>Использовано из пакетов</span>
            <input
              type="number"
              min="0"
              value={processingUsed}
              onChange={(event) => setProcessingUsed(Number(event.target.value || 0))}
            />
          </label>
        </div>

        <div className="admin-quick-actions">
          <div className="admin-action-group">
            <button className="admin-button" type="button" onClick={() => addPackage(50)}>
              Мини +50
            </button>
            <button className="admin-button" type="button" onClick={() => addPackage(150)}>
              Стандарт +150
            </button>
            <button className="admin-button" type="button" onClick={() => addPackage(500)}>
              Макси +500
            </button>
          </div>
          <div className="admin-action-group">
            <button className="admin-button" type="button" onClick={extendOneMonth}>
              Продлить на 1 месяц
            </button>
            <button className="admin-button" type="button" onClick={clearAccessDate}>
              Сбросить дату
            </button>
          </div>
          <div className="admin-action-group">
            <button className="admin-button" type="button" onClick={setTrialLimit}>
              Лимит 5
            </button>
            <button className="admin-button" type="button" onClick={resetUsed}>
              Сбросить использовано
            </button>
          </div>
          <div className="admin-action-group admin-action-group--right">
            <button className="admin-button" type="button" onClick={setUnlimited}>
              Выдать безлимит
            </button>
            <button className="admin-button" type="button" onClick={unsetUnlimited}>
              Убрать безлимит
            </button>
          </div>
        </div>

        <div className="admin-form-footer">
          <button className="admin-button admin-button--primary" type="submit" disabled={saving}>
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
          {message && (
            <p className={message === "Изменения сохранены." ? "admin-success" : "admin-muted"}>
              {message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

function AdminDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [processingCredits, setProcessingCredits] = useState([]);
  const [improvementRequests, setImprovementRequests] = useState([]);
  const [improvementUserFilterId, setImprovementUserFilterId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [savedUserId, setSavedUserId] = useState(null);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [improvementsLoading, setImprovementsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userDetailsRef = useRef(null);

  const selectedId = selectedUserId;

  useEffect(() => {
    async function loadAdminData() {
      try {
        setLoading(true);
        setRequestsLoading(true);
        setCreditsLoading(true);
        setImprovementsLoading(true);
        setError("");
        const [loadedUsers, loadedRequests, loadedSettings, loadedCredits, loadedImprovements] = await Promise.all([
          getAdminUsers(),
          getAdminAccessRequests(),
          getAdminSettings(),
          getAdminProcessingCredits(),
          getAdminImprovementRequests()
        ]);
        setUsers(loadedUsers);
        setAccessRequests(Array.isArray(loadedRequests) ? loadedRequests : []);
        setSettings(loadedSettings);
        setProcessingCredits(Array.isArray(loadedCredits) ? loadedCredits : []);
        setImprovementRequests(Array.isArray(loadedImprovements) ? loadedImprovements : []);
        setSelectedUserId((current) => current || loadedUsers[0]?.id || null);
      } catch {
        setError("Не удалось загрузить данные админки.");
      } finally {
        setLoading(false);
        setRequestsLoading(false);
        setCreditsLoading(false);
        setImprovementsLoading(false);
      }
    }

    loadAdminData();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!selectedId) {
      setSelectedUser(null);
      return () => {
        cancelled = true;
      };
    }

    async function loadUser() {
      const user = await getAdminUser(selectedId);
      if (cancelled) {
        return;
      }
      setSelectedUser(user);
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const usersCount = users.length;
  const documentsCount = useMemo(() => users.reduce((sum, user) => sum + user.documentsCount, 0), [users]);
  const safeAccessRequests = useMemo(() => (Array.isArray(accessRequests) ? accessRequests : []), [accessRequests]);
  const newAccessRequestsCount = useMemo(
    () => safeAccessRequests.filter((request) => request.status === "new").length,
    [safeAccessRequests]
  );
  const paidCreditsCount = useMemo(
    () => processingCredits.filter((credit) => credit.source === "yookassa").length,
    [processingCredits]
  );
  const newImprovementRequestsCount = useMemo(
    () => improvementRequests.filter((request) => request.status === "submitted").length,
    [improvementRequests]
  );
  const requestCountsByUser = useMemo(() => {
    const counts = new Map();

    safeAccessRequests.forEach((request) => {
      if (!request.userId || request.status !== "new") {
        return;
      }

      counts.set(request.userId, (counts.get(request.userId) || 0) + 1);
    });

    return counts;
  }, [safeAccessRequests]);
  const improvementCountsByUser = useMemo(() => {
    const counts = new Map();

    improvementRequests.forEach((request) => {
      if (!request.userId) {
        return;
      }

      counts.set(request.userId, (counts.get(request.userId) || 0) + 1);
    });

    return counts;
  }, [improvementRequests]);
  const filteredImprovementRequests = useMemo(
    () => improvementUserFilterId
      ? improvementRequests.filter((request) => String(request.userId) === String(improvementUserFilterId))
      : improvementRequests,
    [improvementRequests, improvementUserFilterId]
  );
  const improvementFilterUser = useMemo(
    () => users.find((user) => String(user.id) === String(improvementUserFilterId)) || null,
    [improvementUserFilterId, users]
  );

  function handleSaved(updatedUser) {
    setSelectedUser(null);
    setSelectedUserId(null);
    setSavedUserId(updatedUser.id);
    setUsers((currentUsers) => currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)));

    window.setTimeout(() => {
      setSavedUserId((currentSavedUserId) => (currentSavedUserId === updatedUser.id ? null : currentSavedUserId));
    }, 3500);
  }

  function handleSelectUser(userId) {
    setSavedUserId(null);
    setSelectedUserId(userId);
    setActiveTab("users");
    window.setTimeout(() => {
      userDetailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function handleShowUserImprovements(userId) {
    setImprovementUserFilterId(userId);
    setActiveTab("improvements");
  }

  async function handleMarkRequestReviewed(requestIds) {
    const ids = Array.isArray(requestIds) ? requestIds : [requestIds];
    const updatedRequests = await Promise.all(
      ids.map((requestId) => updateAdminAccessRequestStatus(requestId, "reviewed"))
    );
    const updatedById = new Map(updatedRequests.map((request) => [request.id, request]));

    setAccessRequests((currentRequests) => (
      (Array.isArray(currentRequests) ? currentRequests : [])
        .map((request) => (updatedById.has(request.id) ? updatedById.get(request.id) : request))
    ));
  }

  async function handleGrantPackage(userId, packageTitle, amount, requestIds) {
    if (!userId || !amount) {
      return;
    }

    const creditResult = await createAdminManualProcessingCredit(userId, {
      packageTitle,
      amount,
      note: `Ручное начисление по заявке: пакет «${packageTitle}»`
    });
    const updatedUser = creditResult?.user || await getAdminUser(userId);

    setSelectedUser(updatedUser);
    setSelectedUserId(userId);
    setSavedUserId(userId);
    setUsers((currentUsers) => currentUsers.map((item) => (item.id === userId ? updatedUser : item)));
    setProcessingCredits(Array.isArray(creditResult?.credits) ? creditResult.credits : []);
    await handleMarkRequestReviewed(requestIds);

    window.setTimeout(() => {
      setSavedUserId((currentSavedUserId) => (currentSavedUserId === userId ? null : currentSavedUserId));
    }, 3500);

    console.info(`Granted package ${packageTitle} to user ${userId}`);
  }

  async function handleTakeImprovementInReview(requestId) {
    const updated = await updateAdminImprovementRequestStatus(requestId, "in_review");
    setImprovementRequests((current) => current.map((request) => (
      String(request.id) === String(updated.id) ? { ...request, ...updated } : request
    )));
    return updated;
  }

  function handleCompleteImprovement(updated) {
    setImprovementRequests((current) => current.map((request) => (
      String(request.id) === String(updated.id) ? { ...request, ...updated } : request
    )));
  }

  async function handleLogout() {
    await logoutAdmin();
    onLogout();
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <a className="admin-site-link" href="/" target="_blank" rel="noreferrer">
            Word2you
          </a>
          <h1>Панель управления</h1>
        </div>
        <button className="admin-button" type="button" onClick={handleLogout}>
          Выйти
        </button>
      </header>

      <nav className="admin-tabs" aria-label="Разделы админки">
        <button
          className={`admin-tabs__button ${activeTab === "overview" ? "admin-tabs__button--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("overview")}
        >
          Обзор
        </button>
        <button
          className={`admin-tabs__button ${activeTab === "users" ? "admin-tabs__button--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("users")}
        >
          Пользователи
        </button>
        <button
          className={`admin-tabs__button ${activeTab === "requests" ? "admin-tabs__button--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("requests")}
        >
          Заявки
        </button>
        <button
          className={`admin-tabs__button ${activeTab === "credits" ? "admin-tabs__button--active" : ""}`}
          type="button"
          onClick={() => setActiveTab("credits")}
        >
          Начисления
        </button>
        <button
          className={`admin-tabs__button ${activeTab === "improvements" ? "admin-tabs__button--active" : ""}`}
          type="button"
          onClick={() => {
            setImprovementUserFilterId(null);
            setActiveTab("improvements");
          }}
        >
          Улучшения{newImprovementRequestsCount > 0 ? ` · ${newImprovementRequestsCount}` : ""}
        </button>
      </nav>

      <section className="admin-overview">
        <button type="button" onClick={() => setActiveTab("users")}>
          <span>Пользователи</span>
          <strong>{usersCount}</strong>
        </button>
        <button type="button" onClick={() => setActiveTab("overview")}>
          <span>Записи</span>
          <strong>{documentsCount}</strong>
        </button>
        <button type="button" onClick={() => setActiveTab("requests")}>
          <span>Новые заявки</span>
          <strong>{newAccessRequestsCount}</strong>
        </button>
        <button type="button" onClick={() => setActiveTab("credits")}>
          <span>Оплаты ЮKassa</span>
          <strong>{paidCreditsCount}</strong>
        </button>
        <button type="button" onClick={() => {
          setImprovementUserFilterId(null);
          setActiveTab("improvements");
        }}>
          <span>Новые улучшения</span>
          <strong>{newImprovementRequestsCount}</strong>
        </button>
      </section>

      {loading ? (
        <p className="admin-muted">Загрузка...</p>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : (
        <>
          {activeTab === "overview" && <AdminSettingsPanel settings={settings} />}

          {activeTab === "requests" && (
            <AdminAccessRequests
              requests={safeAccessRequests}
              loading={requestsLoading}
              onGrantPackage={handleGrantPackage}
              onMarkReviewed={handleMarkRequestReviewed}
              onSelectUser={handleSelectUser}
            />
          )}

          {activeTab === "credits" && (
            <AdminProcessingCredits
              credits={processingCredits}
              loading={creditsLoading}
              onSelectUser={handleSelectUser}
            />
          )}

          {activeTab === "improvements" && (
            <AdminImprovementRequests
              requests={filteredImprovementRequests}
              loading={improvementsLoading}
              onTakeInReview={handleTakeImprovementInReview}
              onComplete={handleCompleteImprovement}
              onSelectUser={handleSelectUser}
              filterUser={improvementFilterUser}
              onClearUserFilter={() => setImprovementUserFilterId(null)}
            />
          )}

          {activeTab === "users" && (
            <div className="admin-layout" ref={userDetailsRef}>
              <AdminUsersList
              users={users}
              selectedUserId={selectedId}
              savedUserId={savedUserId}
              requestCountsByUser={requestCountsByUser}
              improvementCountsByUser={improvementCountsByUser}
              onSelectUser={handleSelectUser}
              onShowImprovements={handleShowUserImprovements}
            />
              <AdminUserDetails user={selectedUser} onSaved={handleSaved} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  async function checkSession() {
    try {
      setChecking(true);
      const session = await getAdminSession();
      setAuthenticated(Boolean(session.authenticated));
    } catch {
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  if (checking) {
    return <main className="admin-page admin-page--centered">Загрузка...</main>;
  }

  if (!authenticated) {
    return <AdminLogin onLogin={checkSession} />;
  }

  return <AdminDashboard onLogout={() => setAuthenticated(false)} />;
}

export default AdminPage;
