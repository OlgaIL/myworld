# Бекапы и восстановление Word2you

Документ описывает минимальный план резервного копирования для боевого сервера Word2you.

## Что обязательно сохраняем

- Базу PostgreSQL из переменной `DATABASE_URL` в `server/.env`.
- Загруженные файлы из `/root/myworld/server/uploads`.
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
DATABASE_URL="$(cd /root/myworld/server && DOTENV_CONFIG_PATH=/root/myworld/server/.env node --input-type=module -e "import 'dotenv/config'; process.stdout.write(process.env.DATABASE_URL || '')")"
export DATABASE_URL
```

6. Восстановить базу:

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
npm run db:migrate --prefix server
```

9. Собрать клиент и перезапустить сервис:

```bash
npm run build --prefix client
pm2 restart myworld-server
sudo nginx -t
sudo systemctl reload nginx
```

10. Проверить:

```bash
curl https://word2you.ru/api/health
```

Затем руками проверить:

- вход;
- список записей;
- открытие существующей записи;
- превью загруженного изображения;
- тестовую загрузку.

## Следующий шаг

Подключить автоматическую выгрузку архивов в Timeweb Cloud Object Storage и один раз провести тестовое восстановление.
