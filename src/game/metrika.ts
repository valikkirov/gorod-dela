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
  // Источник первого захода и сколько дней прошло с него — у каждого визита, чтобы видеть, кто возвращается и откуда пришёл
  const v = visitor();
  ym(COUNTER, 'init', {
    clickmap: !IS_PORTAL,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: !IS_PORTAL,
    params: { platform, days_since_first: v.days, ...v.source },
  });
}

/** Первый заход игрока на этом устройстве: когда и откуда (utm_*, ref). Хранится в браузере, без него — пусто */
interface Visitor {
  first: number;
  source: Record<string, string>;
  /** Свой код игрока для ссылок «позвать друга» (ref): случайный, ничего о человеке не говорит */
  id?: string;
}
const VISITOR_KEY = 'gorod-dela:visitor';
const SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];

/** Сохранить источник при первом заходе; дальше — тот же, сколько бы раз игрок ни возвращался */
export function visitor(): { days: number; source: Record<string, string>; id: string } {
  const now = Date.now();
  let v: Visitor | null = null;
  try {
    v = JSON.parse(localStorage.getItem(VISITOR_KEY) ?? 'null') as Visitor | null;
  } catch {
    v = null;
  }
  if (!v || typeof v.first !== 'number') {
    const q = new URLSearchParams(location.search);
    const source: Record<string, string> = {};
    for (const k of SOURCE_KEYS) {
      const val = q.get(k);
      if (val) source[k] = val.slice(0, 64);
    }
    v = { first: now, source };
  }
  if (!v.id) {
    v.id = Math.random().toString(36).slice(2, 10);
    try {
      localStorage.setItem(VISITOR_KEY, JSON.stringify(v));
    } catch {
      /* без хранилища каждый визит — первый */
    }
  }
  return { days: Math.max(0, Math.floor((now - v.first) / 86_400_000)), source: v.source ?? {}, id: v.id };
}

/** Цель, которая достигается один раз за игрока (на этом устройстве) */
export function goalOnce(name: string, params?: Record<string, unknown>): void {
  const key = `gorod-dela:goal:${name}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    /* хранилища нет — шлём каждый раз, Метрика посчитает конверсию по визитам */
  }
  goal(name, params);
}

/** Цель в Метрике. Ошибки счётчика никогда не ломают игру */
export function goal(name: string, params?: Record<string, unknown>): void {
  try {
    if (enabled()) window.ym?.(COUNTER, 'reachGoal', name, params);
  } catch {
    /* счётчик заблокирован — играем дальше */
  }
}
