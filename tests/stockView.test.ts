import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/sim/cafe';
import { compositionOf } from '../src/sim/composition';
import { dishId } from '../src/sim/dishes';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';
import { Stock } from '../src/sim/stock';
import { cookable, dailyUse, daysLeft, usedIn } from '../src/sim/stockView';

describe('Склад: на сколько хватит и что можно приготовить', () => {
  it('порции считаются по самому дефицитному ингредиенту и после поставки', () => {
    const s = new Stock();
    s.addNow('beans', 30, 1, 30);
    s.addNow('milk', 10, 1, 20);
    // латте: зерно 1, молоко 1.25 → 8 порций, упирается в молоко
    expect(cookable(s, 'latte')).toMatchObject({ portions: 8, limit: 'milk' });
    expect(cookable(s, 'americano')).toMatchObject({ portions: 30, limit: 'beans' });
    s.order('milk', 40);
    expect(cookable(s, 'latte').afterDelivery).toBe(30);
    expect(cookable(s, 'croissant')).toMatchObject({ portions: 0, limit: 'bakery', afterDelivery: 0 });
    expect(usedIn(['americano', 'latte', 'croissant'], 'beans')).toEqual(['americano', 'latte']);
  });

  it('расход — среднее по последним рабочим дням, хватит на — с учётом того, что едет', () => {
    const sim = new Simulation(3);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    expect(dailyUse(sim.reports)).toBeNull();
    sim.advance(4 * MINUTES_PER_DAY);
    const use = dailyUse(sim.reports)!;
    const last3 = sim.reports.slice(-3);
    const beans = last3.reduce((n, r) => n + (r.sold.americano ?? 0) + (r.sold.cappuccino ?? 0) + (r.sold.latte ?? 0) + (r.sold.raf ?? 0), 0) / 3;
    expect(use.beans).toBeCloseTo(beans, 5);
    const left = daysLeft(sim.cafe.stock, 'beans', use)!;
    expect(left).toBeCloseTo((sim.cafe.stock.qty('beans') + (sim.cafe.stock.pending.beans ?? 0)) / use.beans!, 5);
    expect(daysLeft(sim.cafe.stock, 'bar', use)).toBeNull();
  }, 30_000);
});

describe('Состав позиций', () => {
  it('у каждой позиции каталога и своего блюда есть состав', () => {
    for (const c of CATALOG) expect(compositionOf(c.id).length).toBeGreaterThan(0);
    expect(compositionOf(dishId('milk-coffee', ['syrup']))).toContain('сироп');
  });
});
