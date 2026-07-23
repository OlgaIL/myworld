import { useEffect, useRef } from "react";
import GuestDocumentCard from "./GuestDocumentCard";
import AuthProviderButtons from "./AuthProviderButtons";
import LegalConsentText from "./LegalConsentText";
import UploadZone from "./UploadZone";

function GuestLimitNotice({ authProviders, onProviderLogin }) {
  return (
    <div className="guest-auth-notice">
      <span>Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись, войдите в аккаунт.</span>
      <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} />
    </div>
  );
}

function GuestHome({
  documents,
  access,
  loading,
  uploading,
  uploadMessage,
  error,
  replacingDocumentId,
  onUpload,
  onOpenImage,
  onOpenDocument,
  onUploadAnother,
  onProviderLogin,
  authProviders
}) {
  const documentsListRef = useRef(null);
  const wasUploadingRef = useRef(false);
  const documentsBeforeUploadRef = useRef("");
  const uploadAllowed = access?.uploadAllowed !== false;
  const documentsUsed = Number(access?.documentsUsed || 0);
  const documentLimit = Number(access?.documentLimit || 5);
  const showAuthForError = Boolean(error && error.toLowerCase().includes("войдите"));

  useEffect(() => {
    const documentsSignature = documents
      .map((document) => `${document.id}:${document.updatedAt || ""}:${document.status || ""}`)
      .join("|");

    if (uploading) {
      if (!wasUploadingRef.current) {
        wasUploadingRef.current = true;
        documentsBeforeUploadRef.current = documentsSignature;
      }

      return undefined;
    }

    if (!wasUploadingRef.current) {
      return undefined;
    }

    wasUploadingRef.current = false;

    if (
      loading ||
      documents.length === 0 ||
      documentsSignature === documentsBeforeUploadRef.current ||
      !window.matchMedia("(max-width: 700px)").matches
    ) {
      return undefined;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frameId = window.requestAnimationFrame(() => {
      documentsListRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start"
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [documents, loading, uploading]);

  return (
    <section className="guest-shell">
      <div className="guest-hero">
        <header className="guest-hero__intro">
          <h1 className="guest-hero__title">Переведите фото записи в текст</h1>
          <p className="guest-hero__text">
            Получите аккуратно оформленную запись и сохраните её в личном архиве — чтобы легко найти позже.
          </p>
        </header>

        {uploadAllowed && (
          <UploadZone
            title="Перетащите сюда фото записи или выберите файл"
            description="Мы распознаем текст, оформим результат и сохраним его в архиве"
            actionLabel="Выбрать фото"
            footnote={`До ${documentLimit} обработок без регистрации`}
            statusMessage={uploadMessage}
            uploading={uploading}
            disabled={uploading}
            onUpload={onUpload}
          />
        )}
        {uploadAllowed && (
          <p className="guest-hero__signup-bonus">После регистрации — ещё 30 обработок бесплатно</p>
        )}
        {uploadAllowed && <LegalConsentText />}

        {(error || !uploadAllowed) && (
          <div className="guest-hero__notice">
            {showAuthForError ? (
              <div className="guest-auth-notice">
                <span>{error}</span>
                <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} />
              </div>
            ) : error ? (
              <p>{error}</p>
            ) : (
              <GuestLimitNotice authProviders={authProviders} onProviderLogin={onProviderLogin} />
            )}
          </div>
        )}

        <p className="guest-hero__counter">Гостевой режим · {documentsUsed}/{documentLimit} записей</p>

        {loading ? (
          <section className="guest-placeholder guest-placeholder--embedded">
            <p className="guest-placeholder__title">Проверяем запись...</p>
          </section>
        ) : documents.length > 0 ? (
          <>
            <section ref={documentsListRef} className="gallery guest-documents-list">
              {documents.map((document) => (
                <GuestDocumentCard
                  key={document.id}
                  document={document}
                  isReplacing={uploading && String(replacingDocumentId) === String(document.id)}
                  onOpen={onOpenImage}
                  onOpenDocument={onOpenDocument}
                  onUploadAnother={onUploadAnother}
                />
              ))}
            </section>

            <section className="guest-login-cta">
              <p>Чтобы сохранить ваши записи и продолжить работу, войдите в аккаунт.</p>
              <div className="guest-login-cta__actions">
                <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} />
              </div>
            </section>
          </>
        ) : !uploadAllowed ? (
          <section className="guest-placeholder guest-placeholder--embedded">
            <p className="guest-placeholder__title">Гостевая загрузка без входа уже использована.</p>
            <p className="guest-placeholder__text">
              Чтобы попробовать еще раз и сохранить новые записи, войдите в аккаунт.
            </p>
            <AuthProviderButtons
              className="auth-provider-buttons--center"
              providers={authProviders}
              onProviderLogin={onProviderLogin}
            />
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default GuestHome;
