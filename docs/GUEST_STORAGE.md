# Гостевое хранение: схема и публикация

Реализовано и проверено локально 8 октября 2026. Production не публиковался
и не проверялся; все команды ниже выполняет Ольга после приёмки кода.

## Схема

- Новые фото: гости — `server/uploads/guests/`, ЛК — `server/uploads/users/`.
  Каталоги не имеют открытого static endpoint; фото выдаются через проверяемые API.
- Тексты гостей — `guest_documents`; архив — `photos`. Срок гостей — ровно
  240 часов от `created_at`. Просмотр, повторная обработка, исправления и замена
  ошибочной загрузки не меняют `expires_at`. API не выдаёт просроченные результаты
  и фото, даже если очистка ещё не запускалась; state и фото имеют `private, no-store`.
- Cookie обновляется при загрузке и живёт как минимум до срока нового документа.
  После переноса новая гостевая загрузка начинает новую гостевую сессию, поэтому
  документы из разных входов не смешиваются. Старые пустые сессии не удаляются.
- До записи гостевого файла фиксируется `guest_file_intents`: точный путь,
  сессия и срок `created_at + 240 часов`. До копирования отдельно фиксируются
  конечный путь и UUID-temp. Журнал не исчезает при rollback или удалении
  гостевой строки/сессии. При отказе записать журнал файл не открывается.
- Вход: account/session advisory locks → короткая транзакция с блокировкой
  документа, локальной копией/fsync, созданием `photos`, записью метаданных
  и удалением `guest_documents` → commit →
  удаление оригинала. Все варианты текста, исправления и дата загрузки сохраняются.
  Журнал копии фиксируется отдельным commit до записи файла и переживает
  откат этой транзакции. В транзакции переноса нет сетевых вызовов OCR/LLM.
  Логическое `photos.filename` сохраняется для перехода результата в ЛК;
  меняется `storage_path` на `users/claimed-ID-original-filename`.
  После commit сохранено прежнее условное LLM-обогащение: `processed`, OCR
  минимум 10 символов, нет title/summary/clean_text и разрешена обработка.
  Сетевой вызов выполняется вне транзакции, account/session locks держатся
  до завершения. `enrichment_state` позволяет продолжить после сбоя до результата;
  готовый/ошибочный результат повторно не вызывает LLM. Более новый результат
  обработки/исправлений пользователя не перезаписывается.
- `guest_document_claims` хранит только ID, владельца, исходный срок и временный
  путь ожидающего удаления оригинала. Она сохраняет статистику переноса и ссылки.
  `guest_documents_visible` получает результаты перенесённой записи из `photos`,
  чтобы прежняя карточка владельца и заявки продолжали работать до исходного
  срока. HTTP чтение, фото и исправления claimed-записи требуют входа именно
  владельца `photos`: после logout или входа другого пользователя старая
  гостевая cookie не показывает архив и получает 404 на file/corrections/retry.
  До переноса обычный гостевой доступ сохраняется. Второй копии текста нет.
- `guest_storage_retirements` — журнал файлов после перехода/замены загрузки:
  исходник удаляется только после исчезновения ссылок из обеих таблиц.
- Очистка работает порциями по 100, пропускает занятые сессии и исключает второй
  запуск общим advisory lock. OCR/LLM держит session lock без транзакции и через
  отдельный пул (до четырёх соединений); обычный пул остаётся доступным.
  После падения процесса PostgreSQL освобождает блокировку при закрытии соединения,
  и даже оставшийся статус `processing` не мешает следующей очистке.
  Зависший живой процесс сначала перезапустить; пока его соединение живо,
  очистка безопасно пропускает занятую сессию.
- Очистка удаляет плоские обычные файлы внутри `guests/` и точные
  зарегистрированные конечные/временные копии внутри `users/`, отвергает
  симлинки/junction и обход пути. Ошибка FS оставляет строку/журнал для повтора;
  отсутствующий файл повтору не мешает. Рекурсивного удаления нет.
- При жёстком завершении во время загрузки, записи UUID-temp либо после копии
  до commit журнал позволяет удалить остатки по исходному сроку без повторного
  входа. Отменённые операции можно убрать раньше. Очистка держит блокировки
  account/session/intent и короткую блокировку таблиц при проверке ссылок/unlink;
  действующий архив и другие зарегистрированные пути сохраняются. Ошибка
  удаления оставляет журнал для повтора. Произвольные старые файлы `users/`
  не собираются по возрасту. Исторические файлы без журнала требуют ручного разбора.
- Скрипт перехода работает с остановленным backend. Он переносит старые личные
  файлы раньше гостевых, выдерживает общие ссылки, сохраняет дату загрузки,
  убирает старый текст `claimed` и сохраняет его метаданные. Журнал позволяет
  повторить запуск после прерывания. Неизвестные общие файлы без ссылок только
  показывает (`unreferenced-manual-review`), автоматически их не удаляет.
- Бэкап/restore сохраняет обе папки. Удалённые данные остаются в старых копиях
  до истечения уже действующего срока их хранения. Срок/S3 не изменены.

## Локальная проверка

В основной папке проекта, с локальным PostgreSQL:

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
node --test --test-concurrency=1 tests/adminAccountDeletion.test.js tests/guestStorage.test.js tests/adminUserAnalyticsRoutes.test.js tests/guestUploadDiagnostics.test.js tests/guestDocumentImprovementStatus.test.js tests/documentContentRepository.test.js tests/improvementRequestsRepository.test.js
```

Итоговый прогон: 63 проверки (33 хранения, 19 удаления аккаунтов, 11 связанных).
Новые тесты создают временную схему в локальной БД и искусственные файлы,
удаляют их после проверки и отказываются работать с удалённой БД.
Ключи OCR/LLM в процессе теста отключены. Проверен локальный HTTP API,
а не реальная оплата/распознавание. Тест tar проверяет упаковку и распаковку
искусственных гостевого и личного файлов; полный Linux pg_dump/S3 restore
в этой задаче не запускался. Bash-синтаксис скрипта репетиции проверен.

В локальной основной БД применены 033, 034 и 035; этой доработкой применена
только новая 035 (структура без изменения накопленных данных).
033/034 не редактировались. В локальном `server/.env` единственное изменение
— `GUEST_DOCUMENT_TTL_HOURS=240`; секреты не выводились.
Переход/очистка накопленных локальных документов не запускались.

## Публикация — только Ольга

Сначала принимающий агент делает коммит/push согласованных файлов. На сервере
должна быть чистая рабочая папка; при изменениях `git pull` не продолжать.
Переход требует короткой остановки backend и свободного места для копий фото.

```bash
cd /root/myworld
git status --short
mkdir -p /root/myworld-backups
git rev-parse HEAD > /root/myworld-backups/before-guest-storage.commit
pm2 stop myworld-server
# Существующий бэкап БД + uploads, с действующими настройками S3/retention:
DOTENV_CONFIG_QUIET=true ./scripts/backup-production.sh
git pull --ff-only origin main
```

Зафиксировать имя готовой тройки backup-файлов; это снимок ДО перехода.
Если бэкап или обновление не удались, исправить проблему до миграции.

```bash
cd /root/myworld
install -m 600 server/.env /root/myworld-backups/before-guest-storage.env
sed -i '/^GUEST_DOCUMENT_TTL_HOURS=/d' server/.env
printf '\nGUEST_DOCUMENT_TTL_HOURS=240\n' >> server/.env
cd server
node --input-type=module -e "import './config/env.js'; const {GUEST_DOCUMENT_TTL_HOURS}=await import('./config/env.js'); if(GUEST_DOCUMENT_TTL_HOURS!==240) process.exit(1); console.log('Guest TTL: 240 hours');"
npm run db:migrate
node --input-type=module <<'NODE'
import dotenv from 'dotenv';
dotenv.config({quiet:true}); globalThis.__myworldEnvLoaded = true;
const {query,closeDatabaseConnection} = await import('./db/index.js');
try {
  const required = ['033_guest_storage.sql','034_admin_account_deletion.sql','035_guest_file_intents.sql'];
  const result = await query('select filename from schema_migrations where filename = any($1::text[]) order by filename',[required]);
  if(result.rows.length !== 3) throw new Error('Required migrations missing');
  console.log(result.rows.map(row => row.filename));
} finally { await closeDatabaseConnection(); }
NODE
node scripts/transitionGuestStorage.js --dry-run
```

Текущий код требует 033, 034 и новую 035. 035 создаёт журнал намерений записи
и `enrichment_state`; применённые 033/034 не менялись. Dry-run не меняет документы
и файлы; выводит ID, относительные пути, действия и итоговые количества.
`errors > 0`, `busy > 0`, `CLAIM_LINK_REQUIRES_REVIEW` требуют разбора до перехода.

`orphanClaims` и `unlinked-claim-manual-review` обозначают старые гостевые
записи со статусом `claimed`, у которых `claimed_photo_id` стал NULL. Такое
возможно после удаления документа из личного архива: прежний FK использует
`ON DELETE SET NULL`. Эти записи и их файлы сохраняются без изменения;
скрипт не подбирает другую связь и не восстанавливает удалённый архив.
Известные такие записи не блокируют переход остальных документов, если
`errors: 0` и `busy: 0`. Их количество сохраняется при повторном запуске.
Это исключения для ручного разбора: стандартная десятидневная очистка их
не удаляет. Решение об удалении/восстановлении принять отдельно после
проверки владельца и сохранившихся копий; не считать их свободными файлами.
Неизвестные файлы без ссылок остаются нетронутыми для отдельного решения.

После просмотра плана Ольгой:

```bash
cd /root/myworld/server
node scripts/transitionGuestStorage.js --apply
node scripts/transitionGuestStorage.js --dry-run
node scripts/cleanupGuests.js --dry-run
node scripts/cleanupGuests.js --apply
```

Переход повторяемый; второй dry-run не должен планировать новые переносы/сроки.
При ошибке копирования, БД или удаления устранить причину и повторить `--apply`.
Не удалять оригиналы вручную: журнал/проверка ссылок определяет, когда это безопасно.

Установить запуск раз в сутки в 05:00 по часовому поясу серверного cron,
сохранив остальные задания. Частота согласована Ольгой 10 октября.
Гостевой доступ истекает через 240 часов от загрузки, а файлы и строки БД
удаляются на следующем ежедневном запуске (при успешной очистке — в пределах
дополнительных 24 часов):

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
```

Часовой пояс — существующий часовой пояс серверного cron. Перезапуск:

```bash
cd /root/myworld
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
```

Клиент не менялся: сборка клиента и миграция nginx для этой задачи не нужны.
При общей публикации других задач принимающий агент добавляет их команды.

## Проверка production — выполняет Ольга

```bash
curl --fail https://word2you.ru/api/monitor/health
cd /root/myworld/server
node scripts/cleanupGuests.js --dry-run
tail -n 30 /root/myworld-backups/guest-cleanup.log
```

В том же браузере проверить гостевую загрузку, открытие фото/текста, новую
загрузку (cookie на десять суток), вход и ровно одну запись в ЛК с теми же
вариантами текста. Проверить отсутствие доступа к гостевому фото в другом
браузере, заявку на улучшение и статистику переноса в админке.
После переноса проверить выход из аккаунта и вход другого пользователя:
старая гостевая cookie не должна открывать или исправлять архив владельца.
Рабочее распознавание расходует установленный пакет/API; этот шаг отдельно
выполняет Ольга. Границу 240 часов не проверять изменением реальных документов:
её покрывают искусственные локальные тесты.

## Восстановление при ошибке

Первый вариант — оставить backend остановленным, исправить причину и повторить
переход. После commit личная копия уже устойчива; после сбоя удаления исходника
журнал сохранён. Не откатывать только файлы или только БД.

Если нужен полный возврат к снимку ДО перехода, Ольга выбирает общий timestamp
готовых backup-файлов. Восстановление снимка теряет изменения ПОСЛЕ него;
приложение остаётся закрытым до проверки. Заменить значение `BACKUP_STAMP`
точным timestamp выбранной тройки файлов. Этот блок рассчитан на снимок ДО
совместной публикации миграций 033–035. Сначала отключить строку гостевой
очистки в cron, сохранив бэкапы и прочие задания. Удалить новые объекты
033–035, отсутствующие в старом дампе: они мешают `pg_restore --clean` и
повторным миграциям. Старые задания удаления аккаунтов нельзя оставлять:
после восстановления они могли бы удалить возвращённые файлы.

```bash
pm2 stop myworld-server
cd /root/myworld/server
(
set -e
BACKUP_STAMP='YYYY-MM-DD_HH-MM-SS'
test -f "/root/myworld-backups/myworld-db-$BACKUP_STAMP.dump"
test -f "/root/myworld-backups/myworld-uploads-$BACKUP_STAMP.tar.gz"
pg_restore --list "/root/myworld-backups/myworld-db-$BACKUP_STAMP.dump" >/dev/null
tar -tzf "/root/myworld-backups/myworld-uploads-$BACKUP_STAMP.tar.gz" >/dev/null
DATABASE_URL="$(node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config({quiet:true}); process.stdout.write(process.env.DATABASE_URL || '')")"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
drop view if exists guest_documents_visible;
drop table if exists guest_file_intents;
drop table if exists guest_document_claims;
drop table if exists guest_storage_retirements;
drop table if exists account_deletion_files;
drop table if exists account_deletion_jobs;
drop trigger if exists lock_credit_account on processing_credit_events;
drop trigger if exists prevent_paid_account_deletion on users;
drop function if exists lock_credit_account();
drop function if exists prevent_paid_account_deletion();
commit;
SQL
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" "/root/myworld-backups/myworld-db-$BACKUP_STAMP.dump"
tar -xzf "/root/myworld-backups/myworld-uploads-$BACKUP_STAMP.tar.gz"
unset DATABASE_URL
)
```

Распаковка восстанавливает файлы снимка поверх текущих; более новые файлы без
ссылок остаются для отдельного разбора и не удаляются этим откатом.
Затем с исправленным текущим кодом:
Продолжать только после успешного завершения восстановления.

```bash
cd /root/myworld/server
npm run db:migrate
node scripts/transitionGuestStorage.js --dry-run
# После проверки Ольгой:
node scripts/transitionGuestStorage.js --apply
node scripts/cleanupGuests.js --dry-run
node scripts/cleanupGuests.js --apply
cd /root/myworld
pm2 restart myworld-server --update-env
```

При общей публикации удаления аккаунтов использовать также
`docs/DEPLOY_STORAGE_AND_ADMIN_DELETION.md` и `docs/ADMIN_ACCOUNT_DELETION.md`.
После восстановления миграция 034 снова включает защиту платежей;
проверить `ADMIN_PROTECTED_USER_IDS` до запуска backend. После успешного
восстановления вернуть гостевой cron по общей инструкции.
Очистка личных архивов по возрасту, Telegram-бэкапы, изменение S3/retention
и удаление пустых гостевых сессий в эту задачу не входят.
