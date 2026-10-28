// Предупреждения до решения (GDD §13.4, «понятность-2»): игрок видит последствие раньше, чем оно случится.
// Только подсказки: ничего не запрещают и состояние не меняют.
import type { Cafe, MenuItem } from './cafe';
import { hm, MINUTES_PER_DAY, WEEKDAY_SHORT } from './clock';
import { ECONOMY, formatMoney } from './economy';
import { ingredient, recipeOf, type IngredientId } from './stock';
import { windowOn } from './cafe';

const NB = ' ';

/** «в субботу» — день недели в винительном падеже */
const WEEKDAY_ACC = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

/** Через сколько дней приедет заказ, сделанный в эту минуту: поставка в 6:00 */
export function deliveryInDays(minuteOfDay: number): number {
  return minuteOfDay < hm(6) ? 0 : 1;
}

/**
 * Скоропорт приедет, а точка до конца его срока не откроется — всё спишется.
 * null — всё в порядке (или ингредиент не портится).
 */
export function orderWarning(cafe: Cafe, id: IngredientId, minuteOfDay: number): string | null {
  if (!cafe.opened) return null;
  const ing = ingredient(id);
  if (ing.shelfDays === null) return null;
  const shelf = ing.shelfDays + cafe.stock.shelfBonus;
  const arrive = deliveryInDays(minuteOfDay);
  for (let k = arrive; k < arrive + shelf; k++) if (cafe.hoursOn(cafe.weekday + k)) return null;
  const day = WEEKDAY_ACC[(((cafe.weekday + arrive) % 7) + 7) % 7];
  return `Привезут ${day}, а${NB}точка закрыта, пока ${ing.name.toLowerCase()} не${NB}испортится${NB}— заказ уйдёт в${NB}списание`;
}

/** Цена не покрывает себестоимость */
export function priceWarning(item: MenuItem): string | null {
  if (item.price > item.cost) return null;
  return `Цена не${NB}выше себестоимости (${formatMoney(item.cost)})${NB}— каждая продажа в${NB}минус`;
}

/** Ингредиенты позиции, которых нет, не едут и не заказываются автоматически */
export function missingSupply(cafe: Cafe, itemId: string): IngredientId[] {
  const { stock } = cafe;
  return (Object.entries(recipeOf(itemId)) as [IngredientId, number][])
    .filter(([id, q]) => q > 0 && stock.qty(id) + (stock.pending[id] ?? 0) < q && stock.keep[id] <= 0 && stock.keepWeekend[id] <= 0)
    .map(([id]) => id);
}

export function menuAddWarning(cafe: Cafe, itemId: string): string | null {
  const miss = missingSupply(cafe, itemId);
  if (!miss.length) return null;
  const names = miss.map((id) => ingredient(id).name.toLowerCase()).join(', ');
  return `На${NB}складе нет: ${names}, автозаказ выключен. Без закупки гости услышат «нет в${NB}наличии»`;
}

/** Дни подряд одной строкой: «Пн–Пт», «Сб, Вс» */
export function daysText(days: number[]): string {
  if (days.length === 7) return 'каждый день';
  const parts: string[] = [];
  for (let i = 0; i < days.length; i++) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    parts.push(j - i >= 2 ? `${WEEKDAY_SHORT[days[i]]}–${WEEKDAY_SHORT[days[j]]}` : days.slice(i, j + 1).map((d) => WEEKDAY_SHORT[d]).join(', '));
    i = j;
  }
  return parts.join(', ');
}

const fmt = (m: number): string => {
  const x = ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
};

/** Часы точки и графики бариста не сходятся */
export function staffWarnings(cafe: Cafe): string[] {
  const out: string[] = [];
  const shiftMin = ECONOMY.shiftHours * 60;
  cafe.staff.forEach((b, i) => {
    const who = cafe.staff.length > 1 ? `Бариста ${i + 1}` : 'Бариста';
    if (b.contract === 'shift') {
      // Смена — 12 часов с открытия; дольше точка работает без него
      const long: number[] = [];
      let tail = 0;
      for (let d = 0; d < 7; d++) {
        const h = cafe.hoursOn(d);
        if (!h || !b.schedule.days[d] || h.closeAt - h.openAt <= shiftMin) continue;
        long.push(d);
        tail = h.openAt + shiftMin;
      }
      if (long.length) {
        out.push(
          `${who} на${NB}смене работает ${ECONOMY.shiftHours}${NB}ч с${NB}открытия: ${daysText(long)} после ${fmt(tail)} за${NB}стойкой ты один`,
        );
      }
      return;
    }
    // Почасовой выходит только в открытую точку: окно мимо часов работы — он не придёт
    const idle: number[] = [];
    for (let d = 0; d < 7; d++) {
      const w = windowOn(b.schedule, d);
      if (!w) continue;
      const h = cafe.hoursOn(d);
      const overlap = h && Math.min(w.to, h.closeAt) > Math.max(w.from, h.openAt);
      if (!overlap) idle.push(d);
    }
    if (idle.length) out.push(`${who} по${NB}графику ${daysText(idle)}, но${NB}точка в${NB}эти часы закрыта${NB}— он не${NB}выйдет`);
  });
  return out;
}
