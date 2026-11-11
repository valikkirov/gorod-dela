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

describe('Сезонные события и особые дни', () => {
  it('в сезон вместо летнего праздника — ярмарка по выходным, в будни — корпоратив', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHoliday(true);
    sim.addMenuItem('cocoa');
    // день 6 — суббота
    while (sim.today % 7 !== 6) sim.advance(MINUTES_PER_DAY);
    const sat = sim.eligibleEvents().map((e) => e.id);
    expect(sat).toContain('fair');
    expect(sat).not.toContain('festival');
    while (sim.today % 7 !== 2) sim.advance(MINUTES_PER_DAY);
    const corp = sim.eligibleEvents().find((e) => e.id === 'corporate');
    expect(corp?.itemId).toBe('cocoa');
    expect(corp!.pay!).toBeGreaterThan(220 * 30);
  });

  it('корпоратив: на следующий день к 16:00 деньги в кассе', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHoliday(true);
    sim.addMenuItem('cocoa');
    while (sim.today % 7 !== 2) sim.advance(MINUTES_PER_DAY);
    const corp = sim.eligibleEvents().find((e) => e.id === 'corporate')!;
    sim.startEvent(corp);
    expect(sim.chooseEvent('accept')).toBe(true);
    sim.advance(2 * MINUTES_PER_DAY);
    expect(sim.reports.some((r) => (r.events ?? []).some((l) => l.includes('Корпоратив')))).toBe(true);
  });

  it('вне сезона сезонных событий нет', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    for (let d = 0; d < 7; d++) {
      expect(sim.eligibleEvents().some((e) => e.id === 'fair' || e.id === 'corporate')).toBe(false);
      sim.advance(MINUTES_PER_DAY);
    }
  });

  it('31 декабря вечером посидеть заходят чаще, 1 января утром — реже', () => {
    const guests = (day: 'eve' | 'newyear' | null, from: number, to: number) => {
      // Владелец стоит 12 ч: открываемся так, чтобы смотреть на часы, когда он за стойкой
      let n = 0;
      for (const seed of [1, 2, 3]) {
        const sim = new Simulation(seed);
        sim.openCafe();
        for (const r of sim.residents) r.aware = true;
        sim.setHoliday(true);
        sim.setHolidayDay(day);
        sim.setHours(from < 12 ? 6 * 60 : 12 * 60, from < 12 ? 18 * 60 : 24 * 60);
        sim.advance(2 * MINUTES_PER_DAY);
        const h = sim.reports.at(-1)!.servedHour ?? [];
        for (let k = from; k < to; k++) n += h[k] ?? 0;
      }
      return n;
    };
    expect(guests('eve', 16, 24)).toBeGreaterThan(guests(null, 16, 24));
    expect(guests('newyear', 6, 12)).toBeLessThan(guests(null, 6, 12));
  }, 60_000);
});
