# Сборка, выкладка, инфраструктура

## Команды

```bash
npm install
npm run dev               # локально (Vite); ?seed=N — новый город без сохранения
npm test                  # Vitest, все тесты
npm run build             # tsc + vite build → dist/
npm run build:yandex      # → dist-yandex/ + gorod-dela-yandex.zip
npm run build:vk          # → dist-vk/ + gorod-dela-vk.zip
npm run build:crazygames  # → dist-crazygames/ + gorod-dela-crazygames.zip
```

- Сборка с `base: './'` — открывается из любой папки и из бакета Object Storage.
- Режим площадки (`--mode yandex|vk|crazygames`) задаёт `VITE_PLATFORM` и убирает из `index.html` перенаправление
  на наш домен (`vite.config.ts`).
- Архив площадки — `scripts/zip-portal.mjs`: `index.html` в корне, имена файлов латиницей без пробелов,
  не больше 1 500 файлов.

## Адреса

| Что | Адрес |
|---|---|
| Игра (основной) | https://www.gorod-dela.ru — Selectel |
| Запасной и превью | https://gorod-dela-play.website.yandexcloud.net, превью ветки — `/preview/<ветка>/` |
| ВКонтакте | приложение id 54881745 грузит https://www.gorod-dela.ru/vk/index.html — архив не нужен |
| Яндекс Игры, CrazyGames | загрузка архива вручную в консоли площадки |

## CI (`.github/workflows`)

| Workflow | Когда | Что делает |
|---|---|---|
| `deploy.yml` | пуш в `main` (кроме `art-src`, `scripts`, `*.md`, `social`, `server`) | сборка сайта и сборки ВК в `dist/vk`, выкладка в Yandex Object Storage и зеркало Selectel. Тесты в CI не гоняются — локально перед пушем |
| `preview.yml` | вручную | сборка ветки в `preview/<ветка>/` бакета Яндекса |
| `api.yml` | пуш в `server/account/**` | выкладка сервера аккаунтов в Yandex Cloud Functions |
| `social.yml` | каждый день 10:12 МСК | автопостинг из `social/queue` в Telegram и ВК |
| `cert.yml` | 1-го и 15-го | перенос сертификата Let's Encrypt в S3 Selectel |
| `dns-check.yml` | вручную | что DNS знает о домене |

Превью: `gh api -X POST repos/:owner/:repo/actions/workflows/preview.yml/dispatches -f ref=<ветка>`.

## Порядок выкладки

1. Работа — в ветке `delovoy`; `npm test` и проверка в браузере локально.
2. Превью ветки → проверка Валентином.
3. После «ок»: `git fetch` + `git rebase origin/main` → `git push origin delovoy:main` → дождаться `deploy.yml`.
   Если упало зеркало Selectel — `gh run rerun --failed`.
4. Строка в `CHANGELOG.md` — в том же коммите.

## Сервер аккаунтов (`server/account`)

Yandex Cloud Function (Node.js 22, без зависимостей) + закрытый бакет `gorod-dela-saves`.
Вход через Telegram (`POST ?action=auth`), сохранение `GET/PUT/DELETE ?action=save`; прошлая копия — `saves/<id>.prev.json`.
Токен сессии — HMAC с ключом из токена бота. Разрешённые адреса — список `ORIGINS` в `index.js`.

## Секреты

Только в секретах GitHub: `YC_ACCESS_KEY_ID`/`YC_SECRET_ACCESS_KEY` (бакет), `YC_SA_KEY`, `YC_FOLDER_ID` (функции),
`TG_BOT_TOKEN`, `VK_TOKEN`, ключи Selectel. В код, чат и документацию ключи не попадают.
