// Площадка, где запущена игра. Сайт — как раньше. Сборки для площадок (npm run build:yandex / build:vk /
// build:crazygames) подключают их SDK: «игра загружена», разметка геймплея (идёт / стоит), пауза по просьбе
// площадки и облачное сохранение, где оно есть. На площадках нет внешних ссылок, переноса файлом и испытания.
//   Яндекс Игры: yandex.ru/dev/games/doc/ru/concepts/requirements
//   ВКонтакте (VK Bridge): dev.vk.ru/ru/mini-apps/getting-started
//   CrazyGames (SDK v3): docs.crazygames.com/requirements/technical
import { compressToBase64, decompressFromBase64 } from 'lz-string';

export type Platform = 'web' | 'yandex' | 'vk' | 'crazygames';
export const PLATFORM = (import.meta.env.VITE_PLATFORM ?? 'web') as Platform;
export const IS_YANDEX = PLATFORM === 'yandex';
/** Игра на площадке: без внешних ссылок и всего, что уводит с неё */
export const IS_PORTAL = PLATFORM !== 'web';

interface YaPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YaSdk {
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  on(event: 'game_api_pause' | 'game_api_resume', cb: () => void): void;
  getPlayer(): Promise<YaPlayer>;
}

interface CgSdk {
  init(): Promise<void>;
  environment?: string;
  game: { gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void };
  data: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YaSdk> };
    CrazyGames?: { SDK: CgSdk };
  }
}

/** Общий вид облака площадки: прочитать и записать сохранение */
interface Cloud {
  read(): Promise<{ save?: unknown; savedAt?: unknown }>;
  write(save: string | null, savedAt: number, urgent: boolean): void;
}

let ya: YaSdk | null = null;
let cg: CgSdk | null = null;
let cloud: Cloud | null = null;
/** Сохранение из облака, если оно новее местного (строка JSON) */
let cloudSave: string | null = null;
let onPause: (() => void) | null = null;
let onResume: (() => void) | null = null;

/** Местная метка времени последнего сохранения — чтобы выбрать, что новее: облако или браузер */
const STAMP = 'gorod-dela:savedAt';
const CG_SAVE = 'gorod-dela:save';
const CG_AT = 'gorod-dela:savedAt';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src));
    document.head.append(s);
  });
}

function stamp(): number {
  try {
    return Number(localStorage.getItem(STAMP) ?? 0);
  } catch {
    return 0;
  }
}

async function initYandex(): Promise<void> {
  await loadScript('/sdk.js');
  ya = (await window.YaGames?.init()) ?? null;
  if (!ya) return;
  ya.on('game_api_pause', () => onPause?.());
  ya.on('game_api_resume', () => onResume?.());
  const player = await ya.getPlayer();
  cloud = {
    read: () => player.getData(['save', 'savedAt']),
    write: (save, savedAt, urgent) => void player.setData({ save, savedAt }, urgent).catch(() => {}),
  };
}

async function initCrazyGames(): Promise<void> {
  await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
  const sdk = window.CrazyGames?.SDK;
  if (!sdk) return;
  await sdk.init();
  cg = sdk;
  cg.game.loadingStart();
  // Модуль данных CrazyGames: у вошедших игроков — на их сервере, у остальных — в браузере
  cloud = {
    read: async () => ({ save: sdk.data.getItem(CG_SAVE), savedAt: sdk.data.getItem(CG_AT) }),
    write: (save, savedAt) => {
      if (save === null) sdk.data.removeItem(CG_SAVE);
      else sdk.data.setItem(CG_SAVE, save);
      sdk.data.setItem(CG_AT, String(savedAt));
    },
  };
}

async function initVk(): Promise<void> {
  const { default: bridge } = await import('@vkontakte/vk-bridge');
  await bridge.send('VKWebAppInit');
  // Приложение ВКонтакте свернули или открыли поверх другой экран — игра на паузе
  bridge.subscribe((e) => {
    if (e.detail.type === 'VKWebAppViewHide') onPause?.();
    if (e.detail.type === 'VKWebAppViewRestore') onResume?.();
  });
}

/**
 * Подключить площадку до старта игры. На сайте — сразу. На площадках — SDK и облачное сохранение
 * (если оно новее, чем в этом браузере). Ошибки SDK игру не ломают: она идёт с местным сохранением.
 */
export async function initPlatform(): Promise<void> {
  if (PLATFORM === 'web') return;
  try {
    // SDK может не ответить (игра открыта вне площадки) — ждём не дольше 6 секунд и играем без него
    const init = PLATFORM === 'yandex' ? initYandex() : PLATFORM === 'crazygames' ? initCrazyGames() : initVk();
    await Promise.race([init, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))]);
    if (!cloud) return;
    const data = await cloud.read();
    const at = Number(data.savedAt ?? 0);
    if (typeof data.save === 'string' && at > stamp()) cloudSave = decompressFromBase64(data.save) || null;
  } catch {
    // Без SDK (локальная проверка сборки) игра идёт с местным сохранением
  }
}

/** Облачное сохранение новее местного: его и загружаем (один раз) */
export function takeCloudSave(): string | null {
  const s = cloudSave;
  cloudSave = null;
  return s;
}

let lastCloud = 0;

/** Записали игру в браузер: отметить время и раз в минуту (и при сворачивании) — в облако */
export function savedLocally(json: string, urgent = false): void {
  const now = Date.now();
  try {
    localStorage.setItem(STAMP, String(now));
  } catch {
    /* без хранилища — только облако */
  }
  if (!cloud || (!urgent && now - lastCloud < 60_000)) return;
  lastCloud = now;
  // Лимит Яндекса — 200 КБ на игрока: сжатое сохранение в 5–10 раз меньше
  cloud.write(compressToBase64(json), now, urgent);
}

/** «Начать заново»: стереть и облачное сохранение, иначе на другом устройстве вернётся старая игра */
export function clearCloud(): void {
  cloud?.write(null, Date.now(), true);
}

/** Игра загрузилась, можно играть */
export function gameReady(): void {
  ya?.features.LoadingAPI?.ready();
  cg?.game.loadingStop();
}

let playing: boolean | null = null;

/** Геймплей идёт или стоит: пауза, свёрнутая вкладка, пауза от площадки */
export function setPlaying(on: boolean): void {
  if ((!ya && !cg) || playing === on) return;
  playing = on;
  if (on) {
    ya?.features.GameplayAPI?.start();
    cg?.game.gameplayStart();
  } else {
    ya?.features.GameplayAPI?.stop();
    cg?.game.gameplayStop();
  }
}

/** Площадка просит паузу (реклама, свёрнутое приложение) и потом разрешает продолжить */
export function onPlatformPause(pause: () => void, resume: () => void): void {
  onPause = pause;
  onResume = resume;
}
