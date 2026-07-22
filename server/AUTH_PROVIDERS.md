# Провайдеры входа

Провайдер показывается во frontend только когда его флаг включен и заданы `CLIENT_ID` и `CLIENT_SECRET`. Старый `AUTH_PROVIDERS` сохранен для обратной совместимости; явный флаг `*_AUTH_ENABLED` имеет приоритет.

## VK ID

1. Зарегистрируйте web-приложение VK ID.
2. Добавьте callback: `${SERVER_URL}/auth/vk/callback`.
3. Задайте `VK_AUTH_ENABLED=true`, `VK_CLIENT_ID` и `VK_CLIENT_SECRET`.

Реализация использует Authorization Code с PKCE, endpoints `id.vk.com` и серверный запрос профиля. Документация: https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/start-integration/web/install-web-sdk

## Сбер ID

Сбер ID требует регистрации организации и приложения, активации со стороны Сбера и сертификата. После получения партнерского комплекта задайте `SBER_AUTH_ENABLED=true`, `SBER_CLIENT_ID` и `SBER_CLIENT_SECRET`; callback — `${SERVER_URL}/auth/sber/callback`.

Публичных данных `client_id/client_secret` недостаточно для безопасного завершения серверного OIDC flow, поэтому маршрут сейчас возвращает пользователя на сайт с `auth_error=partner_setup_required`. Точные endpoints и работу с сертификатом нужно подключить из выданного Сбером партнерского комплекта, не заменяя их предположительными URL.

Документация: https://developers.sber.ru/docs/ru/sberid/service/overview

## МТС ID

Для МТС ID сначала получите партнерский доступ и точную серверную спецификацию приложения. Затем задайте `MTS_AUTH_ENABLED=true`, `MTS_CLIENT_ID` и `MTS_CLIENT_SECRET`; callback — `${SERVER_URL}/auth/mts/callback`.

До получения официальных endpoints маршрут возвращает пользователя на сайт с `auth_error=partner_setup_required`. Это намеренная безопасная заглушка: OAuth URL не зашиты наугад.

Портал разработчиков: https://developers.mts.ru/
