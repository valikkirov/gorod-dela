// Аккаунт игрока на сайте: вход через Telegram и облачное сохранение на нашем сервере (server/account).
// В Telegram Mini App вход сам — по данным запуска. На сайте — кнопкой: переход на oauth.telegram.org и обратно
// с #tgAuthResult. Без входа игра работает как раньше — только в этом браузере.
// Позже сюда же — вход по почте и личный кабинет: аккаунт на сервере уже отдельный от способа входа.
import { telegramInitData } from './telegram';

/** Адрес функции Yandex Cloud (.github/workflows/api.yml). Пусто — облако выключено */
const API = (import.meta.env.VITE_ACCOUNT_API as string | undefined) ?? '';
/** Числовой id @gorod_dela_bot — для входа через Telegram на сайте (не секрет: первая часть токена) */
const BOT_ID = (import.meta.env.VITE_TG_BOT_ID as string | undefined) ?? '';
const KEY = 'gorod-dela:account';

interface Session {
  token: string;
  name: string;
}

export const accountsOn = (): boolean => !!API;
export const siteLoginOn = (): boolean => !!API && !!BOT_ID;

function session(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
  } catch {
    return null;
  }
}

export const accountName = (): string | null => session()?.name ?? null;

/** Вход только что: облако и браузер могут хранить разные игры — тогда берём ту, где больше дней */
let freshLogin = false;
export const isFreshLogin = (): boolean => freshLogin;

async function auth(body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${API}?action=auth`, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) return false;
    const s = (await res.json()) as Session;
    localStorage.setItem(KEY, JSON.stringify({ token: s.token, name: s.name }));
    freshLogin = true;
    return true;
  } catch {
    return false;
  }
}

/** До старта игры: вернулись со страницы входа Telegram или открыты в Mini App — входим */
export async function initAccount(): Promise<boolean> {
  if (!API) return false;
  const m = location.hash.match(/tgAuthResult=([^&]+)/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const tg = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
      await auth({ tg });
    } catch {
      /* испорченный ответ — играем без входа */
    }
  } else if (!session()) {
    const initData = telegramInitData();
    if (initData) await auth({ initData });
  }
  return !!session();
}

/** Войти через Telegram на сайте: страница Telegram, потом обратно сюда */
export function loginWithTelegram(): void {
  const back = location.origin + location.pathname + location.search;
  const q = new URLSearchParams({ bot_id: BOT_ID, origin: location.origin, request_access: 'write', return_to: back });
  location.href = `https://oauth.telegram.org/auth?${q}`;
}

export function logout(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* нечего чистить */
  }
}

async function call(method: string, body?: unknown, keepalive = false): Promise<Response | null> {
  const s = session();
  if (!s) return null;
  const res = await fetch(`${API}?action=save`, {
    method,
    headers: { authorization: `Bearer ${s.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive,
  });
  // Сессия истекла или сервер её не знает — выходим, игра остаётся в браузере
  if (res.status === 401) logout();
  return res;
}

/** Облако для platform.ts: как у площадок — прочитать и записать сжатое сохранение */
export const accountCloud = {
  async read(): Promise<{ save?: unknown; savedAt?: unknown; day?: unknown }> {
    const res = await call('GET');
    return res?.ok ? ((await res.json()) as { save: string; savedAt: number; day: number }) : {};
  },
  write(save: string | null, savedAt: number, urgent: boolean, day = 0): void {
    // keepalive переживает закрытие вкладки, но берёт не больше 64 КБ
    const body = save === null ? undefined : { save, savedAt, day };
    void call(save === null ? 'DELETE' : 'PUT', body, urgent && (save?.length ?? 0) < 60_000).catch(() => {});
  },
};
