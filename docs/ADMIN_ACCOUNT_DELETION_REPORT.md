# Отчёт принимающему агенту: удаление аккаунтов

Итог приёмки 8 октября: принимающий агент независимо запустил совместные
63 серверные проверки в изолированных локальных схемах — все прошли.
Сборка клиента и lint изменённых JSX/API прошли. Компонент подтверждения
проверен на desktop и ширине 375 px. Полный пользовательский интерфейс
проверяет Ольга по `docs/LOCAL_REVIEW_STORAGE_AND_ADMIN.md`; публикация ещё
не выполнена. Общий порядок: `docs/DEPLOY_STORAGE_AND_ADMIN_DELETION.md`.

7 октября 2026. Реализация по `docs/ADMIN_ACCOUNT_DELETION_TASK.md` готова
к приёмке с явно указанными ниже ограничениями. Общая папка освобождена
для последующей доработки гостевого хранения после этого финального отчёта.

Работа началась только после `completed` гостевого чата
01a116c6-a19b-7e92-9f5b-7341dadbaad2 и чтения его полного финального ответа
и `docs/GUEST_STORAGE_REPORT.md`. Предыдущие изменения сохранены.
Ветка main не переключалась; commit/push/reset/stash не выполнялись.
Worktree, копии проекта, постоянные серверы и субагенты не создавались.
Production, платные API и отправка сообщений не использовались.

## Итоговая схема

- Карточка: серверная причина недоступности → «Удалить аккаунт» → modal
  с ID, именем/email, числом документов архива, последствиями и вводом ID.
  Отмена не вызывает API. Синхронный pending ref и disabled блокируют дубль.
  Успех закрывает карточку, очищает selection и обновляет список, заявки
  и начисления. Ошибки понятны; подтверждение оплаты/защиты выполняет сервер.
- `requireAdmin` сохранён; отдельный session CSRF token, custom header,
  проверка Origin и Fetch Metadata защищают DELETE/retry. Карточка/status
  не кэшируются. Гость/обычный Passport пользователь не имеют admin-доступа.
- `ADMIN_PROTECTED_USER_IDS`: непустой строгий список существующих ID.
  Пустое значение, синтаксическая ошибка или несуществующий ID выключают
  удаление. Список задаёт Ольга; не угадывали аккаунты по имени/логину.
  Текущий `req.user` защищён отдельно.
- Любая запись payments, независимо от статуса, блокирует удаление.
  Начисление с payment_id или source != manual также блокирует. Платежи
  не удаляются. Миграция 034 меняет payments.user_id CASCADE на RESTRICT;
  users FOR UPDATE + FK key-share закрывают оба порядка гонки с INSERT
  платежа. Триггеры защищают оплаченные начисления даже без полной истории.
- Shared account lock для upload/process/corrections/delete-photo/claim,
  exclusive для удаления; обработчик удерживает lock до конца, даже после
  отключения клиентского сокета. Сетевые OCR/LLM не держат транзакции.
  photos.processing и заявка in_review дают отказ с просьбой подождать.
- Повторная проверка защиты/платежей/состояния и удаление — одна транзакция.
  Guest transaction locks используют существующие namespaces сессий и
  maintenance. Новые FK guest_document_claims и guest_storage_retirements
  учтены; чужие/противоречивые связи блокируют операцию.
- Удаляются users, photos с текстами, заявки доступа/улучшения, ручные
  начисления без оплаты, metadata claims, связанные гостевые документы,
  сессии и retirement-строки, собственные записи Telegram outbox. Коды email
  удаляются только при отсутствии другого аккаунта с тем же email. Уже
  доставленные уведомления и обезличенные LLM события сохраняются.
- Старые Passport/guest cookie не получают доступ; вход создаёт новый users
  ID и обычный начальный доступ без прежних документов/начислений.
- До COMMIT файлы только проверяются. В транзакции создаются UUID job и
  отдельные queue-пути без FK на удаляемый users. После COMMIT — bounded
  очистка (100 файлов), при остатке HTTP 202 и «Файлы ещё очищаются».
  Status/retry доступны администратору; worker раз в минуту и CLI завершают
  очередь после ошибки/перезапуска. Потеря COMMIT очистки допускает повтор.
- Перед unlink повторно проверяются все живые ссылки, короткая table lock
  исключает новую ссылку между проверкой и удалением. Общие файлы сохраняются.
  Завершённые queue-пути удаляются; jobs оставляют только UUID/время/счётчики.
  Ошибка FS сохраняет очередь. Отсутствующий файл считается очищенным.
  На Linux unlink закрепляется fsync каталога до отметки о завершении.
- Только плоские обычные файлы uploads root/users/guests, без рекурсивного
  удаления, обхода пути или следования симлинкам/junction. Небезопасный
  путь до удаления блокирует всю операцию; после COMMIT остаётся для разбора.
- Для аварии guest claim до COMMIT учитывается точная prepared copy и её
  UUID.tmp, когда собственная сохранившаяся guest_document и converted_user_id
  доказывают владельца. Неизвестные файлы без такой связи не удаляются.
  Исторические бэкапы сохраняются до действующего срока; S3/retention не менялись.

## Точный перечень моих файлов

Все пути относительно `C:\Users\olgak\PROJECTS\myworld`.

Изменены, 9 файлов:

1. `client/src/pages/AdminPage.jsx` — подключение действия, возврат в список,
   обновление связанных разделов, сообщение/статус очистки.
2. `client/src/services/adminApi.js` — DELETE/status/retry и CSRF header.
3. `server/.env.example` — описание ADMIN_PROTECTED_USER_IDS.
4. `server/config/env.js` — только export ADMIN_PROTECTED_USER_IDS.
5. `server/routes/adminRoutes.js` — eligibility в карточке, DELETE/status/retry,
   защита запроса, технический лог и понятные ошибки.
6. `server/routes/photoRoutes.js` — account-operation wrappers; upload ждёт
   окончания multer/обработчика, чтобы не освободить lock раньше завершения.
7. `server/server.js` — запуск минутного worker очистки.
8. `server/services/guestClaimService.js` — shared account lock, проверка
   существования users после его захвата, защита исчезнувшей гостевой сессии.
9. `docs/ROADMAP.md` — только верхний пункт удаления аккаунтов, его прогресс
   и незавершённые live/production проверки; гостевые/прочие изменения сохранены.

Добавлены, 11 файлов:

10. `client/src/components/AdminDeleteAccount.jsx`
11. `client/src/components/AdminDeleteAccount.css`
12. `server/db/migrations/034_admin_account_deletion.sql`
13. `server/services/accountDeletionPolicy.js`
14. `server/services/accountDeletionService.js`
15. `server/services/accountDeletionCleanupService.js`
16. `server/services/accountOperationLocks.js`
17. `server/scripts/cleanupDeletedAccounts.js`
18. `server/tests/adminAccountDeletion.test.js`
19. `docs/ADMIN_ACCOUNT_DELETION.md`
20. `docs/ADMIN_ACCOUNT_DELETION_REPORT.md`

Собственные review-артефакты в work (не для публикации):

- `work/build-account-deletion-ui.cjs`
- `work/account-deletion-ui.html` — настоящий компонент + искусственные
  ответы, без сервера/БД/сетевого удаления.
- `work/account-deletion-tests.log` — промежуточный прогон.
- `work/account-deletion-guest-recheck.log` — отдельный успешный гостевой прогон.
- `work/account-deletion-tests-final.log` — итоговые 46/46.

`client/dist` пересобран, игнорируется Git. `client/src/App.css` полностью
возвращён к исходному содержимому: новые стили подключаются отдельным CSS
компонента. server/package.json, OCR/LLM, quality, guestStorage services,
гостевой ТЗ/отчёт, backup/restore, экономические документы и прочий work
не изменялись этой задачей. Не использовать общий `git add .`.

Принимающему агенту: поскольку изменены общие env/routes/claim/ROADMAP,
их diff относительно HEAD включает ранее принятую гостевую работу и другие
существовавшие изменения. Сопоставить этот перечень с гостевым отчётом.

## Проверки

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
node --test --test-concurrency=1 tests/adminAccountDeletion.test.js tests/guestStorage.test.js tests/adminUserAnalyticsRoutes.test.js tests/guestUploadDiagnostics.test.js tests/guestDocumentImprovementStatus.test.js tests/documentContentRepository.test.js tests/improvementRequestsRepository.test.js
```

**46/46 прошли**: 17 новых deletion-сценариев, 18 гостевых, 11 связанных.
Серверные HTTP listener тестов остановлены, временные deletion/storage
схемы и искусственные файлы удаляются в after. Новые тесты отказываются
работать с удалённой БД и отключают ключи внешних API. Старые связанные
DB-тесты используют свои искусственные записи.

Проверено:

- реальный admin login/CSRF/DELETE, удаление всех связанных строк и файлов;
- все 5 статусов платежей, прямой DELETE и защита RESTRICT на уровне БД;
- paid credits без платежа и ручное начисление со ссылкой на чужой платёж;
- protected/current ID, пустая/плохая конфигурация, несуществующий protected ID;
- guest/ordinary session, неправильный/отсутствующий CSRF, Origin/cross-site;
- preview/отмена без мутации, неправильный confirmation, invalid/unknown ID,
  повтор и два одновременных удаления;
- настоящая deferred FK ошибка PostgreSQL при COMMIT: rows/queue rollback,
  файлы остаются; FS EACCES, dry-run, повтор, отсутствующий файл;
- общие файлы пользователя/гостя, выход за uploads, junction;
- processing/in_review, account/guest/maintenance locks;
- оба порядка одновременного INSERT payments и оплаченного начисления;
- старая настоящая Passport сессия → 401, старый guest cookie не переносит
  документы новому аккаунту; повторная регистрация с новыми начальными данными;
- prepared copy + UUID temp после аварии переноса при доказанном владельце;
- status/retry API требует admin и CSRF;
- весь предыдущий гостевой набор, включая настоящий COMMIT failure,
  конкурентную очистку, transfer и упаковку вложенных папок.

Первый совместный параллельный запуск конфликтовал advisory locks и файловыми
проверками разных схем. Последовательный прогон обязателен. Промежуточный
пограничный HTTP-тест expires_at=now() не прошёл; отдельный повтор 18/18 и
итоговый последовательный 46/46 прошли без изменения гостевого кода/теста.
Точная граница 240 часов дополнительно покрыта детерминированным unit-тестом.

```powershell
cd C:\Users\olgak\PROJECTS\myworld\client
npm run build -- --configLoader runner
node node_modules/eslint/bin/eslint.js src/components/AdminDeleteAccount.jsx src/pages/AdminPage.jsx
```

Сборка и ESLint прошли. В песочнице обычный Vite config loader сначала
упирался в чтение родительского каталога; штатный configLoader runner прошёл.
Предупреждения: существующий размер JS chunk >500 KB и возраст
baseline-browser-mapping; зависимости не обновлялись.
JS syntax и git diff --check проверены. CRLF предупреждения не являются ошибками.

Локально в основной БД применена **только новая миграция 034**;
033 была применена предыдущей задачей. 034 не удаляет/переносит накопленные
строки или файлы. .env этой задачей не менялся, реальные ID не угадывались;
по умолчанию удаление остаётся отключённым до настройки protected IDs.

## Интерфейс и ограничения

Принимающий агент независимо выполнил headless Edge проверку подготовленного
HTML-компонента: confirmation, cancel, protected, busy, error, success,
mobile-layout. `work/account-deletion-ui-review.json`: ok=true, pageErrors=[].
Desktop/mobile (375px) скриншоты просмотрены им; макет читаемый,
горизонтальной прокрутки нет. Это независимая проверка принимающего агента.

Его артефакты `work/verify-account-deletion-ui.cjs`,
`work/account-deletion-ui-review.json`, `work/account-deletion-desktop.png`,
`work/account-deletion-mobile.png` **не мои изменения**, не входят в перечень выше.

Полный live AdminPage через Browser Plugin не проверен: после возобновления
kernel дважды завершился с `windows sandbox failed: helper_unknown_error:
setup refresh had errors`. У tool нет параметра escalation. Обычный exec
и node_repl тоже перестали запускаться; дальнейшие необходимые shell-проверки
выполнены через штатный require_escalated, автоматически одобрены.
Обход песочницы/управление открытыми окнами/перехват мыши не использовались.

Production, реальные платежи, OCR/LLM, Linux fsync и полный S3 restore
не проверялись. Уже выгруженные пользователем файлы/исторические бэкапы и
отправленные уведомления нельзя отозвать этой операцией. Неизвестные файлы
без доказанной связи сохраняются для отдельного ручного разбора.

Удаление защищает uploads/process/claim в текущей схеме. Принимающий агент
сообщил о последующей доработке гостевого хранения: иные аварийные копии
до guest_documents/до COMMIT и возвращение условного обогащения при входе.
Эту доработку здесь не реализовывал. После неё обязательно повторить общий
последовательный прогон и проверить, что новые операции/журналы используют
account locks и учтены в deletion/cleanup. Поэтому production-пункт ROADMAP
не отмечен выполненным.

## Команды и передача

Полный runbook: `docs/ADMIN_ACCOUNT_DELETION.md` — конкретные команды
backup, сохранения прежнего commit/env, обновления main, настройки ID,
033/034 migrations и проверки RESTRICT, сборки, очистки очереди,
restart/health, production-проверки только одноразового аккаунта и отката.
При общей публикации учитывать `docs/GUEST_STORAGE.md`.

Ключевая последовательность после принятого commit/push, успешного backup
и ручной настройки Ольгой **всех** административных protected IDs:

```bash
cd /root/myworld
git pull --ff-only origin main
npm ci --prefix server
npm ci --prefix client
cd server
npm run db:migrate
npm run db:status
# Проверить protected IDs и RESTRICT командами из runbook.
cd /root/myworld
npm run build --prefix client
cd server
node scripts/cleanupDeletedAccounts.js --dry-run
node scripts/cleanupDeletedAccounts.js --apply
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
curl --fail --silent --show-error https://word2you.ru/api/health
```

Откат кода не возвращает удалённые данные. Для data restore — парная копия
БД+uploads ДО удаления по BACKUP_RESTORE. Миграцию 034 автоматически не
откатывать: сохранить RESTRICT, paid-credit guards и queue для повтора.
Live приёмка, последующая гостевая интеграция, commit/push и публикация
переданы принимающему агенту/Ольге; не объявляются выполненными.
