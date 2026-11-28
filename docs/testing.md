# Тесты и проверки

## Тесты (Vitest)

```bash
npm test                          # все
npx vitest run tests/bakery.test.ts
```

Тесты — в `tests/`, на логику `src/sim` (правило: новая логика sim — с тестом). Типовой приём — город с seed,
действие игрока, `advance(N дней)`, проверка отчёта или состояния, плюс проверка `serialize/restore`.
Тесты гоняются локально перед пушем, в CI — нет. Тест сервера аккаунтов (`accountServer.test.ts`) иногда
падает по таймауту при общей нагрузке — перезапустить отдельно.

## Баланс

```bash
npx tsx tools/balance.ts                 # форматы на нескольких seed
npx tsx tools/balance.ts 28 4 --milestones
python3 scripts/balance_stats.py         # сводка по многим seed
```

Стратегии игроков — `scripts/strategies.ts`. Результаты прогонов — в части 3 GDD.

## Проверка в браузере

Перед превью — прогон в Playwright в размере телефона (iPhone 13), скриншоты ключевых экранов.
Playwright и Chromium уже стоят в рабочем окружении; глобалы для скриптов — `window.city`, `window.scene`.
