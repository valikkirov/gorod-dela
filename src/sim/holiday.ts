// Новогодний сезон: включает игра по календарю (в симуляции нет текущей даты — она детерминирована).
// В сезон зимняя погода, сезонное меню, праздничный декор в зале и чаще хочется посидеть в тепле.

export const HOLIDAY = {
  /** С какого и по какое число (месяц 1–12, день) — включительно */
  from: { month: 12, day: 15 },
  to: { month: 1, day: 12 },
  /** Во сколько раз чаще желание посидеть в кафе */
  sitWant: 1.15,
  /** Праздничный декор в зале в сезон: прибавка к желанию зайти посидеть (×) */
  treeSit: 0.12,
  garlandSit: 0.06,
  /** 31 декабря: с 16:00 зайти посидеть хотят чаще (×), 1 января до полудня — реже: город отсыпается */
  eveFrom: 16 * 60,
  eveWant: 1.4,
  newYearUntil: 12 * 60,
  newYearWant: 0.4,
} as const;

/** Особый день сезона: 31 декабря или 1 января (по календарю игрока) */
export type HolidayDay = 'eve' | 'newyear' | null;

export function holidayDayOf(month: number, day: number): HolidayDay {
  if (month === 12 && day === 31) return 'eve';
  if (month === 1 && day === 1) return 'newyear';
  return null;
}

/** Идёт ли сезон в этот день календаря */
export function isHolidayDate(month: number, day: number): boolean {
  const { from, to } = HOLIDAY;
  if (month === from.month) return day >= from.day;
  if (month === to.month) return day <= to.day;
  return false;
}
