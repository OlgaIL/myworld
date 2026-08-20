# Nginx: диагностика загрузки

Этот шаг выполняется вручную на боевом сервере после публикации клиентской и серверной части. Он не меняет обработку загрузки: только создаёт отдельный access log для `POST /api/guest/upload`.

## 1. Добавить формат и фильтр

Создайте файл `/etc/nginx/conf.d/word2you-upload-log.conf`:

```nginx
log_format word2you_upload
  'timestamp=$time_iso8601 request_id=$request_id upload_attempt_id=$http_x_upload_attempt_id '
  'status=$status request_time=$request_time upstream_status=$upstream_status '
  'upstream_response_time=$upstream_response_time request_length=$request_length '
  'body_bytes_sent=$body_bytes_sent user_agent="$http_user_agent"';

map $uri $word2you_upload_log {
  default 0;
  /api/guest/upload 1;
}
```

## 2. Подключить лог к серверу Word2you

В блоке `server` для `word2you.ru` в `/etc/nginx/sites-enabled/myworld.conf` добавьте:

```nginx
access_log /var/log/nginx/word2you-upload-access.log word2you_upload if=$word2you_upload_log;
```

## 3. Проверить и применить

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/word2you-upload-access.log
```

## 4. Проверить CORS для upload-заголовка

Конфигурация Nginx в репозитории не хранится: CORS отвечает Node.js через middleware `cors`,
а Nginx должен только проксировать OPTIONS-запрос к приложению.

После публикации выполните с компьютера:

```bash
curl -i -X OPTIONS https://word2you.ru/api/guest/upload \
  -H "Origin: https://word2you.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-upload-attempt-id"
```

В ответе должны быть:

```text
Access-Control-Allow-Origin: https://word2you.ru
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: content-type,x-upload-attempt-id
```

Если OPTIONS возвращает 404/405 или не доходит до Node.js, проверьте, что в Nginx
для домена нет отдельного `location` или правила, перехватывающего OPTIONS.

Для инцидента 18 августа 2026 года в 12:26 по Москве используйте окно примерно `09:20-09:35 UTC`.

Примеры полезных статусов: `499` — клиент закрыл соединение до ответа, `502` — Nginx не получил корректный ответ от Node, `504` — истёк таймаут ожидания upstream.
