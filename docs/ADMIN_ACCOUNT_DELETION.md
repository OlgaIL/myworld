# Удаление аккаунта: схема и публикация

8 октября 2026. Серверные проверки и сборка выполнены локально.
Принимающий агент независимо проверил компонент в headless Edge: ID,
отмена, защита, busy, ошибки, успех, desktop и 375 px без горизонтальной
прокрутки; pageerrors нет. Полный live AdminPage через Browser Plugin
остаётся на приёмку: plugin не запускается из-за Windows sandbox helper.
Production публикует и проверяет только Ольга.

## Правила

В карточке пользователя есть «Удалить аккаунт». Подтверждение показывает
ID, имя/email, число документов архива, последствия и требует точного ID.
Отмена не вызывает API. Во время запроса повторная отправка отключена.
После успеха карточка закрывается, список и связанные разделы обновляются.

Удаление выключено без корректного непустого `ADMIN_PROTECTED_USER_IDS`.
Это список существующих ID через запятую, например `12,34` (пример, не
production-конфигурация). Все административные пользовательские аккаунты
указывает Ольга: их нельзя определять по ADMIN_LOGIN или имени. Ошибочный
формат или несуществующий ID выключает удаление. Текущий `req.user` защищён
дополнительно. Настройка читается при старте; после её изменения нужен restart.
UI не позволяет изменять список защиты.

Любая строка `payments` блокирует удаление: pending, waiting_for_capture,
succeeded, canceled, failed, включая тесты. Начисление с `payment_id` или
источником, отличным от `manual`, также блокирует удаление независимо от
наличия связанного платежа. Ручные начисления без платёжной связи удаляются.

API сохраняет `requireAdmin`. Дополнительно нужны session CSRF token из
карточки и заголовок `X-Admin-Deletion-CSRF`; чужой Origin и cross-site
запросы отклоняются. `CLIENT_URL`/`SERVER_URL` должны соответствовать
реальным адресам фронтенда/API. Прямой DELETE не обходит проверки.

## БД, блокировки и файлы

Миграция 034 меняет `payments.user_id` с CASCADE на RESTRICT. Удаление
захватывает строку users через FOR UPDATE перед повторной проверкой.
Создание платежа требует FK key-share lock: либо платёж успевает сохраниться
и удаление блокируется, либо аккаунт удалён и INSERT платежа получает отказ
FK. Платёж не исчезает каскадно. Триггеры также защищают оплаченные начисления
без полной истории платежей, включая их одновременное создание/изменение.

Shared account advisory lock удерживается загрузкой, обработкой и входом
с переносом. Удаление требует exclusive lock. Сетевой OCR/LLM не находится
в транзакции, отключение клиентского сокета не освобождает lock до окончания
обработчика. Дополнительно отказ при photos.status=processing и заявке
in_review; нужно дождаться обработки/рассмотрения. Зависший статус требует
операторского разбора, автоматически его не сбрасываем.

Гостевые сессии и обслуживание защищены теми же advisory namespaces,
что в задаче гостевого хранения. Для многочисленных сессий используются
transaction locks без исчерпания гостевого пула. Чужие/противоречивые
связи guest claims, старых claimed-записей или улучшений блокируют удаление.

В одной транзакции удаляются users, photos и тексты, заявки доступа/улучшения,
ручные начисления, metadata guest_document_claims, связанные guest_documents,
guest_storage_retirements и гостевые сессии аккаунта. Их старые cookie
перестают работать. Удаляются записи notification_outbox регистрации и
заявок этого аккаунта. Уже отправленные уведомления не отзываются.
Email login codes удаляются, если email больше не используется другим
аккаунтом. Обезличенные llm_attempt_events и другие аккаунты сохраняются.
Passport при следующем запросе не находит удалённый users ID: старая сессия
получает 401. Новая регистрация использует обычные начальные правила проекта.

Файлы не удаляются до успешного COMMIT. В той же транзакции создаются
account_deletion_jobs (UUID/время/счётчики без email и текста) и
account_deletion_files (пути для повторной очистки, без FK на users).
После commit сервер пытается очистить до 100 файлов; незавершённая очистка
возвращает HTTP 202 и сообщение «Файлы ещё очищаются». Есть status API,
кнопка повторения и worker раз в минуту при работающем backend. CLI может
выполнить очередь без backend. Дополнительный cron для аккаунтов не требуется.

Очистка повторяет проверку живых ссылок из photos, guest_documents, claims
и source/destination/temp в `guest_file_intents` (035).
Короткая блокировка таблиц закрывает гонку появления новой ссылки между
проверкой и unlink. Общие файлы сохраняются; завершённые queue-пути удаляются.
Ошибка FS оставляет задачу; отсутствующий файл считается уже очищенным.
На Linux после unlink синхронизируется каталог до отметки о завершении.
Сбой COMMIT очистки допускает безопасный повтор.

Разрешены только обычные плоские файлы в uploads, uploads/users,
uploads/guests; обход пути, симлинки/junction запрещены. Рекурсивного удаления
нет. Небезопасный путь до удаления блокирует всю операцию; после commit
такой сбой остаётся в очереди для разбора.

После аварии переноса также убираются точная подготовленная копия
claimed-ID-filename и её UUID.tmp, если сохранившаяся guest_document и
converted_user_id доказывают принадлежность аккаунту. Неизвестные файлы без
таких связей не удаляются. Новая 035 регистрирует точные destination/temp до
начала записи: при удалении аккаунта эти пути попадают в очередь, а строки
журнала удаляются в той же транзакции. Активный intent writer блокирует
удаление; чужой журнал защищает файл от worker. Совместимость проверена
последовательным прогоном 8 октября.

Данные могут оставаться в исторических бэкапах до окончания действующего
срока хранения. История копий, S3 и сроки в этой задаче не изменены.
Удаление личных архивов по неактивности не реализовывалось.

## Публикация — команды Ольги

Сначала принимающий агент проверяет результат, завершает live-приёмку,
делает согласованный commit/push. Не использовать `git add .`: в папке
есть отдельные незакоммиченные OCR/LLM, гостевые и документальные изменения.
Общий локальный последовательный прогон 8 октября описан в GUEST_STORAGE_REPORT.md.
Если гостевой переход ещё не опубликован, совместить эти команды с полным
runbook `docs/GUEST_STORAGE.md`, включая TTL=240, dry-run/переход и ежедневный cron.

```bash
cd /root/myworld
git status --short --branch
# При незакоммиченных изменениях остановиться и разобраться.
mkdir -p /root/myworld-backups
git rev-parse HEAD > /root/myworld-backups/before-account-deletion.commit
install -m 600 server/.env /root/myworld-backups/before-account-deletion.env
pm2 stop myworld-server
DOTENV_CONFIG_QUIET=true ./scripts/backup-production.sh
# Продолжать только после успешного бэкапа и записи имени готовой тройки файлов.
git pull --ff-only origin main
nano server/.env
```

В .env задать `ADMIN_PROTECTED_USER_IDS` со ВСЕМИ ID административных
аккаунтов Ольги. Не копировать примерные/тестовые ID. Проверить CLIENT_URL
и SERVER_URL. Если список пока не определён, оставить пустым: админка
работает, удаление отключено.

```bash
cd /root/myworld
npm ci --prefix server
npm ci --prefix client
cd server
npm run db:migrate
npm run db:status
node --input-type=module <<'NODE'
import { configuredProtection } from './services/accountDeletionPolicy.js';
import { query, closeDatabaseConnection } from './db/index.js';
try {
  if (!configuredProtection.valid) throw new Error('Set valid ADMIN_PROTECTED_USER_IDS');
  const r = await query('select count(*)::int as n from users where id = any($1::bigint[])', [configuredProtection.ids]);
  if (r.rows[0].n !== configuredProtection.ids.length) throw new Error('Protected IDs must exist');
  const fk = await query("select confdeltype from pg_constraint where conrelid='payments'::regclass and conname='payments_user_id_fkey'");
  if (fk.rows[0]?.confdeltype !== 'r') throw new Error('Payment RESTRICT migration missing');
  console.log({ protectedCount: r.rows[0].n, paymentDeleteRule: 'RESTRICT' });
} finally { await closeDatabaseConnection(); }
NODE
```

Не продолжать при ошибке миграции или проверки. Миграции должны включать
033, 034 и 035. Гостевой transition/cleanup при общей публикации выполняется
по отдельному runbook только после просмотра dry-run Ольгой.

```bash
cd /root/myworld
npm run build --prefix client
cd server
node scripts/cleanupDeletedAccounts.js --dry-run
# Для существующих подтверждённых заданий очереди:
node scripts/cleanupDeletedAccounts.js --apply
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
curl --fail --silent --show-error https://word2you.ru/api/health
```

Новые зависимости/настройки nginx для этого изменения не требуются.
При изменённом nginx в общей публикации — его проверка/reload по тому runbook.

## Проверка production — только Ольга

1. В /admin-control проверить причины запрета у защищённого ID и аккаунта
   с платежом. Не удалять реальных пользователей для проверки.
2. На специально созданном одноразовом тестовом аккаунте без платежей
   открыть подтверждение на компьютере и узкой ширине. Проверить отмену
   и неправильный ID: аккаунт остаётся.
3. Удалить этот одноразовый аккаунт с правильным ID. Проверить обновление
   списка, исчезновение документов и доступ старой сессии. Если написано
   «Файлы ещё очищаются», проверить окончание/повтор очереди.
4. Повторно зарегистрировать тот же тестовый способ входа: новый ID,
   пустой архив, обычные начальные лимиты. Не создавать реальную оплату.

Для диагностики очереди без содержимого документов:

```bash
cd /root/myworld/server
node scripts/cleanupDeletedAccounts.js --dry-run
pm2 logs myworld-server --lines 100 --nostream
```

Не запускать regression-тесты на production: новые тесты специально
отказываются от удалённой БД, а приёмочные данные должны быть одноразовыми.

## Откат

Откат кода не восстанавливает уже удалённые аккаунты. Для восстановления
данных нужна согласованная парная копия БД+uploads ДО удаления по
`docs/BACKUP_RESTORE.md`. Нельзя восстановить только БД без её файлов.
Исторические копии не менять. Для совместного гостевого перехода учитывать
его отдельный rollback runbook.

Для выключения только удаления оставить ADMIN_PROTECTED_USER_IDS пустым
в .env и перезапустить backend. Queue worker продолжит уже подтверждённую
очистку; для расследования остановить backend и не запускать CLI --apply.

Откат кода выполняется в основной серверной папке при чистом Git:

```bash
cd /root/myworld
pm2 stop myworld-server
git status --short
git switch --detach "$(cat /root/myworld-backups/before-account-deletion.commit)"
npm ci --prefix server
npm ci --prefix client
npm run build --prefix client
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
curl --fail --silent --show-error https://word2you.ru/api/health
```

Миграцию 034 автоматически не откатывать: RESTRICT и защита оплаченных
начислений совместимы с предыдущим кодом и сохраняют платежи. Queue-таблицы
оставить, иначе потеряется возможность завершить уже подтверждённую очистку.
При откате на код без worker очередь можно закончить сохранённым проверенным
CLI до отката, либо вернуть новый код для её обработки.
