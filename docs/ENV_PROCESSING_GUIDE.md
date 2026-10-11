# Памятка по server/.env: режимы, распознавание и LLM

Проверено по коду 11 октября 2026. Timeweb добавлен локально; его использование
на боевом сервере требует публикации кода и миграции 036.

## Где менять настройки

Локально: `C:\Users\olgak\PROJECTS\myworld\server\.env`.
На сервере: `/root/myworld/server/.env` — меняет Ольга при публикации.
Это разные файлы. Изменение локального env не меняет боевой сайт.

Редактировать существующую строку, а не добавлять вторую с тем же именем.
Настройки читаются при старте backend: после изменения нужен перезапуск.

## Две части обработки

- OCR распознаёт текст с фотографии. В режиме standard: `google` или `yandex`.
- LLM оформляет распознанный текст, создаёт заголовок, описание и теги.
  В режиме standard: `yandex`, `openai` или `timeweb`.

`timeweb` — поставщик API; внутри него модель выбирает `TIMEWEB_MODEL`.
Например, GPT через Timeweb: `TIMEWEB_MODEL=openai/gpt-4.1-mini`.
Прямой OpenAI выбирается значением провайдера `openai` и использует отдельный
ключ. Библиотека OpenAI SDK также применяется для Timeweb; это не означает,
что запрос отправляется напрямую в OpenAI.

## PROCESSING_MODE_OVERRIDE: auto, standard, fast

| Значение | Что делает |
| --- | --- |
| `auto` | Выбирает режим по личной настройке пользователя, затем по группе |
| `standard` | Принудительно для всех: сначала OCR, затем отдельная LLM |
| `fast` | Принудительно для всех: фото обрабатывает напрямую OpenAI |

`auto` не переключает провайдеров при отказе API и не выбирает «лучший» сервис.
Порядок выбора режима при `auto`:

1. Личный `processing_mode` пользователя, если задан `standard` или `fast`.
2. Настройка группы: `PROCESSING_GUEST_MODE`, `PROCESSING_FREE_MODE`,
   `PROCESSING_PAID_MODE`.

Если строки групп отсутствуют: гости и бесплатные — `fast`, платные —
`standard`. Поэтому для проверки Timeweb используем override `standard`:
он гарантирует, что личная настройка fast не направит фото напрямую в OpenAI.

Пример настройки групп без общего принудительного режима:

```dotenv
PROCESSING_MODE_OVERRIDE=auto
PROCESSING_GUEST_MODE=standard
PROCESSING_FREE_MODE=standard
PROCESSING_PAID_MODE=standard
```

Личный fast пользователя всё равно имеет приоритет при таком `auto`.

## Какие провайдеры выбирает standard

| Группа | Распознавание | Оформление |
| --- | --- | --- |
| Гости | `PROCESSING_GUEST_OCR_PROVIDER` | `PROCESSING_GUEST_AI_PROVIDER` |
| Бесплатные | `PROCESSING_FREE_OCR_PROVIDER` | `PROCESSING_FREE_AI_PROVIDER` |
| Платные | `PROCESSING_PAID_OCR_PROVIDER` | `PROCESSING_PAID_AI_PROVIDER` |

Когда настройка группы отсутствует или пустая, она наследует общую:

```dotenv
PROCESSING_STANDARD_OCR_PROVIDER=google
PROCESSING_STANDARD_AI_PROVIDER=yandex
```

Если общие строки тоже отсутствуют, оба standard-провайдера по умолчанию
`yandex`. Явные значения группы важнее общих: изменение только
`PROCESSING_STANDARD_AI_PROVIDER` не заменит существующие строки групп.

В режиме fast эти OCR/AI provider-строки не используются: обе части выполняет
прямой OpenAI, с `OPENAI_API_KEY` и `OPENAI_MODEL`.

## Старые OCR_PROVIDER и AI_PROVIDER

```dotenv
OCR_PROVIDER=google
AI_PROVIDER=yandex
```

Это совместимые значения по умолчанию в проверках доступности сервисов,
если в проверку не передан явно выбранный pipeline. Основные маршруты
сейчас передают выбранные провайдеры из `PROCESSING_*`.

Для переключения сайта менять `PROCESSING_*`, а не эти две строки.
Пока оставить их: комментирование не упрощает текущую конфигурацию.
Если их закомментировать, встроенные значения будут `OCR_PROVIDER=google`
и `AI_PROVIDER=openai`; это не включит OpenAI для всех, но поменяет значения
проверок, вызванных без явно переданных провайдеров.

## Готовый профиль: Google OCR + GPT через Timeweb

Меняем/добавляем в локальном `server/.env`:

```dotenv
PROCESSING_MODE_OVERRIDE=standard
PROCESSING_STANDARD_OCR_PROVIDER=google
PROCESSING_STANDARD_AI_PROVIDER=timeweb
PROCESSING_GUEST_OCR_PROVIDER=google
PROCESSING_FREE_OCR_PROVIDER=google
PROCESSING_PAID_OCR_PROVIDER=google
PROCESSING_GUEST_AI_PROVIDER=timeweb
PROCESSING_FREE_AI_PROVIDER=timeweb
PROCESSING_PAID_AI_PROVIDER=timeweb

GOOGLE_OCR_ENABLED=true
TIMEWEB_AI_ENABLED=true
TIMEWEB_BASE_URL=https://api.timeweb.ai/v1
TIMEWEB_MODEL=openai/gpt-4.1-mini
TIMEWEB_TIMEOUT_MS=20000
TIMEWEB_MAX_TOKENS=6000
```

Отдельная строка `TIMEWEB_API_KEY` должна содержать ключ AI Gateway.
Локальный ключ уже сохранён; не заменять его примером или ключом OpenAI.
Google OCR использует существующую настройку `GOOGLE_APPLICATION_CREDENTIALS`.
6000 — максимальный бюджет ответа, не фиксированный расход каждого документа.
Timeweb выполняет одну попытку без автоматического перехода к другой LLM.

## Ручной возврат на Google OCR + Яндекс

Сохранить тот же standard-режим и Google OCR. Заменить четыре строки:

```dotenv
PROCESSING_STANDARD_AI_PROVIDER=yandex
PROCESSING_GUEST_AI_PROVIDER=yandex
PROCESSING_FREE_AI_PROVIDER=yandex
PROCESSING_PAID_AI_PROVIDER=yandex
YANDEX_AI_ENABLED=true
```

Нужны существующие `YANDEX_API_KEY`, `YANDEX_FOLDER_ID` и настройка модели
`YANDEX_GPT_MODEL_URI`, если она была задана. Ключ Timeweb можно сохранить
для следующего ручного переключения. Включённый флаг Timeweb сам по себе
не направляет в него запросы, если выбран `yandex`.

Для прямого OpenAI в standard заменить эти четыре provider-значения на
`openai`, включить `OPENAI_ENABLED=true` и использовать `OPENAI_API_KEY`
с `OPENAI_MODEL`. Это подключение отличается от GPT через Timeweb.
Доступность прямого OpenAI с текущего сервера не подтверждается успешным
запросом через Gateway.

## Перезапуск и проверка

Локально: остановить запущенный `npm run dev` через Ctrl+C и запустить снова
из корня проекта:

```powershell
cd C:\Users\olgak\PROJECTS\myworld
npm run dev
```

В админке проверить реальные режимы guest/free/paid: при профиле Timeweb
должно быть `standard`, OCR `google`, LLM `Timeweb`. Наличие ключа в настройках
не означает, что выбранный API доступен: окончательная проверка — обработка.
После фото проверить результат и вызов Timeweb в статистике LLM.

Ольга на боевом сервере после публикации кода/миграции и изменения env:

```bash
pm2 restart myworld-server --update-env
curl --fail --silent --show-error http://127.0.0.1:4000/api/health
curl --fail --silent --show-error http://127.0.0.1:4000/api/monitor/health
```

`/api/health` показывает настройки и состояние БД при старте;
`/api/monitor/health` проверяет БД сейчас. Эти запросы не тестируют Timeweb.
Полный порядок публикации, backup и миграция:
[DEPLOY_TIMEWEB_MANUAL.md](DEPLOY_TIMEWEB_MANUAL.md).

Памятка описывает конфигурацию; сама не меняет env и не публикует код.
