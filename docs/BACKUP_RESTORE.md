# Бекапы и восстановление Word2you

Документ описывает минимальный план резервного копирования для боевого сервера Word2you.

## Что обязательно сохраняем

- Базу PostgreSQL из переменной `DATABASE_URL` в `server/.env`.
- Загруженные файлы из `/root/myworld/server/uploads`.
- Вложенные `uploads/guests/` и `uploads/users/` входят в тот же tar-архив;
  скрипт репетиции проверяет пути из `photos.storage_path`, включая обе папки.
- Боевые `.env` и приватные ключи провайдеров храним отдельно и безопасно. В git их не добавляем.

## Ручной бекап

Выполнить на боевом сервере:

```bash
cd /root/myworld
chmod +x scripts/backup-production.sh
./scripts/backup-production.sh
```

По умолчанию бекапы складываются сюда:

```bash
/root/myworld-backups
```

Скрипт создает:

- `myworld-db-YYYY-MM-DD_HH-MM-SS.dump` — дамп базы;
- `myworld-uploads-YYYY-MM-DD_HH-MM-SS.tar.gz` — архив загруженных файлов;
- `myworld-backup-YYYY-MM-DD_HH-MM-SS.txt` — описание бекапа и контрольные суммы файлов.

Сначала файлы создаются с временными именами. Готовыми они становятся только после того, как скрипт проверит дамп через `pg_restore` и архив через `tar`.

После первого запуска проверить результат:

```bash
ls -lh /root/myworld-backups
tail -n 30 /root/myworld-backups/backup.log 2>/dev/null || true
```

Дополнительно выбрать созданные файлы и проверить их вручную:

```bash
pg_restore --list /root/myworld-backups/myworld-db-ДАТА.dump | head
tar -tzf /root/myworld-backups/myworld-uploads-ДАТА.tar.gz | head
cat /root/myworld-backups/myworld-backup-ДАТА.txt
```

В выводе архива должна присутствовать папка `uploads/`. Значение `ДАТА` нужно заменить на дату и время из имени созданного файла.

## Ежедневный бекап

Открыть cron:

```bash
crontab -e
```

Добавить строку:

```cron
30 3 * * * cd /root/myworld && S3_BUCKET=word2you-backups /root/myworld/scripts/backup-production.sh >> /root/myworld-backups/backup.log 2>&1
```

Это будет запускать бекап каждый день в 03:30 по времени сервера и отправлять готовую тройку файлов в приватный S3-бакет.

Для S3 используется защищённый файл `/root/.s3cfg` с правами `600`. Ключи S3 не добавляются в git или cron.

## Копия вне сервера

Бекап на том же сервере защищает от ошибки в базе, но не защищает от потери сервера. Поэтому копию надо хранить отдельно:

- Timeweb Cloud Object Storage;
- другое S3-совместимое хранилище;
- отдельная машина;
- приватная облачная папка.

Минимальный ручной вариант с компьютера:

```bash
scp root@SERVER_IP:/root/myworld-backups/myworld-db-ДАТА.dump .
scp root@SERVER_IP:/root/myworld-backups/myworld-uploads-ДАТА.tar.gz .
scp root@SERVER_IP:/root/myworld-backups/myworld-backup-ДАТА.txt .
```

Нужно брать все три файла с одинаковой датой в имени.

## Восстановление на новом сервере

1. Установить Node.js, npm, PostgreSQL client tools, nginx и pm2.

2. Забрать код:

```bash
cd /root
git clone https://github.com/OlgaIL/myworld.git
cd /root/myworld
```

3. Восстановить боевой env:

```bash
/root/myworld/server/.env
```

4. Установить зависимости:

```bash
npm install --prefix server
npm install --prefix client
```

5. Получить `DATABASE_URL` из `.env`, не выводя его на экран:

```bash
DATABASE_URL="$(cd /root/myworld/server && DOTENV_CONFIG_PATH=/root/myworld/server/.env node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config({path: process.env.DOTENV_CONFIG_PATH, quiet: true}); process.stdout.write(process.env.DATABASE_URL || '')")"
export DATABASE_URL
```

6. Восстановить базу:

Для дампа ДО гостевого перехода новые таблицы отсутствуют в его TOC.
При восстановлении поверх уже обновлённой БД, с остановленным backend,
сначала убрать только дополнительные объекты гостевого хранения:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'drop view if exists guest_documents_visible; drop table if exists guest_file_intents; drop table if exists guest_document_claims; drop table if exists guest_storage_retirements;'
```

Этот шаг относится только к старому дампу без 033/035; для свежего снимка
обычный `pg_restore --clean` восстанавливает и журнал. Защиту платежей 034
вручную не отключать; совместное восстановление описано в runbook удаления.

```bash
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DATABASE_URL" /root/myworld-backups/myworld-db-LATEST.dump
```

7. Восстановить загруженные файлы:

```bash
cd /root/myworld/server
tar -xzf /root/myworld-backups/myworld-uploads-LATEST.tar.gz
```

8. Запустить миграции:

```bash
cd /root/myworld
npm run db:migrate --prefix server
```

9. До открытия приложения пользователям выполнить переход структуры (для старой
копии) и гостевую очистку. Backend должен оставаться остановленным:

```bash
cd /root/myworld/server
node scripts/transitionGuestStorage.js --dry-run
# После просмотра плана Ольгой:
node scripts/transitionGuestStorage.js --apply
node scripts/cleanupGuests.js --dry-run
node scripts/cleanupGuests.js --apply
```

Если скрипт возвращает `errors > 0`, устранить причину и повторить до запуска.
Срок считается от исходной загрузки, поэтому восстановленные просроченные
гостевые данные и зарегистрированные незавершённые upload/copy/temp удаляются.
Живой архив остаётся по ссылке `photos`. При текущем коде должны быть
применены 033/034/035. Инструкция: `docs/GUEST_STORAGE.md`.

10. Собрать клиент и перезапустить сервис:

```bash
npm run build --prefix client
pm2 restart myworld-server
sudo nginx -t
sudo systemctl reload nginx
```

11. Проверить:

```bash
curl https://word2you.ru/api/health
```

Затем руками проверить:

- вход;
- список записей;
- открытие существующей записи;
- превью загруженного изображения;
- тестовую загрузку.

Удаление гостевых документов из приложения не удаляет их из уже созданных
бэкапов. В старых локальных/S3-копиях они остаются до истечения действующего
срока хранения соответствующих копий. Этот срок и настройки S3 не изменены.

## Безопасная репетиция восстановления

Репетиция выполняется без остановки сайта и только в отдельную пустую базу
`word2you_restore_test`. Скрипт откажется работать с базой, имеющей другое имя,
и не использует `--clean`.

1. Создать отдельную пустую базу `word2you_restore_test` в Timeweb Cloud.

2. На сервере создать защищённый файл `/root/word2you-restore.env`:

```bash
sudo install -m 600 /dev/null /root/word2you-restore.env
sudo nano /root/word2you-restore.env
```

Содержимое:

```dotenv
RESTORE_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/word2you_restore_test
```

Строку подключения нельзя публиковать в чат или добавлять в git.

3. Если проверяется копия из S3, скачать три файла с одинаковой датой:

```bash
mkdir -p /root/myworld-restore-source
s3cmd --config=/root/.s3cfg get s3://word2you-backups/daily/myworld-db-ДАТА.dump /root/myworld-restore-source/
s3cmd --config=/root/.s3cfg get s3://word2you-backups/daily/myworld-uploads-ДАТА.tar.gz /root/myworld-restore-source/
s3cmd --config=/root/.s3cfg get s3://word2you-backups/daily/myworld-backup-ДАТА.txt /root/myworld-restore-source/
```

4. Запустить репетицию, заменив `ДАТА` на общую дату и время файлов:

```bash
cd /root/myworld
BACKUP_DIR=/root/myworld-restore-source bash ./scripts/restore-rehearsal.sh ДАТА
```

Скрипт:

- проверит имя целевой базы через URL и реальное подключение;
- убедится, что тестовая база пустая;
- проверит SHA256 из манифеста;
- восстановит дамп без удаления существующих объектов;
- распакует изображения только в `/root/myworld-restore-test/ДАТА/uploads`;
- посчитает пользователей, записи, платежи, начисления и файлы;
- проверит наличие изображения для каждой записи;
- создаст `restore-report.txt`.

Боевые `DATABASE_URL`, база и `/root/myworld/server/uploads` при этом не используются.

Полный запуск копии приложения с тестовой базой проводится отдельным вторым этапом.

5. Технически проверить запуск backend на восстановленных данных:

```bash
cd /root/myworld
bash ./scripts/verify-restored-server.sh ДАТА
```

Проверка создаёт временную копию серверного кода, подключает восстановленные
файлы, запускает backend только на `127.0.0.1:4100` и затем автоматически его
останавливает. В тестовой копии отключены обработка, OAuth, админка и оплата.
Боевой PM2-процесс и порт `4000` не затрагиваются.
