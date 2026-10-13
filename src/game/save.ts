import { Simulation, type SaveData } from '../sim/simulation';

// Сохранение в браузере игрока. Каждый браузер и устройство — своя игра.
const KEY = `${location.pathname.includes('/preview/') ? 'gorod-dela:preview' : 'gorod-dela'}:save`;
// Испытание недели хранится под своим ключом — обычная игра не затирается

export function loadGame(key = KEY): Simulation | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return Simulation.restore(JSON.parse(raw) as SaveData);
  } catch {
    // Повреждённое сохранение или недоступное хранилище — начинаем заново
    return null;
  }
}

export function saveGame(sim: Simulation, key = KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(sim.serialize()));
  } catch {
    // Приватный режим или переполнено — игра идёт дальше без сохранения
  }
}

export function clearSave(key = KEY): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* нечего чистить */
  }
}

/** Автосохранение: каждые 5 секунд и когда вкладку сворачивают или закрывают */
export function autosave(sim: Simulation, key = KEY): void {
  let stopped = false;
  const save = () => {
    if (!stopped) saveGame(sim, key);
  };
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  // Перед «Начать заново» отключаем, чтобы не записать старую игру поверх
  window.addEventListener('gorod-dela:reset', () => {
    stopped = true;
  });
}

// ——— Перенос игры файлом: на другое устройство или на новый адрес игры ———

const FILE_TAG = 'gorod-dela-save';

/** Скачать текущую игру файлом */
export function exportSave(sim: Simulation): void {
  const day = sim.today;
  const body = JSON.stringify({ tag: FILE_TAG, saved: new Date().toISOString(), data: sim.serialize() });
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
  let parsed: { tag?: string; data?: SaveData };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return 'Это не файл игры';
  }
  if (parsed.tag !== FILE_TAG || !parsed.data) return 'Это не файл игры';
  if (!Simulation.restore(parsed.data)) return 'Файл от слишком старой версии игры';
  // Останавливаем автосохранение, чтобы текущая игра не записалась поверх загруженной
  window.dispatchEvent(new Event('gorod-dela:reset'));
  try {
    localStorage.setItem(key, JSON.stringify(parsed.data));
  } catch {
    return 'Браузер не дал записать игру — проверь, не включён ли приватный режим';
  }
  return null;
}
