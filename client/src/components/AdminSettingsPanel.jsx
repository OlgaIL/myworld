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
          <h3>Платежи</h3>
          <div className="admin-settings__list">
            <div className="admin-settings__row">
              <span>ЮKassa</span>
              <ProviderStatus
                enabled={settings.payments?.yookassa?.enabled}
                configured={settings.payments?.yookassa?.configured}
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

export default AdminSettingsPanel;
