import { describe, expect, it } from 'vitest';
import { foodCost } from '../src/sim/cafe';
import { Simulation } from '../src/sim/simulation';

describe('Итог дня по себестоимости, а не по закупке', () => {
  it('расход на продукты = продано по себестоимости + списания; закупка в итог не входит', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    sim.advance(10 * 24 * 60);
    for (const r of sim.reports.filter((r) => r.opened)) {
      expect(r.food).toBe(foodCost(r));
      expect(r.profit).toBe(r.revenue - r.food! - r.rent - r.utilities - r.wages - r.tax - r.marketing - (r.other ?? 0) - (r.interest ?? 0));
    }
  });

  it('большой заказ на склад не портит итог дня: деньги ушли, а прибыль та же', () => {
    const a = new Simulation(2);
    const b = new Simulation(2);
    a.openCafe();
    b.openCafe();
    b.cafe.stock.order('beans', 200);
    a.advance(2 * 24 * 60);
    b.advance(2 * 24 * 60);
    const ra = a.reports[1];
    const rb = b.reports[1];
    expect(rb.purchases - ra.purchases).toBeGreaterThan(5000);
    expect(Math.abs(rb.profit - ra.profit)).toBeLessThan(500);
    expect(b.cash).toBeLessThan(a.cash - 5000);
  });
});
