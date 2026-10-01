import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

describe('Simulation', () => {
  it('детерминирована: один seed — один и тот же город', () => {
    const a = new Simulation(42);
    const b = new Simulation(42);
    a.advance(MINUTES_PER_DAY);
    b.advance(MINUTES_PER_DAY);
    expect(a.residents.map((r) => r.pos)).toEqual(b.residents.map((r) => r.pos));
  });

  it('ночью улица пустая, все по домам', () => {
    const sim = new Simulation(1, hm(23, 0));
    sim.advance(hm(4, 0)); // до 03:00
    expect(sim.onStreet).toBe(0);
    for (const r of sim.residents) expect(r.placeId).toBe(r.homeId);
  });

  it('днём офисные сотрудники доходят до работы', () => {
    const sim = new Simulation(1);
    sim.advance(hm(4, 30)); // 06:00 → 10:30
    const office = sim.residents.filter((r) => r.kind === 'office');
    for (const r of office) {
      expect(r.placeId).toBe(r.workId);
      expect(r.walking).toBe(false);
    }
  });

  it('в обед офисные с улицы выходят в магазин — будущий спрос для кафе', () => {
    const sim = new Simulation(1);
    const lunchers = sim.residents.filter((r) => r.schedule.some((s) => s.activity === 'lunch'));
    expect(lunchers.length).toBeGreaterThan(10);
  });
});
