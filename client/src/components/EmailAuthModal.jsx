import { useEffect, useRef, useState } from "react";

const DEFAULT_RESEND_SECONDS = 60;

function getErrorMessage(error, fallback) {
  const code = error?.response?.data?.error;

  if (code === "EMAIL_AUTH_CODE_INVALID") {
    return "Код неверный или уже не действует. Запросите новый";
  }

  if (code === "EMAIL_AUTH_RATE_LIMITED") {
    return "Попробуйте ещё раз немного позже";
  }

  return fallback;
}

function EmailAuthModal({ onClose, onRequestCode, onVerifyCode }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const codeInputRef = useRef(null);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setResendSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [resendSeconds]);

  useEffect(() => {
    if (step === "code") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !loading) {
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose]);

  async function requestCode({ resend = false } = {}) {
    if (loading || !email.trim()) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const result = await onRequestCode(email, { resend });
      setResendSeconds(Number(result?.retryAfterSeconds || DEFAULT_RESEND_SECONDS));
      setStep("code");
      setCode("");
    } catch (requestError) {
      const retryAfter = Number(requestError?.response?.data?.retryAfterSeconds || 0);
      if (retryAfter > 0) {
        setResendSeconds(retryAfter);
      }
      setError(getErrorMessage(requestError, "Не удалось отправить код. Попробуйте ещё раз"));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (loading || code.length !== 6) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      await onVerifyCode(email, code);
    } catch (verifyError) {
      setError(getErrorMessage(verifyError, "Не удалось войти. Попробуйте ещё раз"));
    } finally {
      setLoading(false);
    }
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setError("");
    setResendSeconds(0);
  }

  return (
    <div
      className="email-auth-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-auth-title"
      onClick={() => !loading && onClose?.()}
    >
      <div className="email-auth-modal__content" onClick={(event) => event.stopPropagation()}>
        <button className="email-auth-modal__close" type="button" onClick={onClose} aria-label="Закрыть" disabled={loading}>
          ×
        </button>

        <h2 id="email-auth-title">Войти по email</h2>

        {step === "email" ? (
          <form onSubmit={(event) => { event.preventDefault(); requestCode(); }}>
            <label className="email-auth-modal__field">
              <span>Ваш email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                required
                disabled={loading}
              />
            </label>
            {error && <p className="email-auth-modal__error" role="alert">{error}</p>}
            <button className="email-auth-modal__primary" type="submit" disabled={loading || !email.trim()}>
              {loading ? "Отправляем..." : "Получить код"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <p className="email-auth-modal__sent">Отправили код на <strong>{email}</strong></p>
            <button className="email-auth-modal__change" type="button" onClick={changeEmail} disabled={loading}>
              Изменить email
            </button>
            <label className="email-auth-modal__field">
              <span>Код из письма</span>
              <input
                ref={codeInputRef}
                className="email-auth-modal__code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                disabled={loading}
              />
            </label>
            {error && <p className="email-auth-modal__error" role="alert">{error}</p>}
            <button className="email-auth-modal__primary" type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Проверяем..." : "Продолжить"}
            </button>
            <button
              className="email-auth-modal__resend"
              type="button"
              onClick={() => requestCode({ resend: true })}
              disabled={loading || resendSeconds > 0}
            >
              {resendSeconds > 0 ? `Отправить ещё раз через ${resendSeconds} с` : "Отправить код ещё раз"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default EmailAuthModal;
