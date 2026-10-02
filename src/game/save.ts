import { Simulation, type SaveData } from '../sim/simulation';

// Сохранение в браузере игрока. Каждый браузер и устройство — своя игра.
const KEY = 'gorod-dela:save';

export function loadGame(): Simulation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return Simulation.restore(JSON.parse(raw) as SaveData);
  } catch {
    // Повреждённое сохранение или недоступное хранилище — начинаем заново
    return null;
  }
}

export function saveGame(sim: Simulation): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sim.serialize()));
  } catch {
    // Приватный режим или переполнено — игра идёт дальше без сохранения
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* нечего чистить */
  }
}

/** Автосохранение: каждые 5 секунд и когда вкладку сворачивают или закрывают */
export function autosave(sim: Simulation): void {
  let stopped = false;
  const save = () => {
    if (!stopped) saveGame(sim);
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
