import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminAccessRequests,
  getAdminSession,
  getAdminSettings,
  getAdminUser,
  getAdminUsers,
  loginAdmin,
  logoutAdmin,
  updateAdminAccessRequestStatus,
  updateAdminUserProcessingAccess
} from "../services/adminApi";

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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

function getAccessLabel(user) {
  if (user.processingEnabled) {
    return "Безлимит";
  }

  if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() > Date.now()) {
    return `До ${formatAccessDate(user.accessExpiresAt)}`;
  }

  const remaining = Math.max(Number(user.processingQuota || 0) - Number(user.processingUsed || 0), 0);

  if (remaining > 0) {
    return `Пакет: ${remaining} ост.`;
  }

  return "Бесплатный";
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

function getRequestStatusLabel(status) {
  const labels = {
    new: "Новая",
    reviewed: "Обработана",
    approved: "Одобрена",
    rejected: "Отклонена"
  };

  return labels[status] || status;
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

function groupAccessRequestsByUser(requests) {
  const groups = new Map();

  requests.forEach((request) => {
    const key = request.userId || request.email || request.id;
    const group = groups.get(key) || {
      id: key,
      userId: request.userId,
      email: request.email,
      displayName: request.displayName,
      documentsCount: request.documentsCount,
      status: "reviewed",
      requests: []
    };

    group.requests.push(request);
    group.status = group.requests.some((item) => item.status === "new") ? "new" : "reviewed";
    group.latestCreatedAt = group.requests
      .map((item) => new Date(item.createdAt).getTime())
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    groups.set(key, group);
  });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "new" ? -1 : 1;
    }

    return Number(b.latestCreatedAt || 0) - Number(a.latestCreatedAt || 0);
  });
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

function AdminUsersList({ users, selectedUserId, savedUserId, requestCountsByUser, onSelectUser }) {
  return (
    <section className="admin-users">
      <h2>Пользователи</h2>

      {users.length === 0 ? (
        <p className="admin-muted">Пользователей пока нет.</p>
      ) : (
        <div className="admin-users__list">
          {users.map((user) => (
            <button
              className={`admin-user-row ${selectedUserId === user.id ? "admin-user-row--active" : ""}`}
              type="button"
              key={user.id}
              onClick={() => onSelectUser(user.id)}
            >
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
              </span>
              <span className="admin-user-row__side">
                <span>{user.documentsCount} док.</span>
                <span>{getAccessLabel(user)}</span>
                {savedUserId === user.id && (
                  <span className="admin-user-row__saved">✓ изменения сохранены</span>
                )}
              </span>
            </button>
          ))}
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
        </div>
      </div>

      <div className="admin-stats">
        <div>
          <span>Записи</span>
          <strong>{user.documentsCount}</strong>
        </div>
        <div>
          <span>Создан</span>
          <strong>{formatDate(user.createdAt)}</strong>
        </div>
        <div>
          <span>Последняя запись</span>
          <strong>{formatDate(user.lastDocumentAt)}</strong>
        </div>
      </div>

      <div className="admin-current-access">
        <span>Текущий доступ</span>
        <div className="admin-current-access__value">
          <strong>{getProductAccessLabel({ ...user, processingEnabled, accessExpiresAt })}</strong>
          <AdminCopyButton
            label="Скопировать статус доступа"
            value={getProductAccessLabel({ ...user, processingEnabled, accessExpiresAt })}
          />
        </div>
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

function AdminAccessRequests({ requests, loading, onMarkReviewed, onSelectUser }) {
  const newRequestsCount = requests.filter((request) => request.status === "new").length;
  const groupedRequests = useMemo(() => groupAccessRequestsByUser(requests), [requests]);

  return (
    <section className="admin-access-requests">
      <div className="admin-section-heading">
        <div>
          <h2>Заявки</h2>
          <p className="admin-muted">Запросы на пакеты и расширение доступа</p>
        </div>
        {newRequestsCount > 0 && <span className="admin-badge">{newRequestsCount} новых</span>}
      </div>

      {loading ? (
        <p className="admin-muted">Загружаем заявки...</p>
      ) : groupedRequests.length === 0 ? (
        <p className="admin-muted">Заявок пока нет.</p>
      ) : (
        <div className="admin-access-requests__list">
          {groupedRequests.map((group) => {
            const newRequestIds = group.requests
              .filter((request) => request.status === "new")
              .map((request) => request.id);
            const sortedRequests = [...group.requests].sort(
              (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            );
            const latestRequest = sortedRequests[0] || null;
            const latestRequestDate = sortedRequests[0] ? formatDateTime(sortedRequests[0].createdAt) : "";
            const olderRequestDates = sortedRequests.slice(1).map((request) => formatDateTime(request.createdAt)).join(", ");

            return (
            <article className="admin-access-request" key={group.id}>
              <div className="admin-access-request__main">
                <strong>{group.email || group.displayName || `Пользователь ${group.userId}`}</strong>
                <span>{group.displayName || "Без имени"} · {group.documentsCount} записей</span>
                {latestRequest?.message && <p>{latestRequest.message}</p>}
                <div className="admin-access-request__dates">
                  <strong>{latestRequestDate}</strong>
                  {olderRequestDates && <span>{group.requests.length} заявок · {olderRequestDates}</span>}
                  {!olderRequestDates && <span>{group.requests.length} заявка</span>}
                </div>
              </div>

              <div className="admin-access-request__side">
                <span className={`admin-status admin-status--${group.status}`}>
                  {getRequestStatusLabel(group.status)}
                </span>
                <span>последняя: {formatDate(group.latestCreatedAt)}</span>
                <div className="admin-access-request__actions">
                  <button className="admin-button" type="button" onClick={() => onSelectUser(group.userId)}>
                    Пользователь
                  </button>
                  {newRequestIds.length > 0 && (
                    <button className="admin-button" type="button" onClick={() => onMarkReviewed(newRequestIds)}>
                      Отметить обработанной
                    </button>
                  )}
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatusPill({ active, children }) {
  return (
    <span className={`admin-settings__pill ${active ? "admin-settings__pill--active" : ""}`}>
      {children}
    </span>
  );
}

function ProviderStatus({ enabled, configured }) {
  return (
    <div>
      <StatusPill active={enabled}>{enabled ? "включен" : "выключен"}</StatusPill>
      <StatusPill active={configured}>{configured ? "ключи есть" : "нет ключей"}</StatusPill>
    </div>
  );
}

function formatPipeline(pipeline) {
  if (!pipeline) {
    return "не задано";
  }

  if (pipeline.pipeline === "fast") {
    return "fast · OpenAI";
  }

  return `${pipeline.pipeline} · OCR: ${pipeline.ocrProvider} · LLM: ${pipeline.aiProvider}`;
}

function AdminSettingsPanel({ settings }) {
  if (!settings) {
    return null;
  }

  const authProviders = Array.isArray(settings.auth?.providers) ? settings.auth.providers : [];
  const processingProviders = settings.processing?.providers || {};

  return (
    <section className="admin-settings">
      <div className="admin-section-heading">
        <div>
          <h2>Настройки сервиса</h2>
          <p className="admin-muted">Текущее состояние без секретов и ключей</p>
        </div>
      </div>

      <div className="admin-settings__grid">
        <div className="admin-settings__card">
          <h3>Авторизация</h3>
          <div className="admin-settings__list">
            {authProviders.map((provider) => (
              <div className="admin-settings__row" key={provider.id}>
                <span>{provider.label}</span>
                <ProviderStatus enabled={provider.enabled} configured={provider.configured} />
              </div>
            ))}
          </div>
        </div>

        <div className="admin-settings__card">
          <h3>Режимы</h3>
          <div className="admin-settings__list">
            <div className="admin-settings__row">
              <span>Обработка</span>
              <StatusPill active={settings.processing?.enabled}>{settings.processing?.enabled ? "включена" : "выключена"}</StatusPill>
            </div>
            <div className="admin-settings__row">
              <span>Override</span>
              <strong>{settings.processing?.modeOverride || "auto"}</strong>
            </div>
            <div className="admin-settings__row">
              <span>Гость</span>
              <strong>{formatPipeline(settings.processing?.pipelines?.guest)}</strong>
            </div>
            <div className="admin-settings__row">
              <span>Бесплатный</span>
              <strong>{formatPipeline(settings.processing?.pipelines?.free)}</strong>
            </div>
            <div className="admin-settings__row">
              <span>Платный</span>
              <strong>{formatPipeline(settings.processing?.pipelines?.paid)}</strong>
            </div>
          </div>
        </div>

        <div className="admin-settings__card">
          <h3>Провайдеры</h3>
          <div className="admin-settings__list">
            <div className="admin-settings__row">
              <span>Google OCR</span>
              <ProviderStatus
                enabled={processingProviders.googleOcr?.enabled}
                configured={processingProviders.googleOcr?.configured}
              />
            </div>
            <div className="admin-settings__row">
              <span>Yandex OCR</span>
              <ProviderStatus
                enabled={processingProviders.yandexOcr?.enabled}
                configured={processingProviders.yandexOcr?.configured}
              />
            </div>
            <div className="admin-settings__row">
              <span>YandexGPT</span>
              <ProviderStatus
                enabled={processingProviders.yandexAi?.enabled}
                configured={processingProviders.yandexAi?.configured}
              />
            </div>
            <div className="admin-settings__row">
              <span>OpenAI</span>
              <ProviderStatus
                enabled={processingProviders.openai?.enabled}
                configured={processingProviders.openai?.configured}
              />
            </div>
          </div>
        </div>

        <div className="admin-settings__card">
          <h3>Лимиты</h3>
          <div className="admin-settings__list">
            <div className="admin-settings__row">
              <span>Гость</span>
              <strong>{settings.limits?.guestDocumentLimit} обработок</strong>
            </div>
            <div className="admin-settings__row">
              <span>Бесплатный пакет</span>
              <strong>{settings.limits?.userRecordLimit} обработок</strong>
            </div>
            <div className="admin-settings__row">
              <span>Гостевые записи</span>
              <strong>{settings.limits?.guestDocumentTtlHours} ч.</strong>
            </div>
            <div className="admin-settings__row">
              <span>Файл</span>
              <strong>{settings.limits?.uploadFileLimitMb} МБ</strong>
            </div>
            <div className="admin-settings__row">
              <span>Allowlist</span>
              <strong>{settings.processing?.allowlistEnabled ? `${settings.processing.allowlistCount} email` : "выключен"}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [savedUserId, setSavedUserId] = useState(null);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userDetailsRef = useRef(null);

  const selectedId = selectedUserId;

  useEffect(() => {
    async function loadAdminData() {
      try {
        setLoading(true);
        setRequestsLoading(true);
        setError("");
        const [loadedUsers, loadedRequests, loadedSettings] = await Promise.all([
          getAdminUsers(),
          getAdminAccessRequests(),
          getAdminSettings()
        ]);
        setUsers(loadedUsers);
        setAccessRequests(Array.isArray(loadedRequests) ? loadedRequests : []);
        setSettings(loadedSettings);
        setSelectedUserId((current) => current || loadedUsers[0]?.id || null);
      } catch {
        setError("Не удалось загрузить данные админки.");
      } finally {
        setLoading(false);
        setRequestsLoading(false);
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
              onMarkReviewed={handleMarkRequestReviewed}
              onSelectUser={handleSelectUser}
            />
          )}

          {activeTab === "users" && (
            <div className="admin-layout" ref={userDetailsRef}>
              <AdminUsersList
              users={users}
              selectedUserId={selectedId}
              savedUserId={savedUserId}
              requestCountsByUser={requestCountsByUser}
              onSelectUser={handleSelectUser}
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
