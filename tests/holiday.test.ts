import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { isHolidayDate } from '../src/sim/holiday';
import { Simulation } from '../src/sim/simulation';

const WINTER = ['sunny', 'cloudy', 'snow', 'frost'];

describe('Новогодний сезон', () => {
  it('сезон — с 15 декабря по 12 января', () => {
    expect(isHolidayDate(12, 14)).toBe(false);
    expect(isHolidayDate(12, 15)).toBe(true);
    expect(isHolidayDate(12, 31)).toBe(true);
    expect(isHolidayDate(1, 12)).toBe(true);
    expect(isHolidayDate(1, 13)).toBe(false);
    expect(isHolidayDate(7, 1)).toBe(false);
  });

  it('в сезон погода зимняя и с минусом, вне сезона — без снега и мороза', () => {
    const sim = new Simulation(4);
    sim.setHoliday(true);
    expect(sim.weather.temp).toBeLessThanOrEqual(2);
    for (let d = 0; d < 20; d++) {
      sim.advance(MINUTES_PER_DAY);
      expect(WINTER).toContain(sim.weather.kind);
      expect(sim.weather.temp).toBeLessThanOrEqual(2);
    }
    sim.setHoliday(false);
    for (let d = 0; d < 20; d++) {
      sim.advance(MINUTES_PER_DAY);
      expect(['snow', 'frost']).not.toContain(sim.weather.kind);
      expect(sim.weather.temp).toBeGreaterThan(2);
    }
  });

  it('без сезона погода та же, что раньше: сезон по умолчанию выключен и ничего не сдвигает', () => {
    const a = new Simulation(9);
    const b = new Simulation(9);
    b.setHoliday(false);
    a.advance(10 * MINUTES_PER_DAY);
    b.advance(10 * MINUTES_PER_DAY);
    expect(a.reports.map((r) => r.weather?.kind)).toEqual(b.reports.map((r) => r.weather?.kind));
  });

  it('сезонное меню — только в сезон', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    expect(sim.addMenuItem('cocoa')).toBe(false);
    sim.setHoliday(true);
    expect(sim.addMenuItem('cocoa')).toBe(true);
    expect(sim.cafe.hasItem('cocoa')).toBe(true);
  });

  it('в сезон сезонное берут охотнее, чем то же самое вне сезона', () => {
    const run = (season: boolean) => {
      let sold = 0;
      for (const seed of [1, 2, 3]) {
        const sim = new Simulation(seed);
        sim.openCafe();
        for (const r of sim.residents) r.aware = true;
        sim.setHoliday(true);
        sim.addMenuItem('cocoa');
        if (!season) sim.setHoliday(false);
        sim.advance(5 * MINUTES_PER_DAY);
        sold += sim.reports.reduce((s, d) => s + (d.sold?.cocoa ?? 0), 0);
      }
      return sold;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  }, 60_000);

  it('ёлку и гирлянду можно поставить только в сезон', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    expect(sim.placeFurniture('tree', 'tree')).toBe(false);
    sim.setHoliday(true);
    expect(sim.placeFurniture('tree', 'tree')).toBe(true);
    expect(sim.placeFurniture('garland', 'garland')).toBe(true);
    // Комплектация декор не трогает
    expect(sim.applyPreset('cozy')).toBe(true);
    expect(sim.cafe.interior.layout.tree).toBe('tree');
  });
});
