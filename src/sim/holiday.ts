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
} as const;

/** Идёт ли сезон в этот день календаря */
export function isHolidayDate(month: number, day: number): boolean {
  const { from, to } = HOLIDAY;
  if (month === from.month) return day >= from.day;
  if (month === to.month) return day <= to.day;
  return false;
}
