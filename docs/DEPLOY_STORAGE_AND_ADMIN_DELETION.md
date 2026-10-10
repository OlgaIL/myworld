# Совместная публикация: гостевое хранение и удаление аккаунтов

Публикацию и проверки рабочего сайта выполняет только Ольга.
Сначала пройти локальный чеклист `docs/LOCAL_REVIEW_STORAGE_AND_ADMIN.md`.
Если он пройден, выполнять команды ниже по порядку из опубликованного коммита.

## Что меняется

- Гостевые фото и тексты хранятся 10 суток от загрузки каждого документа;
  фото гостей и личных кабинетов находятся в отдельных папках.
- После входа файл и результаты переносятся в личный архив.
- Просроченные гости очищаются раз в сутки, в 05:00 по часовому поясу серверного cron.
  Гостевой доступ истекает через 240 часов от загрузки; физическая очистка
  происходит на следующем ежедневном запуске (обычно не позднее ещё 24 часов).
- Админка позволяет удалять аккаунты без платежей; административные
  пользовательские аккаунты защищаются явным списком ID.
- Годовая очистка личных архивов и Telegram-уведомления бэкапов не входят
  в эту публикацию.

Переход накопленных файлов требует остановки backend. Команды выполнять
по блокам; при любой ошибке не продолжать к следующему блоку.
Переход выполнять вне времени ночного бэкапа; если бэкап уже работает,
дождаться его завершения до изменения накопленных файлов.

## 1. Подготовить сервер и снимок до изменения

```bash
cd /root/myworld
git status --short --branch
```

Рабочая папка должна быть чистой. До остановки выписать из админки ID всех
своих аккаунтов, которые нужно защитить. Не подставлять примерные ID.

```bash
cd /root/myworld
mkdir -p /root/myworld-backups
git rev-parse HEAD > /root/myworld-backups/before-storage-admin.commit
install -m 600 server/.env /root/myworld-backups/before-storage-admin.env
pm2 stop myworld-server
DOTENV_CONFIG_QUIET=true S3_BUCKET=word2you-backups bash scripts/backup-production.sh
```

Команда бэкапа использует бакет из документированного текущего cron. Если
в действующем cron бакет другой, использовать его значение. Убедиться в
сообщении `Backup complete`, записать timestamp готовых dump/tar/manifest.
Не продолжать без успешного бэкапа и загрузки в S3.

## 2. Получить код и настроить срок/защиту

```bash
cd /root/myworld
git pull --ff-only origin main
nano server/.env
```

В `.env` установить единственную строку каждого параметра:

```dotenv
GUEST_DOCUMENT_TTL_HOURS=240
ADMIN_PROTECTED_USER_IDS=ID_ВАШИХ_ЗАЩИЩЁННЫХ_АККАУНТОВ_ЧЕРЕЗ_ЗАПЯТУЮ
```

Во второй строке заменить обозначение реальными числовыми ID. Пустое или
неверное значение выключает удаление аккаунтов. `CLIENT_URL` и `SERVER_URL`
должны соответствовать действующим адресам сайта и API; секреты не менять.

```bash
cd /root/myworld/server
npm run db:migrate
npm run db:status
node --input-type=module <<'NODE'
import { GUEST_DOCUMENT_TTL_HOURS } from './config/env.js';
import { configuredProtection } from './services/accountDeletionPolicy.js';
import { query, closeDatabaseConnection } from './db/index.js';
try {
  if (GUEST_DOCUMENT_TTL_HOURS !== 240) throw new Error('Guest TTL must be 240 hours');
  if (!configuredProtection.valid) throw new Error('Set ADMIN_PROTECTED_USER_IDS');
  const result = await query('select count(*)::int as n from users where id = any($1::bigint[])', [configuredProtection.ids]);
  if (result.rows[0].n !== configuredProtection.ids.length) throw new Error('Every protected ID must exist');
  const fk = await query("select confdeltype from pg_constraint where conrelid='payments'::regclass and conname='payments_user_id_fkey'");
  if (fk.rows[0]?.confdeltype !== 'r') throw new Error('Payment RESTRICT migration missing');
  console.log({ guestHours: 240, protectedCount: result.rows[0].n, paymentsProtected: true });
} finally { await closeDatabaseConnection(); }
NODE
```

В статусе должны быть применены миграции `033_guest_storage.sql`,
`034_admin_account_deletion.sql` и `035_guest_file_intents.sql`.

## 3. Просмотреть и выполнить переход старых файлов

```bash
cd /root/myworld/server
node scripts/transitionGuestStorage.js --dry-run
```

Ольга просматривает план. При `errors`, `busy` или
`CLAIM_LINK_REQUIRES_REVIEW` сначала разобрать причину. Неизвестные старые
файлы без ссылок не удаляются автоматически.

После исправления от 10 октября записи с обнулённой связью на удалённое
архивное фото отражаются как `orphanClaims`/`unlinked-claim-manual-review`.
Они сохраняются вместе с исходными файлами и не блокируют остальные переносы.
На сервере Ольга обнаружила 35 таких записей; повторный dry-run должен
показать их отдельно, при этом `errors` и `busy` должны быть нулевыми.
Они остаются исключениями из автоматического удаления до отдельного разбора.

После просмотра:

```bash
node scripts/transitionGuestStorage.js --apply
node scripts/transitionGuestStorage.js --dry-run
node scripts/cleanupGuests.js --dry-run
```

Повторный план перехода не должен предлагать новые переносы. Просмотреть
кандидатов очистки и только затем выполнить:

```bash
node scripts/cleanupGuests.js --apply
```

## 4. Собрать клиент, установить очистку и перезапустить

```bash
cd /root/myworld
npm run build --prefix client
```

Новых зависимостей нет. Для очистки гостей добавить строку, сохранив
существующий cron бэкапа и другие задания:

```bash
bash <<'BASH'
set -euo pipefail
umask 077
mkdir -p /root/myworld-backups
CRON_SNAPSHOT="/root/myworld-backups/crontab-before-guest-cleanup-$(date +%Y%m%d-%H%M%S)"
crontab -l > "$CRON_SNAPSHOT"
NODE_BIN="$(command -v node)"
sed '\#scripts/cleanupGuests\.js#d' "$CRON_SNAPSHOT" > "$CRON_SNAPSHOT.new"
printf '%s\n' "0 5 * * * cd /root/myworld/server && $NODE_BIN scripts/cleanupGuests.js --apply >> /root/myworld-backups/guest-cleanup.log 2>&1" >> "$CRON_SNAPSHOT.new"
crontab "$CRON_SNAPSHOT.new"
crontab -l | grep -F 'scripts/cleanupGuests.js'
BASH
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
```

Очистка файлов удалённых аккаунтов выполняется встроенным worker раз в минуту;
отдельный cron для неё не нужен. Настройки nginx не меняются.

## 5. Проверить после публикации — выполняет Ольга

```bash
curl --fail --silent --show-error https://word2you.ru/api/monitor/health
cd /root/myworld/server
node scripts/cleanupGuests.js --dry-run
node scripts/cleanupDeletedAccounts.js --dry-run
```

- Проверить гостевую загрузку, фото/текст, вход и один документ с теми же
  результатами в личном архиве. В другом браузере гостевое фото недоступно.
  После выхода прежняя гостевая ссылка не открывает перенесённый личный документ.
- В админке открыть свой защищённый аккаунт и аккаунт с платежом: удаление
  недоступно, причина показана.
- Создать отдельный одноразовый аккаунт без платежей. Проверить отмену,
  неправильный ID, затем правильное подтверждение и исчезновение аккаунта.
  Старый вход теряет доступ. Повторная регистрация создаёт новый пустой архив.
- Если файлы остаются в очереди, дождаться очистки или воспользоваться кнопкой
  повтора. Диагностика: `pm2 logs myworld-server --lines 100 --nostream`.

Не запускать тестовые suites на production и не менять даты реальных
документов для проверки десятидневного срока. Реальное распознавание расходует
API/лимит и выполняется только самой Ольгой.

`/api/health` содержит сохранённый результат проверки БД при старте и не
подтверждает текущую доступность. Для текущего состояния использовать
`/api/monitor/health` (проверка SELECT 1, кэш на 10 секунд).

## При ошибке

До изменения данных можно вернуть сервер в работу на прежнем коде. После
перехода файлов или удаления аккаунта простой откат кода не восстанавливает
данные: нужна согласованная парная копия БД и uploads. Не восстанавливать
только один компонент.

Для отключения новых удалений аккаунтов очистить `ADMIN_PROTECTED_USER_IDS`
в `.env` и перезапустить backend. Уже подтверждённые задачи очистки продолжатся.
Для остановки всей очистки остановить backend и убрать из cron только строку
`scripts/cleanupGuests.js`, сохранив бэкапы и другие задания.

Если потребуется восстановить парный снимок, сделанный в шаге 1 до миграций
033–035, использовать блок восстановления из `docs/GUEST_STORAGE.md`. Он
удаляет также очереди и триггеры миграции 034, чтобы повторная миграция прошла
и прежние задания удаления не затронули восстановленные файлы. Сначала
остановить backend и отключить гостевой cron, как указано выше. После
восстановления и исправления причины повторить миграции, просмотр перехода
и запуск по этому документу; проверить защищённые ID. Возврат снимка удаляет
все изменения в БД после его создания.

Подробности: `docs/GUEST_STORAGE.md`, `docs/ADMIN_ACCOUNT_DELETION.md`,
`docs/BACKUP_RESTORE.md`.
