# Приёмка гостевого хранения

Итог независимой приёмки 8 октября: 63/63 совместных серверных проверок
прошли в изолированных локальных схемах. Сборка клиента прошла. Полную
ручную проверку выполняет Ольга по `docs/LOCAL_REVIEW_STORAGE_AND_ADMIN.md`.
Общая публикация: `docs/DEPLOY_STORAGE_AND_ADMIN_DELETION.md`.

8 октября 2026. Доработка завершена локально в `C:\Users\olgak\PROJECTS\myworld`.
Ветка main не менялась; commit/push/reset/stash, worktree, субагенты и постоянные
серверы не использовались. Production и платные OCR/LLM не вызывались.

## Результат

- `guest_file_intents` фиксируется отдельным commit до открытия гостевого
  файла или копирования. Записываются точные destination и UUID-temp, исходный
  expiry, guest/session/user IDs. Нет каскадных FK: запись переживает rollback
  переноса и исчезновение гостевого документа/сессии. Отказ журнала запрещает FS.
- Очистка зарегистрированных остатков работает в том же guest cleanup
  (10 октября Ольга согласовала ежедневный запуск вместо ежечасного),
  порциями по 100: account/session/intent locks, короткая блокировка таблиц,
  проверка ссылок photos/guests/claims/retirements/других intents. После hard kill
  upload, partial temp и prepared users-copy убираются по исходному expiry без
  повторного входа. Отменённые операции убираются раньше; ошибка FS сохраняет
  журнал для повтора. Живой архив, чужие ссылки и неизвестные users-файлы
  не удаляются по возрасту. Чужой/незарегистрированный destination не перезаписывается.
- Multer получает имя только после регистрации. Обрыв multipart закрывает
  writer; session/intent locks держатся до закрытия файла. Ошибка после сохранения
  guest_documents сохраняет файл вместе с существующей строкой.
- Перенос атомарно создаёт photos/claim metadata, удаляет гостевой текст и
  меняет счётчик. Локальная копия/fsync выполняется под блокировкой гостевой
  строки в этой транзакции; запись intent фиксируется отдельным commit.
  После commit удаляется оригинал. Имя photos.filename остаётся исходным,
  физический путь меняется на users/claimed-ID-original-filename: frontend
  pending-result → archive handoff продолжает находить ту же запись.
- Восстановлено прежнее условное обогащение при входе: processed, OCR >=10,
  пустые title/summary/clean_text, обычный guard пользователя/провайдера.
  Сеть вне транзакции; account/session locks держатся весь вызов. Pending
  позволяет продолжить после переноса без нового archive; успешное/ошибочное
  завершение и photo сохраняются атомарно. Изменившийся updated_at защищает
  более новый пользовательский результат от позднего AI. Все тестовые вызовы — mocks.
- Claimed-запись читается через compatibility view, но HTTP list/file/corrections/
  retry требует авторизованного владельца photos. Logout и другой аккаунт со
  старой guest cookie получают пустое состояние/404, исправления не меняются.
  До переноса гостевой доступ по своей cookie сохраняется. GET state и file
  отвечают `Cache-Control: private, no-store`; заголовок проверен в HTTP тестах.
  Expiry проверяется
  также в SQL относительно PostgreSQL now(), включая точную границу срока.
- Интеграция удаления аккаунтов сохранена: новые intent destination/temp
  попадают в очередь до удаления данных, активный writer блокирует удаление,
  worker сохраняет чужие source/destination/temp. Защита оплат и protected IDs
  не менялась. CLI и test hooks закрывают все новые пулы.

## Точный список файлов моей задачи

Исходные изменения гостевого хранения и текущая доработка:

1. `docs/GUEST_STORAGE.md`
2. `docs/GUEST_STORAGE_REPORT.md`
3. `docs/BACKUP_RESTORE.md`
4. `docs/ROADMAP.md` — дата, пункт гостевого хранения сверху и блок его локальной проверки.
5. `scripts/backup-production.sh` — ранее тихое dotenv чтение, без смены S3/retention.
6. `scripts/restore-rehearsal.sh` — ранее nested storage_path/подсчёт вложенных файлов.
7. `server/.env.example` — гостевой TTL; административные добавления принадлежат другой задаче.
8. `server/config/env.js` — TTL=240; административные добавления сохранены.
9. `server/config/paths.js` — private guests/users, проверка директорий.
10. `server/repositories/guestDocumentsRepository.js` — даты, replacement retirement, view,
    фильтр claimed по текущему владельцу и SQL expiry.
11. `server/repositories/usersRepository.js` — счётчик переноса через claim metadata.
12. `server/routes/guestRoutes.js` — intent до streaming, writer/locks, доступ claimed.
13. `server/routes/photoRoutes.js` — users-directory; account wrappers другой задачи сохранены.
14. `server/services/guestClaimService.js` — исходный перенос + account integration + conditional enrichment.
15. `server/utils/guest.js` — точные elapsed 240 часов.
16. `server/db/migrations/033_guest_storage.sql` — исходная новая миграция, не редактировалась в доработке.
17. `server/scripts/cleanupGuests.js`
18. `server/scripts/transitionGuestStorage.js`
19. `server/services/guestCleanupService.js`
20. `server/services/guestStorageFiles.js`
21. `server/services/guestStorageLocks.js`
22. `server/services/guestStorageService.js`
23. `server/services/guestStorageTransitionService.js`
24. `server/tests/guestStorage.test.js`

Новые файлы доработки:

25. `server/db/migrations/035_guest_file_intents.sql`
26. `server/repositories/guestFileIntentsRepository.js`
27. `server/services/guestFileIntentService.js`
28. `server/tests/fixtures/guestStorageCrash.js`

Дополнительные изменения для атомарного enrichment и совместимости админки:

29. `server/repositories/photosRepository.js` — необязательный `{client}` для сохранения результата в текущей транзакции.
30. `server/services/accountDeletionService.js` — discovery/guard/locks/queue/delete для intents; остальная защита сохранена.
31. `server/services/accountDeletionCleanupService.js` — intents в table lock/reference check.
32. `server/tests/adminAccountDeletion.test.js` — 2 новых случая intents, закрытие intent pool.
33. `docs/ADMIN_ACCOUNT_DELETION.md` — 035 и подтверждённая интеграция journals/worker.

Не редактировал OCR/LLM-реализацию, их отдельные тесты, package.json/server.js,
компонент админки, accountOperationLocks, миграцию 034, billing/economics и
`docs/DEPLOY_STORAGE_AND_ADMIN_DELETION.md`. Это чужие изменения общей папки;
не использовать `git add .`. Общий deployment runbook обновляет принимающий агент.

Локальный `.env`: ранее только GUEST_DOCUMENT_TTL_HOURS=240; в этой доработке
не редактировался. Применена только новая 035 после fail-closed проверки local
host и pending списка из одного файла. 033/034 уже были применены; их содержимое
сохранено. Накопленные локальные файлы/документы не переходили и не очищались.

Артефакты в work/: `guest-storage-tests-2026-10-08.log` — итоговый тестовый лог,
`apply-local-guest-intents.mjs` — guard/local migration script,
`GUEST_STORAGE_RESUME.md` — состояние для продолжения. Старый
`work/guest-storage.patch` относится к 7 октября и не содержит текущую доработку;
его нельзя применять как итоговый diff. Для приёмки смотреть актуальные файлы.

## Проверки

```powershell
cd C:\Users\olgak\PROJECTS\myworld\server
node --test --test-concurrency=1 tests/adminAccountDeletion.test.js tests/guestStorage.test.js tests/adminUserAnalyticsRoutes.test.js tests/guestUploadDiagnostics.test.js tests/guestDocumentImprovementStatus.test.js tests/documentContentRepository.test.js tests/improvementRequestsRepository.test.js
```

**63/63, без skipped:** 33 хранения, 19 удаления аккаунтов, 11 связанных проверок.
Прогон последовательный, чтобы общие advisory namespace не пересекались.

Дополнительно к исходным 18 сценариям хранения: настоящий Node child SIGKILL
во время HTTP streaming до guest_documents, во время partial UUID-temp и после
готовой копии до photo insert/commit; исходный срок, cleanup/retry, один archive,
защита живого archive, DB отказ до FS, обрыв multipart, исчезнувшая сессия,
missing/IO retry, отсутствие sweep старых users-файлов, конфликт destination,
conditional enrichment/concurrent login/disabled guard/error/pending recovery,
сетевой вызов без открытой transaction, блокировка удаления во время enrichment,
более новый пользовательский результат, filename handoff и owner/logout/other
HTTP read/file/corrections/retry. В админке — точные unfinished пути и чужой intent.

Новые storage/deletion тесты используют временные схемы локального PostgreSQL,
искусственные файлы и пустые paid API keys; child отказывается запускаться без
local host и storage_test schema. Старые связанные DB-тесты создают свои
синтетические строки в локальной основной БД и убирают их. Локальные HTTP
серверы, child процессы и пулы после прогона закрыты.

JS syntax (17 файлов), `git diff --check` и отдельный `bash -n` обоих
backup/restore скриптов прошли. Остаточных storage-test/deletion-test файлов нет.
Ручной Browser Plugin/UI чек выполняет Ольга; полный Linux/S3 restore и
production не запускались. Распознавание в tests не обращалось к платным API.

## Публикация, миграция, restart и проверка

Полный порядок backup, TTL=240, миграций 033/034/035, перехода накопленных
данных, сохранения существующего cron, restore и ручных production проверок:
`docs/GUEST_STORAGE.md` + `docs/ADMIN_ACCOUNT_DELETION.md`.

После готового backup и согласованного commit/push команды выполняет Ольга:

```bash
pm2 stop myworld-server
cd /root/myworld
git pull --ff-only origin main
cd server
npm run db:migrate
node scripts/transitionGuestStorage.js --dry-run
# Ольга проверяет план до apply накопленных данных:
node scripts/transitionGuestStorage.js --apply
node scripts/transitionGuestStorage.js --dry-run
node scripts/cleanupGuests.js --dry-run
node scripts/cleanupGuests.js --apply
pm2 restart myworld-server --update-env
pm2 logs myworld-server --lines 50 --nostream
curl --fail https://word2you.ru/api/health
```

В браузере — гостевой результат → вход → один archive с прежним именем,
logout/другой аккаунт со старой cookie без доступа к archive, затем владелец
со своим доступом. Cron очищает также intents: итоговые `intentsFinished` и
`intentFilesRemoved`, ошибки оставляют журнал. При общей публикации также
нужны сборка клиента и проверка protected IDs/RESTRICT из инструкции админки.

## Ограничения

Произвольные исторические файлы без журнала не удаляются автоматически; root
legacy без ссылок только показан для ручного разбора. За живым зависшим writer
сначала нужен штатный restart, пока соединение живо cleanup его пропускает.
Граница TTL в tests моделируется на синтетических строках; реальные данные
не старились. SIGKILL моделирует завершение приложения, а не аппаратный сбой
диска или отключение PostgreSQL. Удалённые данные остаются в старых бэкапах
до действующего срока retention. Приёмка/production в ROADMAP остаются открыты.
Если приложение погибло после ответа LLM до сохранения результата, pending
позволяет повторить вызов при следующем входе; exactly-once внешнего API
не гарантируется. Архив при повторе не дублируется.
