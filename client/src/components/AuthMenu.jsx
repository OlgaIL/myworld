import { useEffect, useRef, useState } from "react";

function AuthMenu({ onGoogleLogin, onYandexLogin, className = "" }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleLogin(login) {
    setOpen(false);
    login?.();
  }

  return (
    <div className={`auth-menu ${className}`.trim()} ref={menuRef}>
      <button className="auth-button" type="button" onClick={() => setOpen((current) => !current)}>
        Вход
      </button>

      {open && (
        <div className="auth-menu__dropdown">
          <button
            className="auth-menu__option"
            type="button"
            onClick={() => handleLogin(onGoogleLogin)}
            title="Войти через Google"
          >
            <span className="auth-menu__icon" aria-hidden="true">G</span>
            Google
          </button>
          <button
            className="auth-menu__option"
            type="button"
            onClick={() => handleLogin(onYandexLogin)}
            title="Войти через Яндекс"
          >
            <span className="auth-menu__icon auth-menu__icon--yandex" aria-hidden="true">Я</span>
            Яндекс
          </button>
        </div>
      )}
    </div>
  );
}

export default AuthMenu;
