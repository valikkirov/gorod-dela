import { describe, expect, it } from 'vitest';
import { analyzeDay, comparableDay, describeLost } from '../src/sim/analysis';
import { hm } from '../src/sim/clock';
import { formatMoney } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = 24 * 60;

function openKnown(sim: Simulation): void {
  sim.openCafe();
  for (const r of sim.residents) r.aware = true;
}

describe('История изменений', () => {
  it('склеивает правки одной цены за день и стирает возврат к исходному', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.setPrice('cappuccino', 210);
    sim.setPrice('cappuccino', 200);
    const c = sim.cafe.today.changes!.find((x) => x.key === 'price:cappuccino')!;
    expect(c.from).toBe(formatMoney(220));
    expect(c.to).toBe(formatMoney(200));
    sim.setPrice('cappuccino', 220);
    expect(sim.cafe.today.changes!.some((x) => x.key === 'price:cappuccino')).toBe(false);
  });

  it('попадает в отчёт своего дня, а новый день начинается с чистого листа', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.setHours(hm(7), hm(21));
    sim.setFlyers(true);
    sim.addMenuItem('raf');
    sim.removeMenuItem('raf'); // добавил и убрал — записи нет
    sim.advance(DAY);
    const keys = sim.reports[0].changes!.map((c) => c.key);
    expect(keys).toContain('hours');
    expect(keys).toContain('flyers');
    expect(keys).not.toContain('menu:raf');
    expect(sim.cafe.today.changes).toEqual([]);
  });

  it('заказ показывает итоговое количество и когда привезут', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.orderIngredient('milk', 20);
    sim.orderIngredient('milk', 100);
    const c = sim.cafe.today.changes!.find((x) => x.key === 'order:milk')!;
    expect(c.to).toContain('120');
    expect(c.when).toContain('6:00');
    sim.cancelOrder('milk');
    expect(sim.cafe.today.changes!.some((x) => x.key === 'order:milk')).toBe(false);
  });
});

describe('Отчёт дня', () => {
  it('считает гостей, загрузку и потери по часам и типам жителей', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.advance(DAY);
    const r = sim.reports[0];
    const served = r.servedHour!.reduce((a, b) => a + b, 0);
    expect(served).toBe(r.guests);
    // Утром кафе открыто, ночью — нет
    expect(r.capHour![9]).toBeGreaterThan(0);
    expect(r.capHour![3]).toBe(0);
    const lost = Object.values(r.lostHour!).flat().reduce((a, b) => a + b, 0);
    const missed = Object.values(r.missed).reduce((a, b) => a + (b ?? 0), 0);
    expect(lost).toBe(missed);
    const byKind = Object.values(r.lostKind!).flatMap((x) => Object.values(x)).reduce((a, b) => a + (b ?? 0), 0);
    expect(byKind).toBe(missed);
  });

  it('сравнивает будний день с будним, выходной с выходным', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.advance(DAY * 9);
    const [mon, , , , , sat, sun, mon2, tue2] = sim.reports;
    expect(comparableDay(sim.reports, mon2)!.report).toBe(mon);
    expect(comparableDay(sim.reports, mon2)!.label).toContain('понедельник');
    expect(comparableDay(sim.reports, tue2)!.report.day).toBe(2);
    expect(comparableDay(sim.reports, sat)).toBeNull();
    expect(comparableDay(sim.reports, sun)!.report).toBe(sat);
    expect(comparableDay(sim.reports, mon)).toBeNull();
  });

  it('называет главный фактор и не больше двух наблюдений', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.advance(DAY * 8);
    for (const r of sim.reports) {
      const a = analyzeDay(sim.reports, r);
      expect(a.headline).toMatch(/Итог дня/);
      expect(a.factor.length).toBeGreaterThan(0);
      expect(a.observations.length).toBeLessThanOrEqual(2);
    }
  });

  it('видит утреннюю очередь, когда один владелец за стойкой', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.setHours(hm(6), hm(20));
    for (const m of sim.cafe.menu) sim.setPrice(m.id, m.price * 0.6);
    sim.advance(DAY);
    const a = analyzeDay(sim.reports, sim.reports[0]);
    const text = [a.lost ? describeLost(a.lost) : '', ...a.observations].join(' ');
    expect(text).toMatch(/очередь|занята|дождались/);
  });
});

describe('Касса', () => {
  it('предупреждает, на сколько дней хватит денег', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.hireBarista('shift');
    const o = sim.cashOutlook();
    expect(o.daily).toBe(3000 + 500 + 2500);
    expect(o.days).toBe(Math.floor(sim.cash / o.daily));
    sim.cash = -100;
    expect(sim.cashOutlook().days).toBe(0);
  });
});
