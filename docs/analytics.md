# Аналитика (Яндекс Метрика)

Код — `src/game/metrika.ts`. Работает на боевом сайте и в сборках ВК и Яндекс Игр; на CrazyGames, локально
и на превью — нет.

## Параметры визита

| Параметр | Что |
|---|---|
| `platform` | `web`, `telegram`, `yandex`, `vk` |
| `days_since_first` | дней с первого захода на этом устройстве |
| `utm_source`, `utm_medium`, `utm_campaign`, `ref` | источник первого захода (хранится в `gorod-dela:visitor`) |

На площадках — без вебвизора и карты кликов.

## Цели

`goalOnce` — один раз на игрока, `goal` — каждый раз.

| Цель | Когда | Тип |
|---|---|---|
| `game_start` | игрок дошёл до выбора помещения в обучении или пропустил обучение | once |
| `cafe_opened` | открыл первое заведение | once |
| `first_furniture` | первый предмет зала | once |
| `day3_reached` | дошёл до 3-го игрового дня | once |
| `share_hall` | поделился залом (`how`: shared / story / downloaded) | goal |
| `contest_entry` | картинка на конкурс «Новогодний зал» | goal |
| `tutorial_step`, `tutorial_done`, `tutorial_skip` | шаги пошагового обучения (`step`) | goal |
| `first_step`, `first_steps_done` | «Первые шаги» | goal |
| `open`, `district`, `bakery_hint`, `upgrade`, `loan`, `event`, `milestone` | открытия и решения | goal |
| `night_skip`, `restart`, `bankrupt`, `feedback` | промотка, рестарт, банкротство, идея | goal |
| `challenge_done`, `challenge_share` | испытание недели | goal |

Цели нужно завести в интерфейсе Метрики (условие «JavaScript-событие» с тем же идентификатором).
Заведены: `game_start`, `cafe_opened`, `first_furniture`, `day3_reached`. Нужно добавить: `share_hall`, `contest_entry`.

## Как добавить цель

`goal('имя', {…})` или `goalOnce(…)` в коде → строка в таблице выше → цель в интерфейсе Метрики.
