import { IS_PORTAL, PLATFORM } from './platform';
import { isTelegram } from './telegram';

// Яндекс Метрика: где тестеры бросают игру и что выбирают. Счётчик «Город дела».
// Работает на боевом сайте и в сборках для VK и Яндекс Игр (на CrazyGames — нет, см. main.ts) — локальная разработка
// и превью статистику не портят. Площадка — параметр визита platform, отчёты делятся по нему.
const COUNTER = 113502190;


type Ym = (id: number, method: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    ym?: Ym & { a?: unknown[]; l?: number };
  }
}

/** Боевые адреса: основной у Яндекса, свой домен и зеркало в Selectel */
const LIVE_HOSTS = ['yandexcloud.net', 'gorod-dela.ru', 'selstorage.ru'];
// Превью веток (/preview/…) — наши проверки, в статистику не идут
const enabled = (): boolean =>
  (IS_PORTAL && PLATFORM !== 'crazygames' && !import.meta.env.DEV) ||
  (!location.pathname.includes('/preview/') && LIVE_HOSTS.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`)));

export function initMetrika(): void {
  if (!enabled() || window.ym) return;
  // Стандартный код счётчика: очередь вызовов до загрузки tag.js
  const ym = function (...args: unknown[]) {
    (ym.a = ym.a || []).push(args);
  } as Ym & { a?: unknown[]; l?: number };
  ym.l = Date.now();
  window.ym = ym;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://mc.yandex.ru/metrika/tag.js';
  document.head.append(s);
  // Откуда играют: сайт или Telegram — параметр визита, отчёты можно делить
  // На площадках игра в чужом iframe: без вебвизора и карты кликов — только визиты и цели
  const platform = IS_PORTAL ? PLATFORM : isTelegram() ? 'telegram' : 'web';
  ym(COUNTER, 'init', {
    clickmap: !IS_PORTAL,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: !IS_PORTAL,
    params: { platform },
  });
}

/** Цель в Метрике. Ошибки счётчика никогда не ломают игру */
export function goal(name: string, params?: Record<string, unknown>): void {
  try {
    if (enabled()) window.ym?.(COUNTER, 'reachGoal', name, params);
  } catch {
    /* счётчик заблокирован — играем дальше */
  }
}
