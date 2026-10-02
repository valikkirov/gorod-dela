// Игровое время хранится в минутах с начала первого дня.
export const MINUTES_PER_DAY = 24 * 60;

/** Сколько игровых минут проходит за реальную секунду при скорости x1.
 *  1440 / 9.6 = 150 с — игровой день длится 2,5 реальной минуты. */
export const GAME_MINUTES_PER_SECOND = 9.6;

export const hm = (hours: number, minutes = 0): number => hours * 60 + minutes;

export function minuteOfDay(time: number): number {
  return ((time % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function dayNumber(time: number): number {
  return Math.floor(time / MINUTES_PER_DAY) + 1;
}

export function formatClock(time: number): string {
  const m = Math.floor(minuteOfDay(time));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const WEEKDAY_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'] as const;

/** 0 — понедельник. Первый день игры — понедельник. */
export function weekday(day: number): number {
  return (((day - 1) % 7) + 7) % 7;
}

export const isWeekend = (day: number): boolean => weekday(day) >= 5;
