import { Simulation, type SaveData } from '../sim/simulation';

// Сохранение в браузере игрока. Каждый браузер и устройство — своя игра.
const KEY = 'gorod-dela:save';
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
