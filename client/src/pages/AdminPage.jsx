import { useEffect, useMemo, useState } from "react";
import {
  getAdminSession,
  getAdminUser,
  getAdminUsers,
  loginAdmin,
  logoutAdmin,
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

function getAccessLabel(user) {
  if (user.processingEnabled) {
    return "Безлимит";
  }

  return `${user.processingUsed} / ${user.processingQuota}`;
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

function AdminUsersList({ users, selectedUserId, savedUserId, onSelectUser }) {
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
                <strong>{user.email || user.displayName || `Пользователь ${user.id}`}</strong>
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) {
      return;
    }

    setProcessingEnabled(user.processingEnabled);
    setProcessingQuota(user.processingQuota);
    setProcessingUsed(user.processingUsed);
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
        processingUsed
      });
      onSaved(updatedUser);
    } catch (error) {
      setMessage("Не удалось сохранить изменения.");
    } finally {
      setSaving(false);
    }
  }

  function setUnlimited() {
    setProcessingEnabled(true);
  }

  function setTrialLimit() {
    setProcessingEnabled(false);
    setProcessingQuota(5);
    setProcessingUsed(0);
  }

  function resetUsed() {
    setProcessingUsed(0);
  }

  return (
    <section className="admin-user-details">
      <div className="admin-user-details__header">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
        <div>
          <h2>{user.email || "Без email"}</h2>
          <p>{user.displayName || "Без имени"}</p>
        </div>
      </div>

      <div className="admin-stats">
        <div>
          <span>Документы</span>
          <strong>{user.documentsCount}</strong>
        </div>
        <div>
          <span>Создан</span>
          <strong>{formatDate(user.createdAt)}</strong>
        </div>
        <div>
          <span>Последний документ</span>
          <strong>{formatDate(user.lastDocumentAt)}</strong>
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

        <div className="admin-access-form__grid">
          <label className="admin-field">
            <span>Лимит обработок</span>
            <input
              type="number"
              min="0"
              value={processingQuota}
              onChange={(event) => setProcessingQuota(Number(event.target.value || 0))}
            />
          </label>

          <label className="admin-field">
            <span>Уже использовано</span>
            <input
              type="number"
              min="0"
              value={processingUsed}
              onChange={(event) => setProcessingUsed(Number(event.target.value || 0))}
            />
          </label>
        </div>

        <div className="admin-quick-actions">
          <button className="admin-button" type="button" onClick={setUnlimited}>
            Выдать безлимит
          </button>
          <button className="admin-button" type="button" onClick={setTrialLimit}>
            Лимит 5
          </button>
          <button className="admin-button" type="button" onClick={resetUsed}>
            Сбросить использовано
          </button>
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
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [savedUserId, setSavedUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedId = selectedUserId;

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        setError("");
        const loadedUsers = await getAdminUsers();
        setUsers(loadedUsers);
        setSelectedUserId((current) => current || loadedUsers[0]?.id || null);
      } catch (loadError) {
        setError("Не удалось загрузить пользователей.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
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
  }

  async function handleLogout() {
    await logoutAdmin();
    onLogout();
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-login__eyebrow">Word2you</p>
          <h1>Панель управления</h1>
        </div>
        <button className="admin-button" type="button" onClick={handleLogout}>
          Выйти
        </button>
      </header>

      <section className="admin-overview">
        <div>
          <span>Пользователи</span>
          <strong>{usersCount}</strong>
        </div>
        <div>
          <span>Документы</span>
          <strong>{documentsCount}</strong>
        </div>
      </section>

      {loading ? (
        <p className="admin-muted">Загрузка...</p>
      ) : error ? (
        <p className="admin-error">{error}</p>
      ) : (
        <div className="admin-layout">
          <AdminUsersList
            users={users}
            selectedUserId={selectedId}
            savedUserId={savedUserId}
            onSelectUser={handleSelectUser}
          />
          <AdminUserDetails user={selectedUser} onSaved={handleSaved} />
        </div>
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
    } catch (error) {
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
