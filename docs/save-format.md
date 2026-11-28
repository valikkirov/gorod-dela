# Сохранение

## Где лежит

| Где | Ключ / место | Кто пишет |
|---|---|---|
| Браузер | `localStorage['gorod-dela:save']`; на превью — `gorod-dela:preview:save` | `src/game/save.ts` (`saveGame`, автосохранение) |
| Испытание недели | `gorod-dela:challenge-<id>` (+ `-result`) | `src/game/challenge.ts` (`SAVE_NS`) |
| Сайт, вошёл через Telegram | сервер аккаунтов, `saves/<id>.json` (+ `.prev.json`) | `src/game/account.ts` → `server/account` |
| Яндекс Игры | `player.setData({save, savedAt})` | `src/game/platform.ts` |
| CrazyGames | модуль данных SDK (`sdk.data`) | `src/game/platform.ts` |
| ВКонтакте | только браузер (облака пока нет) | — |

В облако уходит та же строка JSON, сжатая `lz-string` (`compressToBase64`). При запуске (`initPlatform`) облако берётся,
если оно новее местного (`savedAt`); сразу после входа через Telegram — та копия, где больше игровых дней.
Перенос между адресами — файлом (кнопка «Перенести игру на другое устройство»).

## Формат

Верхний уровень — `CitySave` (`src/sim/city.ts`):

```ts
interface CitySave {
  city: 1;
  main: SaveData;          // главная точка (Кленовая)
  branch: SaveData | null; // точка в Деловом квартале
  unlocked: boolean;       // открыт ли квартал
  carry?: number;          // остаток шага времени
  extras?: SaveData[];     // гостевые точки (пекарня)
}
```

`SaveData` (`src/sim/simulation.ts`, `serialize()`): `version`, `map`, `seed`, `district`, `time`, `day`, `carry`,
состояния генераторов (`rng`, `skyRng`, `eventRng`, `parkRng`), касса и банкротство (`cash`, `daysInRed`, `bankrupt`),
`reports`, погода и прогноз, маркетинг, `cafe` (меню, цены, часы, персонал, склад, зал, своё блюдо…), `rival`,
`regulars`, `milestones`, `steps`, события (`pendingEvent`, `effects`, `lastEvent`), договор и ферма (`contract`,
`farm`, `contractBan`, `officeOrders`), печь пекарни (`oven`), компании дня (`groupDay`, `groupWas`), кредит
(`loan`, `loanHistory`) и изменяемое состояние жителей (`residents`: память визитов, осведомлённость и т. п.).

Не сохраняется то, что выводится из seed: сами жители, их имена, характер, компании, хроника.
Поэтому язык можно сменить без потери игры: имена пересобираются на новом языке.

Старый формат — голый `SaveData` без `city` — `City.restore` тоже принимает.

## Версии

- `SAVE_VERSION` (сейчас **2**) в `simulation.ts`. `Simulation.restore` возвращает `null`, если версия другая, —
  игра начинается заново. Поднимать версию, только когда старое сохранение нельзя прочитать корректно.
- Новое поле добавляем **необязательным** (`farm?: …`, `oven?: …`) и в `restore` подставляем значение по умолчанию —
  так старые сохранения продолжают работать без смены версии.

## Правило

Добавил состояние в sim — добавь его в `serialize/restore`, опиши здесь и проверь тестом, что после `restore`
игра идёт так же (см. существующие тесты сохранения в `tests/`).
