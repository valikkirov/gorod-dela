// Площадка, где запущена игра. Сайт и Telegram — как раньше; сборка для Яндекс Игр (npm run build:yandex)
// подключает SDK: сигнал «игра загружена», разметку геймплея (идёт / стоит), паузу по запросу площадки
// и облачное сохранение. Требования: yandex.ru/dev/games/doc/ru/concepts/requirements
import { compressToBase64, decompressFromBase64 } from 'lz-string';

export const IS_YANDEX = import.meta.env.VITE_PLATFORM === 'yandex';

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

declare global {
  interface Window {
    YaGames?: { init(): Promise<YaSdk> };
  }
}

let sdk: YaSdk | null = null;
let player: YaPlayer | null = null;
/** Сохранение из облака, если оно новее местного (строка JSON) */
let cloudSave: string | null = null;

/** Местная метка времени последнего сохранения — чтобы выбрать, что новее: облако или браузер */
const STAMP = 'gorod-dela:savedAt';

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

/**
 * Подключить площадку до старта игры. На сайте — сразу. В Яндекс Играх — SDK, игрок
 * и облачное сохранение (если оно новее, чем в этом браузере). Ошибки SDK игру не ломают.
 */
export async function initPlatform(): Promise<void> {
  if (!IS_YANDEX) return;
  try {
    await loadScript('/sdk.js');
    sdk = (await window.YaGames?.init()) ?? null;
    if (!sdk) return;
    player = await sdk.getPlayer();
    const data = await player.getData(['save', 'savedAt']);
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
  if (!player || (!urgent && now - lastCloud < 60_000)) return;
  lastCloud = now;
  // Лимит площадки — 200 КБ на игрока: сжатое сохранение в 5–10 раз меньше
  void player.setData({ save: compressToBase64(json), savedAt: now }, urgent).catch(() => {});
}

/** «Начать заново»: стереть и облачное сохранение, иначе на другом устройстве вернётся старая игра */
export function clearCloud(): void {
  void player?.setData({ save: null, savedAt: Date.now() }, true).catch(() => {});
}

/** Игра загрузилась, можно играть */
export function gameReady(): void {
  sdk?.features.LoadingAPI?.ready();
}

let playing: boolean | null = null;

/** Геймплей идёт или стоит: пауза, свёрнутая вкладка, пауза от площадки */
export function setPlaying(on: boolean): void {
  if (!sdk || playing === on) return;
  playing = on;
  if (on) sdk.features.GameplayAPI?.start();
  else sdk.features.GameplayAPI?.stop();
}

/** Площадка просит паузу (например, на время рекламы) и потом разрешает продолжить */
export function onPlatformPause(pause: () => void, resume: () => void): void {
  sdk?.on('game_api_pause', pause);
  sdk?.on('game_api_resume', resume);
}
