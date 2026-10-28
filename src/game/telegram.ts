// Игра как Telegram Mini App: тот же адрес, открытый кнопкой бота.
// Telegram передаёт параметры запуска в хеше адреса (#tgWebAppData=…) — по ним и узнаём, что мы внутри.
// Скрипт Telegram подгружается только там: на сайте ничего не меняется.

interface TgWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  platform?: string;
  version?: string;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

/** Хеш читаем сразу при загрузке: потом его может очистить сам Telegram */
const launchedInTelegram =
  typeof location !== 'undefined' && (/tgWebApp(Data|Platform|Version)=/.test(location.hash) || new URLSearchParams(location.search).get('src') === 'tg');

export const isTelegram = (): boolean => launchedInTelegram;

const webApp = (): TgWebApp | undefined => window.Telegram?.WebApp;

/** Подключить Telegram: развернуть на весь экран, убрать «смахнуть вниз — закрыть» (мешает тянуть карту), цвета шапки */
export function initTelegram(): Promise<void> {
  if (!launchedInTelegram) return Promise.resolve();
  document.documentElement.classList.add('in-telegram');
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-web-app.js';
    s.onload = () => {
      try {
        const tg = webApp();
        if (tg) {
          tg.ready();
          tg.expand();
          tg.disableVerticalSwipes?.();
          const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#e9e4d8';
          tg.setHeaderColor?.(bg);
          tg.setBackgroundColor?.(bg);
        }
      } catch {
        /* старый клиент Telegram — играем как в браузере */
      }
      resolve();
    };
    // Нет связи с telegram.org — игра всё равно запускается
    s.onerror = () => resolve();
    document.head.append(s);
  });
}

/** Открыть ссылку: внутри Telegram — его средствами (t.me — без выхода из приложения) */
export function openExternal(url: string): void {
  const tg = webApp();
  try {
    if (tg && /^https:\/\/t\.me\//.test(url) && tg.openTelegramLink) return tg.openTelegramLink(url);
    if (tg?.openLink) return tg.openLink(url);
  } catch {
    /* падаем на обычное открытие */
  }
  window.open(url, '_blank', 'noopener');
}
