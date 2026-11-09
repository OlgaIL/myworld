import { useEffect, useRef } from "react";
import AuthProviderButtons from "./AuthProviderButtons";
import "./BatchUploadEntry.css";

export default function BatchUploadEntry({ providers, onProviderLogin, onCancel, authError }) {
  const titleRef = useRef(null);
  useEffect(() => {
    titleRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  return <section className="guest-shell"><div className="guest-hero">
    <section className="upload-zone batch-upload-entry" aria-labelledby="batch-upload-title">
    <h1 ref={titleRef} tabIndex={-1} id="batch-upload-title">Войдите, чтобы загрузить несколько фото</h1>
    {authError && <p role="alert">Не удалось завершить вход. Выберите способ входа ещё раз или вернитесь к одному фото.</p>}
      <AuthProviderButtons providers={providers} onProviderLogin={onProviderLogin} source="batch_entry" />
      {providers.length === 0 && <p role="status">Способы входа сейчас недоступны. Попробуйте обновить страницу позже.</p>}
    <p>Каждое фото — отдельная запись и обработка. Фотографии обрабатываются по очереди в пределах доступного остатка.</p>
    <button className="batch-upload-entry__cancel" type="button" onClick={onCancel}>Сначала попробовать одно фото без входа</button>
    </section>
  </div></section>;
}
