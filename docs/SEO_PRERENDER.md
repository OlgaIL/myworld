# Исходный HTML публичных страниц

`npm run build --prefix client` собирает клиент и пререндерит `/`,
`/photo-to-text`, `/handwriting-to-text` существующими React-компонентами.
HTML хранится в `client/dist/.prerender/`; Express отдаёт его только по
соответствующему маршруту. Прямые адреса `.prerender` возвращают 404.
Title, description и canonical берутся из `client/src/publicPageSeo.js`.
Клиент гидратирует тот же AppShell, а head обновляется при SPA-навигации.

Главная сначала показывает публичный GuestHome с отключённой загрузкой,
пока не загружено состояние авторизации. Затем работают прежние гостевой
режим или кабинет. Персональные данные в сборочный HTML не включаются.
Уведомление cookie читает localStorage после гидратации.

## Локальная проверка

```powershell
npm run build --prefix client
npm run test:seo --prefix server
npm test --prefix client
```

HTTP-тесты проверяют фактические файлы сборки: уникальные title, description,
H1, основной текст, внутренние ссылки, один canonical и OG; одинаковую
выдачу обычному User-Agent и YandexBot; HEAD, robots, sitemap, etext,
redirects, private noindex и 404. HTTP-тесты сами выполняют сборку.

Дополнительно при установленном Playwright и браузере:

```powershell
$env:PLAYWRIGHT_MODULE_PATH='C:\Users\olgak\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:SEO_BROWSER_EXECUTABLE='C:\Program Files\Google\Chrome\Application\chrome.exe'
Push-Location server
node scripts/verifySeoBrowser.mjs
Pop-Location
```

Smoke проверяет гидратацию без ошибок React, head, карусель и lightbox,
SPA-переходы, гостевой выбор файла и открытие email-входа. Все API мокированы,
внешние ресурсы блокируются. Реальные OAuth, отправка кода и OCR не проверяются.

## Публикация вручную Ольгой

После включения проверенного изменения в `main`:

```bash
cd /root/myworld
git status --short --branch
```

Продолжать только в чистой рабочей папке на `main`:

```bash
git pull --ff-only origin main && npm run build --prefix client && npm run test:seo --prefix server && pm2 restart myworld-server --update-env
```

Новые зависимости и миграции БД не нужны. Использовать именно `npm run build`,
а не прямой `vite build`: серверу необходимы три HTML-файла `.prerender`.
Сборка заменяет `dist`; не перезапускать сервер после неудачной сборки.

Проверки production выполняет только Ольга:

```bash
curl --fail --silent --show-error https://word2you.ru/api/monitor/health
for path in / /photo-to-text /handwriting-to-text; do
  curl --fail --silent --show-error "https://word2you.ru$path" | grep -oE '<title>[^<]*</title>|<meta name="description"[^>]*>|<link rel="canonical"[^>]*>|<h1[^>]*>[^<]*</h1>'
done
curl --silent --show-error -o /dev/null -w '%{http_code}\n' https://word2you.ru/seo-prerender-missing-check
curl --silent --show-error -I https://word2you.ru/account
curl --silent --show-error -I 'https://word2you.ru/handwriting-to-text?utm_source=check&etext=test&yclid=123'
curl --fail --silent --show-error https://word2you.ru/robots.txt
curl --fail --silent --show-error https://word2you.ru/sitemap.xml
```

Ожидания: health `ok`; три разных title, description и H1 с self-canonical;
несуществующая страница 404; `/account` с `X-Robots-Tag: noindex, nofollow`;
etext → 301 с сохранёнными utm_source и yclid. В браузере проверить загрузку
фото гостем, вход, карусель и переходы без повторных H1/head-тегов.
Это устраняет локально подтверждённый недостаток HTML; индексация Яндекса
и актуальный статус Вебмастера этим изменением не подтверждаются.
