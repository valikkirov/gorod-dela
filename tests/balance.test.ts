import { describe, expect, it } from 'vitest';
import { hm } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

describe('Баланс: спрос и часы по умолчанию', () => {
  it('часть работающих из дома выходит пообедать — обеды нужны не только офисам', () => {
    const sim = new Simulation(3);
    const remote = sim.residents.filter((r) => r.kind === 'remote');
    const lunching = remote.filter((r) => r.weekday.some((e) => e.activity === 'lunch'));
    expect(lunching.length).toBeGreaterThan(0);
    expect(lunching.length).toBeLessThan(remote.length);
    // Обед после прогулки, а не внутри неё
    for (const r of lunching) {
      const i = r.weekday.findIndex((e) => e.activity === 'lunch');
      expect(r.weekday[i].start).toBeGreaterThan(r.weekday[i - 1].start);
    }
  });

  it('кафе по умолчанию открывается в 7:00 — к утреннему потоку в офисы — и укладывается в 12 часов владельца', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const h = sim.cafe.hoursOn(0)!;
    expect(h.openAt).toBe(hm(7));
    expect(h.closeAt - h.openAt).toBeLessThanOrEqual(12 * 60);
  });

  it('новичок, который ничего не менял, через месяц в плюсе', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    sim.buySign();
    sim.advance(28 * 24 * 60);
    const lastWeek = sim.reports.slice(-7).reduce((s, r) => s + r.profit, 0);
    expect(lastWeek).toBeGreaterThan(0);
  }, 60_000);
});
