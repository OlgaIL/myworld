# Диагностика ошибок Timeweb — 17 октября 2026

Отдельная серверная правка: `server/services/timewebAiService.js`, его тесты,
этот документ и соответствующий пункт ROADMAP. Агент рабочий сайт не посещает.

В `TIMEWEB LLM ERROR` добавлены UTC-время, длительность и HTTP-код, если он
получен. Для `TIMEWEB_INVALID_JSON` — безопасные `validationReason` и `field`:
например, `MISSING_FIELD / notes`, `INVALID_VALUE / category`,
`JSON_SYNTAX / $`, `EMPTY_VALUE / formattedContent.blocks[0].text`.
Каждая ошибка теперь занимает одну строку JSON после прежнего префикса.
Текст документов, значения ошибочных полей, ключи, заголовки и тела ответов
API не записываются. Существующие проверки, обработка, повторы, таблицы,
счётчики и выбор провайдера не меняются. БД и env не изменяются.

Проверено локально: 44 теста прошли, один тест с настоящей БД пропущен;
в том числе 23 варианта причин отклонения и HTTP 400/401/403/422/429/500/503.
Использован локальный mock API, платных запросов не было.

## Публикация Ольгой

В PowerShell на локальном компьютере после коммита:

```powershell
Set-Location C:\Users\olgak\PROJECTS\myworld
git push origin main
```

На сервере сначала проверить состояние:

```bash
cd /root/myworld
git status --short
git log -1 --oneline
```

Если есть неожиданные изменения, остановиться и прислать вывод. Не делать
reset/clean/stash вслепую. При чистой рабочей папке выполнить блок целиком:

```bash
cd /root/myworld &&
before_timeweb_diagnostics=$(git rev-parse HEAD) &&
git pull --ff-only origin main &&
if ! git diff --quiet "$before_timeweb_diagnostics" HEAD -- client; then
  VITE_CLARITY_ENABLED=true VITE_CLARITY_HOSTS=word2you.ru npm run build --prefix client
fi &&
pm2 restart myworld-server --update-env &&
git log -1 --oneline
```

Миграций, новых зависимостей и изменений env для этой правки нет.
Требуется только перезапуск backend. В `origin/main` также уже есть коммит
`d0e58a9` с промостраницей: если его ещё нет на сервере, блок автоматически
соберёт обновлённый клиент, сохранив параметры Clarity. Если клиент между
старым и новым HEAD не менялся, сборка пропускается. Ранее таблицы и их
миграции были опубликованы по подтверждению Ольги.

Ольга проверяет после перезапуска:

```bash
curl --fail --silent --show-error https://word2you.ru/api/health
pm2 status myworld-server
```

Ожидаются `status: ok`, `database.connected: true`, процесс `online`.
Обычной загрузкой публичного тестового изображения проверить обработку текста.
Если клиент пересобирался, проверить промостраницу и открытие большого фото.
Не создавать намеренно ошибки оплаты, ключей и сети на рабочем сервере.

## Сбор новых причин

После накопления обычных обращений:

```bash
pm2 logs myworld-server --err --lines 3000 --nostream | grep 'TIMEWEB LLM ERROR:'
```

Прислать строки с новыми полями `timestamp`, `validationReason`, `field`
и/или `httpStatus`. Старые записи PM2 сохранят прежний многострочный формат;
история не переписывается. При отсутствии новых ошибок строк с новой
диагностикой может пока не быть. Эта правка причины показывает, но не устраняет.
