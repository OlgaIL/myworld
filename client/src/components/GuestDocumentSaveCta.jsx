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
        <h2>Сохраните текст — откройте его на любом устройстве</h2>
        <p>Исходное фото, распознанный текст и улучшенная версия останутся в личном архиве. Запись можно открыть с телефона или компьютера после входа в тот же аккаунт</p>
      </div>

      {providers[0] && (
        <button
          className="guest-document-save-cta__primary"
          type="button"
          onClick={() => {
            trackGuestAccountCtaClick({ provider: providers[0].id, track: trackGoal });
            onProviderLogin(providers[0].id, { placement: "document_after_result", source: "guest_result_cta" });
          }}
        >
          Сохранить бесплатно
        </button>
      )}

      <p className="guest-document-save-cta__footnote">Ещё 10 обработок после входа · карта не нужна</p>

      {providers.length > 1 && (
        <div className="guest-document-save-cta__actions" aria-label="Другие способы входа">
          {providers.slice(1).map((provider) => {
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
                onProviderLogin(provider.id, { placement: "document_after_result", source: "guest_result_cta" });
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
      )}
    </section>
  );
}

export default GuestDocumentSaveCta;
