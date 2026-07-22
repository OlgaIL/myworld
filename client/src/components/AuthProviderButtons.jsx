import { getAuthProviderMeta } from "../config/authProviders";

function AuthProviderButtons({ providers = [], onProviderLogin, className = "" }) {
  const classes = ["auth-provider-buttons", className].filter(Boolean).join(" ");
  const visibleProviders = Array.isArray(providers) ? providers : [];

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <div className={classes} aria-label="Способы входа">
      <span className="auth-provider-buttons__label">Войти:</span>
      {visibleProviders.map((provider) => {
        const meta = getAuthProviderMeta(provider);

        return (
          <button
            className="auth-provider-buttons__option"
            type="button"
            key={provider.id}
            onClick={() => onProviderLogin?.(provider.id)}
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
