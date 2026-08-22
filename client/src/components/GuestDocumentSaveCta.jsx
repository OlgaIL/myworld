import { useEffect } from "react";
import { getAuthProviderMeta } from "../config/authProviders";
import { trackGoalOnce } from "../services/analytics";

const PROVIDER_LABELS = {
  yandex: "Сохранить через Яндекс",
  vk: "Сохранить через VK",
  email: "Сохранить по email"
};

function GuestDocumentSaveCta({ documentId, documentStatus, providers, onProviderLogin }) {
  useEffect(() => {
    trackGoalOnce("guest_save_cta_view", documentId, {
      placement: "document_before_text",
      document_status: documentStatus
    });
  }, [documentId, documentStatus]);

  return (
    <section className="guest-document-save-cta" aria-label="Сохранить готовый текст">
      <div className="guest-document-save-cta__copy">
        <h2>Текст готов — сохраните его, чтобы не потерять</h2>
        <p>Эта запись появится в вашем кабинете. В бесплатном пакете — до 30 обработок.</p>
      </div>

      <div className="guest-document-save-cta__actions" aria-label="Способы сохранения">
        {providers.map((provider) => {
          const meta = getAuthProviderMeta(provider);
          const label = PROVIDER_LABELS[provider.id] || `Сохранить через ${provider.label || provider.id}`;

          return (
            <button
              className={`guest-document-save-cta__button guest-document-save-cta__button--${provider.id}`}
              type="button"
              key={provider.id}
              onClick={() => onProviderLogin(provider.id)}
              title={meta.title}
            >
              <span className={`auth-menu__icon ${meta.iconClassName}`.trim()} aria-hidden="true">
                {meta.icon}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <p className="guest-document-save-cta__footnote">Бесплатно · без пароля · карта не нужна</p>
    </section>
  );
}

export default GuestDocumentSaveCta;
