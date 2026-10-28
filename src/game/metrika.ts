import { isTelegram } from './telegram';

// Яндекс Метрика: где тестеры бросают игру и что выбирают. Счётчик «Город дела».
// Работает только на боевом сайте — локальная разработка и превью статистику не портят.
const COUNTER = 113502190;


type Ym = (id: number, method: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    ym?: Ym & { a?: unknown[]; l?: number };
  }
}

/** Боевые адреса: основной у Яндекса, свой домен и зеркало в Selectel */
const LIVE_HOSTS = ['yandexcloud.net', 'gorod-dela.ru', 'selstorage.ru'];
const enabled = (): boolean => LIVE_HOSTS.some((h) => location.hostname === h || location.hostname.endsWith(`.${h}`));

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
  ym(COUNTER, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, params: { platform: isTelegram() ? 'telegram' : 'web' } });
}

/** Цель в Метрике. Ошибки счётчика никогда не ломают игру */
export function goal(name: string, params?: Record<string, unknown>): void {
  try {
    if (enabled()) window.ym?.(COUNTER, 'reachGoal', name, params);
  } catch {
    /* счётчик заблокирован — играем дальше */
  }
}
