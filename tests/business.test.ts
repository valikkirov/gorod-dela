import { describe, expect, it } from 'vitest';
import { business, businessNotes, payback, reserveDays, type PointInput } from '../src/sim/business';
import { City } from '../src/sim/city';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { PREMISES } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

/** Город с кафе на Кленовой и бистро в квартале, которые проработали несколько дней */
function network(): { city: City; points: PointInput[] } {
  const main = new Simulation(6);
  main.cash = 1_000_000;
  const city = new City(main);
  main.openCafe('cafe');
  city.advance(8 * MINUTES_PER_DAY);
  const br = city.openDistrict();
  br.openCafe('bistro');
  br.cafe.hire('shift');
  city.advance(9 * MINUTES_PER_DAY + 60);
  const points = city.points.map((p) => ({ key: `${p.district}:${p.cafe.premisesId}`, title: p.cafe.title, district: p.district, premisesId: p.cafe.premisesId, reports: p.reports }));
  return { city, points };
}

describe('Общий отчёт по бизнесу', () => {
  it('день: итог бизнеса — сумма итогов точек; проценты по кредиту — общий расход, не расход точки', () => {
    const { city, points } = network();
    const day = city.main.reports.at(-1)!.day;
    // Подложим проценты в отчёт главной точки
    city.main.reports.at(-1)!.interest = 700;
    city.main.reports.at(-1)!.profit -= 700;
    const b = business(points, day, day, [day - 1, day - 1]);
    const sum = city.points.reduce((a, p) => a + p.reports.find((r) => r.day === day)!.profit, 0);
    expect(b.profit).toBe(sum);
    expect(b.interest).toBe(700);
    expect(b.operating).toBe(b.profit + 700);
    expect(b.points.reduce((a, r) => a + r.operating, 0)).toBe(b.operating);
    expect(b.revenue).toBe(city.points.reduce((a, p) => a + p.reports.find((r) => r.day === day)!.revenue, 0));
  }, 120_000);

  it('вывод «почему итог изменился» раскладывает разницу по точкам', () => {
    const { points } = network();
    const day = points[0].reports.at(-1)!.day;
    const b = business(points, day, day, [day - 1, day - 1]);
    const notes = businessNotes(b, () => 'так вышло', 3);
    const d = b.profit - b.prevProfit!;
    if (Math.abs(d) >= 300) expect(notes.some((n) => n.startsWith('Общая прибыль'))).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(3);
  }, 120_000);

  it('неделя, которая ещё идёт, с прошлой не сравнивается; новая точка помечена неполной', () => {
    const { points } = network();
    const last = points[0].reports.at(-1)!.day;
    const from = last - 2;
    const b = business(points, from, from + 6, [from - 7, from - 1]);
    expect(b.complete).toBe(false);
    expect(b.prevProfit).toBeNull();
    const month = business(points, 1, 28, null);
    const bistro = month.points.find((r) => r.premisesId === 'bistro')!;
    expect(bistro.partial).toBeGreaterThan(0);
    expect(businessNotes(month, () => '', 3).some((n) => n.includes('итог неполный'))).toBe(true);
  }, 120_000);

  it('окупаемость: вложено — открытие и улучшения; вернула — прибыль до общих расходов', () => {
    const { points } = network();
    const bistro = points.find((p) => p.premisesId === 'bistro')!;
    const pb = payback(bistro);
    expect(pb.invested).toBe(PREMISES.bistro.openingCost + bistro.reports.reduce((a, r) => a + (r.invested ?? 0), 0));
    expect(pb.returned).toBe(bistro.reports.filter((r) => r.opened).reduce((a, r) => a + r.profit + (r.interest ?? 0), 0));
  }, 120_000);

  it('запас кассы: на сколько дней хватит на аренду, коммуналку и зарплату', () => {
    const { city, points } = network();
    const days = reserveDays(points, city.main.cash)!;
    expect(days).toBeGreaterThan(0);
    expect(reserveDays(points, 0)).toBe(0);
  }, 120_000);
});
