function AuthProviderButtons({ onGoogleLogin, onYandexLogin, className = "" }) {
  const classes = ["auth-provider-buttons", className].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-label="Способы входа">
      <span className="auth-provider-buttons__label">Войти:</span>
      <button
        className="auth-provider-buttons__option"
        type="button"
        onClick={onGoogleLogin}
        title="Войти через Google"
      >
        <span className="auth-menu__icon" aria-hidden="true">G</span>
        Google
      </button>
      <button
        className="auth-provider-buttons__option"
        type="button"
        onClick={onYandexLogin}
        title="Войти через Яндекс"
      >
        <span className="auth-menu__icon auth-menu__icon--yandex" aria-hidden="true">Я</span>
        Яндекс
      </button>
    </div>
  );
}

export default AuthProviderButtons;
