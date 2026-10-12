# Публикация блока «Гости и очистка»

Production-команды выполняет только Ольга после приёмки основной веткой и
публикации утверждённого коммита. Эта инструкция ничего не развёртывает.
Миграция `037_guest_observability.sql` добавляет техническую историю и
триггер; старые события не импортируются. TTL остаётся 240 часов.

## Локальная проверка

Из основной рабочей папки:

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
node scripts/runGuestStatisticsTests.js --regressions
cd ..\client
npm test
npm run lint
npm run build
```

Runner разрешает только localhost PostgreSQL, создаёт отдельную схему для
каждого набора и временный uploads вне общих файлов. В дочерних тестах
чтение private `.env` выключено, конфигурация синтетическая. Внешние OCR/LLM
заменены локальными подстановками. Проверяются standard и fast, гостевое
хранение и удаление аккаунтов. Браузерная визуальная приёмка отдельно.

## 1. Проверить текущий cron и сохранить резервную копию

По просьбе Ольги 12 октября на локалке включён отдельный backend scheduler:
`LOCAL_GUEST_CLEANUP_ENABLED=true`, `GUEST_CLEANUP_TIMEZONE=Europe/Istanbul`.
Он работает только с localhost-БД вне NODE_ENV=production, запускается в
05:00 и догоняет пропущенный запуск при старте backend. На боевом сервере
оставлять `LOCAL_GUEST_CLEANUP_ENABLED=false` (или не задавать строку):
там остаётся существующий ежедневный cron. Не копировать локальный env целиком.

Сайт продолжает работать. Проверить чистоту рабочей папки и существующее
задание ежедневной очистки; не заменять его и не запускать массовый `--apply`.

```bash
cd /root/myworld
git status --short --branch
crontab -l
timedatectl show --property=Timezone --value
date '+%Y-%m-%d %H:%M:%S %Z %z'
systemctl status cron --no-pager
mkdir -p /root/myworld-backups
git rev-parse HEAD > /root/myworld-backups/before-guest-statistics.commit
install -m 600 server/.env /root/myworld-backups/before-guest-statistics.env
crontab -l > /root/myworld-backups/before-guest-statistics.crontab
cd server
node --input-type=module <<'NODE'
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
dotenv.config({ quiet: true });
const u = new URL(process.env.DATABASE_URL);
const file = '/root/myworld-backups/before-guest-statistics-' + new Date().toISOString().replace(/[:.]/g, '-') + '.dump';
const env = { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGSSLMODE: u.searchParams.get('sslmode') || (process.env.DATABASE_SSL === 'true' ? 'require' : 'disable') };
if (process.env.DATABASE_SSL_CA_PATH) { env.PGSSLROOTCERT = process.env.DATABASE_SSL_CA_PATH; env.PGSSLMODE = 'verify-full'; }
const r = spawnSync('pg_dump', ['--format=custom', '--file', file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
if (r.error || r.status !== 0) { console.error('DB backup failed; stop here and check pg_dump access.'); process.exit(1); }
console.log('DB backup complete:', file);
NODE
```

Продолжить только после `DB backup complete`. DATABASE_URL и пароль не
печатаются. Проверить, что существующее задание содержит `0 5 * * *`,
рабочую папку `/root/myworld/server`, `scripts/cleanupGuests.js --apply`
и прежний журнал `/root/myworld-backups/guest-cleanup.log`.

Ожидаемый часовой пояс нельзя брать из браузера/компьютера. Для текущего
обычного системного cron без отдельного поддерживаемого scheduler timezone
это часовой пояс службы на сервере. Если в задании есть `TZ`, `CRON_TZ` либо
другой scheduler, проверить, какую настройку конкретная установленная
служба использует для расписания: `TZ` внутри команды сам по себе не
доказывает изменение времени запуска. Зафиксировать проверенное IANA-имя
в следующем шаге. Не менять системный часовой пояс ради интерфейса.

## 2. Получить утверждённый код, применить миграцию и собрать

Вместо `APPROVED_COMMIT` подставить SHA, который основная ветка передаст
после приёмки и коммита. При грязной рабочей папке сначала сохранить и
согласовать её изменения; не выполнять reset/clean.

```bash
cd /root/myworld
git pull --ff-only origin main
git rev-parse HEAD
git merge-base --is-ancestor APPROVED_COMMIT HEAD
cd server
npm ci
npm run db:migrate
npm run db:status
cd ../client
npm ci
npm run build
cd ../server
nano .env
```

`db:status` проверяет только соединение. Применённую миграцию проверить явно:

```bash
cd /root/myworld/server
node --input-type=module <<'NODE'
import './config/load-env.js';
const { query, closeDatabaseConnection } = await import('./db/index.js');
try {
  const result = await query("select filename,applied_at from schema_migrations where filename=$1", ['037_guest_observability.sql']);
  if (result.rows.length !== 1) throw new Error('Migration 037 is not applied');
  console.log(result.rows[0]);
  console.log((await query('select started_at from guest_statistics_collection where id=true')).rows[0]);
} finally { await closeDatabaseConnection(); }
NODE
```

В `.env` добавить одну строку (или исправить существующую без дублей):

```dotenv
GUEST_CLEANUP_TIMEZONE=ПРОВЕРЕННЫЙ_IANA_ЧАСОВОЙ_ПОЯС_CRON
```

Это настройка ожидаемого ежедневного времени 05:00; она не создаёт cron.
Пустое или неверное значение покажет честное предупреждение в админке.
Проверить валидность и именно ту локальную дату, которую увидит отчёт:

```bash
node --input-type=module <<'NODE'
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const timezone = process.env.GUEST_CLEANUP_TIMEZONE?.trim();
if (!timezone) throw new Error('GUEST_CLEANUP_TIMEZONE is empty');
console.log('Expected cleanup: 05:00 daily; timezone:', timezone);
console.log('Now in cron timezone:', new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date()));
NODE
```

Миграция additive, пользовательские записи не удаляются и не переносятся.
Перезапускать только после успешных migration/build; длительная остановка
и повторный storage transition не нужны.

## 3. Перезапуск и текущая проверка

```bash
pm2 restart myworld-server --update-env
pm2 status myworld-server
curl --fail --silent http://127.0.0.1:4000/api/monitor/health
pm2 logs myworld-server --lines 50 --nostream
```

В текущем monitor health проверить доступность БД. Войти в админку,
открыть «Обзор»: LLM сохраняется, рядом есть «Гости и очистка». Переключить
24/48 часов, 7/30 дней, дождаться обновления. Остатки «сейчас» не зависят
от периода; источник времени окон — БД. Проверить мобильную ширину без
горизонтального скролла. До первого ожидаемого запуска может быть
«Ожидается первый ежедневный запуск»; до начала сбора история неизвестна.
Если следующий запуск уже просрочен на час, предупреждение закономерно.

Read-only endpoint `GET /admin-api/guest-storage?hours=24` требует существующую
admin-сессию. Его можно посмотреть в Network после входа. Ответ должен
содержать `collectedAt`, `generatedAt`, границы периода, `current`, `period`,
`latest`, `lastSuccess`, `schedule`. Ошибка БД/неприменённая миграция — 503,
не успешный отчёт с нулями. HTTP не запускает очистку и не сканирует файлы.

## 4. После следующего штатного ежедневного cron

Не запускать ручную массовую очистку для проверки нового блока. После
ближайших 05:00 в проверенном часовом поясе:

```bash
tail -n 40 /root/myworld-backups/guest-cleanup.log
curl --fail --silent http://127.0.0.1:4000/api/monitor/health
```

Обновить «Обзор». Последняя очистка должна иметь start/finish и состояние;
успешный запуск с нулём кандидатов/удалений нормален. `lastSuccess`
обновляется только при завершённом успешном applied-запуске. Dry-run,
блокировка, legacy/error/incomplete не заменяют последний успех. CLI
сохраняет старые JSON-поля; ошибки, legacy и неполнота дают exit 1.

Файлы считаются по подтверждённому результату unlink, ENOENT — отдельно.
TTL-документы считаются транзакционно с delete; claim/account deletion
не увеличивают этот показатель. Исходники после переноса/замены и
временные артефакты показаны отдельными категориями.

При потере подтверждения между unlink и записью результата остаётся pending,
после повторного запуска — unknown/incomplete, без выдуманного удаления.
Подтверждённое число — нижняя граница; история неполноты сохраняется.
Восстанавливающий запуск тоже помечается неполным. Running с живой блокировкой
своего PID остаётся running даже при длительной работе; без этой блокировки
и heartbeat старше 2 минут показывается «Вероятно прервано».
Новые события/запуски не содержат фото, текста, email, IP, токенов, имён
файлов или путей. Старые показатели 1160/35/7 не импортируются.
