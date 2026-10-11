# Ручной LLM через Timeweb

Публикацию и production-проверки выполняет Ольга. Эта инструкция сама ничего
не переключает. Провайдер `timeweb` работает только в standard text pipeline;
Google/Яндекс OCR и fast OpenAI сохраняются. Ошибка Timeweb не запускает
другой провайдер и не вызывает скрытых SDK retries. Уже распознанный текст
сохраняется как `recognized`, успешная обработка не списывается. Повтор
оформления использует сохранённый OCR, без повторного распознавания.

## Конфигурация

Режимы `auto`/`standard`/`fast`, приоритеты переменных и старые
`OCR_PROVIDER`/`AI_PROVIDER`: [памятка ENV_PROCESSING_GUIDE.md](ENV_PROCESSING_GUIDE.md).

В private `server/.env` (не в клиентском env) установить:

```dotenv
TIMEWEB_AI_ENABLED=true
TIMEWEB_API_KEY=СЕКРЕТНЫЙ_КЛЮЧ_GATEWAY
TIMEWEB_BASE_URL=https://api.timeweb.ai/v1
TIMEWEB_MODEL=openai/gpt-4.1-mini
TIMEWEB_TIMEOUT_MS=20000
TIMEWEB_MAX_TOKENS=6000
```

Ключ отдельный от `OPENAI_API_KEY` и `YANDEX_API_KEY`; `OPENAI_BASE_URL`
не используется для Timeweb. По умолчанию Timeweb выключен, модель без
явного значения не выбирается. Пример другой модели через тот же env:
`TIMEWEB_MODEL=gemini/gemini-3.1-flash-lite`. Адаптер использует Chat
Completions и базовые текстовые system/user prompts с отдельным дополнением
Timeweb для списка лексических замен corrections. Некорректные элементы
списка не отменяют валидный текст. Документация API: [Timeweb AI Gateway](https://timeweb.cloud/docs/ai-agents/api-usage/ai-gateway).

6000 — конечный бюджет ответа, с запасом на полный структурный JSON и
reasoning-токены моделей, которые их используют. Это ограничение, а не
оценка фактического расхода. Цена зависит от выбранной модели, usage и
актуального тарифа Gateway; стоимость не выводится из лимита. В safe
usage сохраняются доступные числовые prompt/completion/total/reasoning
tokens и `cost`; отсутствующая стоимость остаётся неизвестной. Таймаут
ограничивает весь запрос, включая получение тела ответа. SDK retries=0.

Для всех трёх аудиторий с Google OCR:

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
```

`PROCESSING_MODE_OVERRIDE=standard` принудительно включает standard для
всех. Для обычного выбора оставить `PROCESSING_MODE_OVERRIDE=auto` и
установить `PROCESSING_GUEST_MODE=standard`, `PROCESSING_FREE_MODE=standard`,
`PROCESSING_PAID_MODE=standard`. При `auto` личное `processing_mode` пользователя
имеет приоритет над режимом аудитории. fast всегда использует OpenAI.
Общий `PROCESSING_STANDARD_AI_PROVIDER` применяется только когда per-audience
provider не задан; существующие явные `...=yandex` он не заменяет.
Изменения env вступают в силу после restart.

## Текущая публикация: переключаем LLM на Timeweb

Ольга приняла локальную обработку и список замен 11 октября. В боевой
`server/.env` добавить только TIMEWEB-параметры из первого блока и свой ключ.
Не копировать локальный `.env` целиком. Ольга затем решила переключить
сайт на Timeweb: OCR оставить прежним, а режим и LLM задать явно.
Редактировать существующие строки без дублей:

```dotenv
PROCESSING_MODE_OVERRIDE=standard
PROCESSING_STANDARD_AI_PROVIDER=timeweb
PROCESSING_GUEST_AI_PROVIDER=timeweb
PROCESSING_FREE_AI_PROVIDER=timeweb
PROCESSING_PAID_AI_PROVIDER=timeweb
```

Яндекс и его ключи сохранить для ручного возврата. После restart в health
все три pipelines должны быть standard с aiProvider=timeweb, OCR прежний.
Проверить одну загрузку на сайте, оформление и «Сделаны замены», а также
админские LLM-метрики с Timeweb. Это подтвердит доступ с боевого сервера.
Автоматического fallback нет. Для возврата установить все четыре AI_PROVIDER
строки выше в yandex и перезапустить backend. Команды backup/миграции/сборки ниже.

## Локальные проверки

Без чтения private env и внешних API:

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
npm run test:timeweb
cd ..\client
npm test
npm run lint
npm run build
```

DB-проверка требует отдельно заданного `TIMEWEB_TEST_DATABASE_URL` с
hostname localhost/127.0.0.1/::1. Она создаёт свою временную схему с именем
`timeweb_synthetic_*`, применяет миграции, проверяет сохранение старой
строки метрик и реальный HTTP retry/no-credit, затем удаляет эту схему.
Для текущей локальной рабочей папки есть проверенный wrapper:

```powershell
cd C:\Users\olgak\PROJECTS\myworld
node work/run-timeweb-review.cjs
```

Wrapper проверяет localhost, передаёт только local DB URL и синтетические
настройки дочернему процессу. Без DB URL интеграционный тест явно skipped.

## Явный synthetic live smoke

Только по отдельному поручению человека; одна платная попытка, без БД,
фото и пользовательских документов. CLI проверяет весь JSON-контракт и
нормализованный результат через тот же адаптер. Без `--live` запросов нет.

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
npm run smoke:timeweb -- --live --report=../work/timeweb-synthetic-live.json
```

Запускать из `server`, чтобы CLI прочитал его `.env`. Отчёт содержит только
provider/model, success/errorCode, duration, blockCount и доступный usage;
ключи, входной и выходной текст не печатаются. Exit 0 означает полный
успешный JSON, exit 1 — неуспех, exit 2 — отсутствует явный флаг `--live`.
Mock-тесты не подтверждают live-доступность, поддержку параметров конкретной
моделью, фактическую цену или качество оформления реальных документов.

11 октября 2026 основная ветка отдельно выполнила локальный synthetic live
smoke с `openai/gpt-4.1-mini`: success, 3000 мс, одна попытка, один блок,
prompt_tokens=1356, completion_tokens=182, total_tokens=1538, reasoning_tokens=0.
Безопасный отчёт — `work/timeweb-live-smoke.json`. Это подтверждает один
локальный запрос, а не production или работу без VPN. `PROCESSING_*`
при проверке остались прежними на Яндексе; провайдер сайта не переключался.

## Публикация Ольгой

Выполнять после того, как основная ветка согласует, закоммитит и опубликует
проверенный коммит. Команды ниже не выполнялись агентом. Для изменения CHECK достаточно согласованного
backup PostgreSQL при работающем сайте; остановка сервиса не требуется.
Перед изменением env сохранить его и сделать DB backup:

```bash
cd /root/myworld
git status --short --branch
mkdir -p /root/myworld-backups
git rev-parse HEAD > /root/myworld-backups/before-timeweb.commit
install -m 600 server/.env /root/myworld-backups/before-timeweb.env
cd server
node --input-type=module <<'NODE'
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
dotenv.config({ quiet: true });
const u = new URL(process.env.DATABASE_URL);
const file = '/root/myworld-backups/before-timeweb-' + new Date().toISOString().replace(/[:.]/g, '-') + '.dump';
const env = { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGSSLMODE: u.searchParams.get('sslmode') || (process.env.DATABASE_SSL === 'true' ? 'require' : 'disable') };
if (process.env.DATABASE_SSL_CA_PATH) { env.PGSSLROOTCERT = process.env.DATABASE_SSL_CA_PATH; env.PGSSLMODE = 'verify-full'; }
const r = spawnSync('pg_dump', ['--format=custom', '--file', file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
if (r.error || r.status !== 0) { console.error('DB backup failed; stop here and check PostgreSQL/pg_dump access.'); process.exit(1); }
console.log('DB backup complete:', file);
NODE
```

Продолжить только после `DB backup complete`. `pg_dump` получает параметры
через env, URL и пароль не печатаются. Сайт продолжает работать во время
backup, миграции и сборки; restart выполняется после готовности всех файлов.

```bash
cd /root/myworld
git pull --ff-only origin main
cd server
npm ci
npm run db:migrate
npm run db:status
cd ../client
npm ci
npm run build
cd ../server
nano .env
pm2 restart myworld-server --update-env
pm2 status myworld-server
curl --fail --silent http://127.0.0.1:4000/api/health
curl --fail --silent http://127.0.0.1:4000/api/monitor/health
```

Сервис слушает фиксированный порт 4000 (`server/server.js`). В db:status
должна быть применена `036_timeweb_llm_provider.sql`. История 031 не меняется.
В health проверить Timeweb/model и отдельные guest/free/paid pipelines;
health показывает startup/configuration; `/api/monitor/health` проверяет
текущую доступность БД. Ни один health не вызывает Gateway. В админке
проверить безопасные настройки и label «Timeweb» в LLM-метриках.

Проверка CHECK после миграции (только выполняет Ольга):

```bash
cd /root/myworld/server
node --input-type=module <<'NODE'
import { query, closeDatabaseConnection } from './db/index.js';
try {
  const r = await query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='llm_attempt_events'::regclass and conname='llm_attempt_events_provider_check'");
  if (!r.rows[0]?.definition.includes('timeweb')) throw new Error('Timeweb migration missing');
  console.log('Timeweb provider constraint: OK');
} finally { await closeDatabaseConnection(); }
NODE
```

После ручной проверки конфигурации Ольга проверяет пробную обработку,
распознанный результат при отказе LLM и повтор без OCR/двойного списания.
Live CLI на сервере запускать только по её отдельному решению:
`npm run smoke:timeweb -- --live --report=/root/myworld-backups/timeweb-smoke.json`.

## Ручной возврат

Для точного возврата к сохранённым режимам и ключам:

```bash
cd /root/myworld
install -m 600 /root/myworld-backups/before-timeweb.env server/.env
pm2 restart myworld-server --update-env
curl --fail --silent http://127.0.0.1:4000/api/health
curl --fail --silent http://127.0.0.1:4000/api/monitor/health
```

Либо вручную задать прежний provider отдельно для standard/guest/free/paid,
вернуть прежние modes/override, установить `TIMEWEB_AI_ENABLED=false` и
restart. При возврате на `yandex` или `openai` нужны их собственные ключи.
Миграцию 036 оставлять: она совместима со старыми провайдерами и позволяет
сохранить уже записанную историю Timeweb. Down-миграция не требуется.

## Результат локальной приёмки

- Server wrapper после исправлений: 59 tests, 58 pass, 1 skip (старый независимый DB metrics
  test); Timeweb migration/partial/photo retry/guest retry проходят на localhost.
- Guest failure сохраняет OCR без расхода slot; success расходует один slot;
  повтор processed-документа возвращает 409 без нового запроса/списания.
- Client: 64/64 tests; lint и build exit 0. Build предупреждает о JS chunk
  больше 500 kB; lint — об устаревшем baseline-browser-mapping.
- Root отдельно применил локальную миграцию 036 и проверил synthetic live.
- Ольга проверила локальный сайт на Timeweb и подтвердила обработку текста
  и список замен. Автоматического переключения нет. Production и работа
  без VPN не проверялись. Текущая публикация переключает LLM на Timeweb
  по последнему решению Ольги; Яндекс остаётся ручным резервом.
