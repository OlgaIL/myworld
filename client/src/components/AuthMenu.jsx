import { useEffect, useRef, useState } from "react";
import { getAuthProviderMeta } from "../config/authProviders";
import "./AuthProviders.css";

function AuthMenu({ providers = [], onProviderLogin, className = "" }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const visibleProviders = Array.isArray(providers) ? providers : [];

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

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <div className={`auth-menu ${className}`.trim()} ref={menuRef}>
      <button className="auth-button" type="button" onClick={() => setOpen((current) => !current)}>
        Вход
      </button>

      {open && (
        <div className="auth-menu__dropdown">
          {visibleProviders.map((provider) => {
            const meta = getAuthProviderMeta(provider);

            return (
              <button
                className="auth-menu__option"
                type="button"
                key={provider.id}
                onClick={() => handleLogin(() => onProviderLogin?.(provider.id))}
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
      )}
    </div>
  );
}

export default AuthMenu;
