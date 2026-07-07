const authProviderMeta = {
  google: {
    icon: "G",
    title: "Войти через Google",
    iconClassName: ""
  },
  yandex: {
    icon: "Я",
    title: "Войти через Яндекс",
    iconClassName: "auth-menu__icon--yandex"
  }
};

function AuthProviderButtons({ providers = [], onGoogleLogin, onYandexLogin, className = "" }) {
  const classes = ["auth-provider-buttons", className].filter(Boolean).join(" ");
  const visibleProviders = Array.isArray(providers) ? providers : [];
  const loginHandlers = {
    google: onGoogleLogin,
    yandex: onYandexLogin
  };

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <div className={classes} aria-label="Способы входа">
      <span className="auth-provider-buttons__label">Войти:</span>
      {visibleProviders.map((provider) => {
        const meta = authProviderMeta[provider.id] || {
          icon: provider.label?.[0] || "?",
          title: `Войти через ${provider.label || provider.id}`,
          iconClassName: ""
        };

        return (
          <button
            className="auth-provider-buttons__option"
            type="button"
            key={provider.id}
            onClick={loginHandlers[provider.id]}
            title={meta.title}
          >
            <span className={`auth-menu__icon ${meta.iconClassName}`.trim()} aria-hidden="true">
              {meta.icon}
            </span>
            {provider.label}
          </button>
        );
      })}
    </div>
  );
}

export default AuthProviderButtons;
