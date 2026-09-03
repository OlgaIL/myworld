import { useEffect } from "react";
import { getAuthProviderMeta } from "../config/authProviders";
import { trackGoal, trackGoalOnce } from "../services/analytics";
import {
  trackGuestAccountCtaClick,
  trackGuestAccountCtaView
} from "../utils/guestAccountCtaAnalytics";

const PROVIDER_LABELS = {
  yandex: "Продолжить через Яндекс",
  vk: "Продолжить через VK",
  email: "Продолжить по email"
};

function GuestDocumentSaveCta({ documentId, documentStatus, providers, onProviderLogin }) {
  useEffect(() => {
    trackGuestAccountCtaView({
      documentId,
      documentStatus,
      trackOnce: trackGoalOnce
    });
  }, [documentId, documentStatus]);

  return (
    <section className="guest-document-save-cta" aria-label="Продолжить обработку фотографий">
      <div className="guest-document-save-cta__copy">
        <h2>Нужно обработать ещё фотографии?</h2>
        <p>Войдите и получите ещё 10 бесплатных обработок. Готовый текст сохранится в личном кабинете.</p>
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
              onClick={() => {
                trackGuestAccountCtaClick({
                  provider: provider.id,
                  track: trackGoal
                });
                onProviderLogin(provider.id);
              }}
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

      <p className="guest-document-save-cta__footnote">Бесплатно · карта не нужна</p>
    </section>
  );
}

export default GuestDocumentSaveCta;
