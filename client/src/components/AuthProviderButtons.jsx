import { getAuthProviderMeta } from "../config/authProviders";

function AuthProviderButtons({ providers = [], onProviderLogin, className = "", compact = false }) {
  const classes = ["auth-provider-buttons", className, compact && "auth-provider-buttons--compact"].filter(Boolean).join(" ");
  const visibleProviders = Array.isArray(providers) ? providers : [];

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <div className={classes} aria-label="Способы входа">
      <span className="auth-provider-buttons__label">Войти:</span>
      {visibleProviders.map((provider) => {
        const meta = getAuthProviderMeta(provider);
        const label = compact
          ? ({ yandex: "Яндекс", vk: "VK", email: "email" }[provider.id] || provider.label)
          : provider.label;

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
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default AuthProviderButtons;
