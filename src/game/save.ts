import { City, type CitySave } from '../sim/city';
import type { SaveData } from '../sim/simulation';
import { clearCloud, IS_YANDEX, savedLocally, takeCloudSave } from './platform';

// Сохранение в браузере игрока. Каждый браузер и устройство — своя игра.
const KEY = `${location.pathname.includes('/preview/') ? 'gorod-dela:preview' : 'gorod-dela'}:save`;
// Испытание недели хранится под своим ключом — обычная игра не затирается

export function loadGame(key = KEY): City | null {
  try {
    // Яндекс Игры: облачное сохранение, если оно новее, чем в этом браузере
    const raw = (IS_YANDEX && key === KEY ? takeCloudSave() : null) ?? localStorage.getItem(key);
    if (!raw) return null;
    return City.restore(JSON.parse(raw) as CitySave | SaveData);
  } catch {
    // Повреждённое сохранение или недоступное хранилище — начинаем заново
    return null;
  }
}

export function saveGame(city: City, key = KEY, urgent = false): void {
  const json = JSON.stringify(city.serialize());
  if (IS_YANDEX && key === KEY) savedLocally(json, urgent);
  try {
    localStorage.setItem(key, json);
  } catch {
    // Приватный режим или переполнено — игра идёт дальше без сохранения
  }
}

export function clearSave(key = KEY): void {
  if (IS_YANDEX && key === KEY) clearCloud();
  try {
    localStorage.removeItem(key);
  } catch {
    /* нечего чистить */
  }
}

/** Автосохранение: каждые 5 секунд и когда вкладку сворачивают или закрывают */
export function autosave(city: City, key = KEY): void {
  let stopped = false;
  const save = (urgent = false) => {
    if (!stopped) saveGame(city, key, urgent);
  };
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save(true);
  });
  window.addEventListener('pagehide', () => save(true));
  // Перед «Начать заново» отключаем, чтобы не записать старую игру поверх
  window.addEventListener('gorod-dela:reset', () => {
    stopped = true;
  });
}

// ——— Перенос игры файлом: на другое устройство или на новый адрес игры ———

const FILE_TAG = 'gorod-dela-save';

/** Скачать текущую игру файлом */
export function exportSave(city: City): void {
  const day = city.main.today;
  const body = JSON.stringify({ tag: FILE_TAG, saved: new Date().toISOString(), data: city.serialize() });
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `gorod-dela-den-${day}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Прочитать файл игры. Ошибка — текст для игрока, успех — null (игра уже записана, нужно перезагрузить) */
export async function importSave(file: File, key = KEY): Promise<string | null> {
  let parsed: { tag?: string; data?: SaveData | CitySave };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return 'Это не файл игры';
  }
  if (parsed.tag !== FILE_TAG || !parsed.data) return 'Это не файл игры';
  if (!City.restore(parsed.data)) return 'Файл от слишком старой версии игры';
  // Останавливаем автосохранение, чтобы текущая игра не записалась поверх загруженной
  window.dispatchEvent(new Event('gorod-dela:reset'));
  try {
    localStorage.setItem(key, JSON.stringify(parsed.data));
  } catch {
    return 'Браузер не дал записать игру — проверь, не включён ли приватный режим';
  }
  return null;
}
