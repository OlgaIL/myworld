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
  const uploadAllowed = access?.uploadAllowed !== false;
  const documentsUsed = Number(access?.documentsUsed || 0);
  const documentLimit = Number(access?.documentLimit || 5);
  const showAuthForError = Boolean(error && error.toLowerCase().includes("войдите"));

  return (
    <section className="guest-shell">
      <div className="guest-hero">
        {uploadAllowed && (
          <UploadZone
            title="Перетащите сюда фото записи"
            description="Мы распознаем текст, оформим результат и сохраним его в архиве."
            footnote={`До ${documentLimit} обработок без регистрации.`}
            uploading={uploading}
            disabled={uploading}
            onUpload={onUpload}
          />
        )}
        {uploadAllowed && <LegalConsentText />}

        {(uploadMessage || error || !uploadAllowed) && (
          <div className="guest-hero__notice">
            {showAuthForError ? (
              <div className="guest-auth-notice">
                <span>{error}</span>
                <AuthProviderButtons providers={authProviders} onProviderLogin={onProviderLogin} />
              </div>
            ) : error || uploadMessage ? (
              <p>{error || uploadMessage}</p>
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
            <section className="gallery guest-documents-list">
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
