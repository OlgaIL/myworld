import GuestDocumentCard from "./GuestDocumentCard";
import AuthMenu from "./AuthMenu";

function GuestLimitNotice({ onLogin }) {
  return (
    <>
      Гостевая загрузка без входа уже использована. Чтобы загрузить новую запись,{" "}
      <button className="guest-hero__notice-link" type="button" onClick={onLogin}>
        войдите в кабинет
      </button>
      .
    </>
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
  onLogin,
  onYandexLogin
}) {
  const uploadAllowed = access?.uploadAllowed !== false;
  const documentsUsed = Number(access?.documentsUsed || 0);
  const documentLimit = Number(access?.documentLimit || 5);

  return (
    <section className="guest-shell">
      <div className="guest-hero">
        <h2 className="guest-hero__title">Загрузите ваши записи</h2>
        <p className="guest-hero__text">
          Просто загрузите скан или фото нужного текста.
          <br />
          Прочитаем текст, обработаем и сохраним результат.
        </p>

        <div className="guest-hero__actions">
          {uploadAllowed && (
            <button
              className="guest-upload-button"
              type="button"
              onClick={() => onUpload()}
              disabled={uploading}
            >
              {uploading ? "Загрузка..." : "Загрузить запись"}
            </button>
          )}
        </div>

        {(uploadMessage || error || !uploadAllowed) && (
          <div className="guest-hero__notice">
            <p>{error || uploadMessage || <GuestLimitNotice onLogin={onLogin} />}</p>
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
              <p>Чтобы сохранить ваши записи и продолжить работу, войдите в кабинет.</p>
              <div className="guest-login-cta__actions">
                <AuthMenu
                  className="auth-menu--guest"
                  onGoogleLogin={onLogin}
                  onYandexLogin={onYandexLogin}
                />
              </div>
            </section>
          </>
        ) : !uploadAllowed ? (
          <section className="guest-placeholder guest-placeholder--embedded">
            <p className="guest-placeholder__title">Гостевая загрузка без входа уже использована.</p>
            <p className="guest-placeholder__text">
              Чтобы попробовать еще раз и сохранить новые записи,{" "}
              <button className="guest-hero__notice-link" type="button" onClick={onLogin}>
                войдите в кабинет
              </button>
              .
            </p>
            <button className="guest-card__primary-action" type="button" onClick={onLogin}>
              Войти в кабинет
            </button>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default GuestHome;
