import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { City, UNLOCK } from '../src/sim/city';
import type { DayReport } from '../src/sim/cafe';
import { PREMISES } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';
import { staffWarnings } from '../src/sim/warnings';
import { DELOVOY_PLACES, place } from '../src/sim/world';

const DAY = MINUTES_PER_DAY;

/** Город с открытым кварталом: кафе на Кленовой и бистро с бариста */
function cityWithBistro(seed = 4): City {
  const main = new Simulation(seed);
  main.openCafe('cafe');
  const city = new City(main);
  const branch = city.openDistrict();
  expect(branch.openCafe('bistro')).toBe(true);
  branch.hireBarista('shift');
  for (const r of branch.residents) r.aware = true;
  return city;
}

describe('Деловой квартал', () => {
  it('свои жители: в основном офисные с метро; все места из расписаний есть на карте квартала', () => {
    const sim = new Simulation(2, undefined, 'delovoy');
    const offices = sim.residents.filter((r) => r.kind === 'office').length;
    expect(offices).toBeGreaterThanOrEqual(150);
    for (const r of sim.residents) {
      for (const e of [...r.weekday, ...r.weekend]) expect(() => place(e.placeId, 'delovoy')).not.toThrow();
    }
    expect(DELOVOY_PLACES.some((p) => p.id === 'bistro')).toBe(true);
    // Сутки идут без ошибок
    sim.advance(DAY);
    expect(sim.reports).toHaveLength(1);
  });

  it('в будни днём людно, в выходные пусто', () => {
    const sim = new Simulation(2, undefined, 'delovoy');
    const visibleAt = (minute: number) => {
      sim.advance(minute - (sim.time % DAY + DAY) % DAY);
      return sim.residents.filter((r) => r.placeId !== 'metro').length;
    };
    const weekday = visibleAt(13 * 60);
    sim.advance(5 * DAY);
    const weekend = visibleAt(13 * 60);
    expect(weekday).toBeGreaterThan(120);
    expect(weekend).toBeLessThan(weekday / 3);
  });

  it('бистро открывается только в квартале и сразу с плитой и обедами', () => {
    const klen = new Simulation(1);
    expect(klen.openCafe('bistro')).toBe(false);
    const sim = new Simulation(1, undefined, 'delovoy');
    expect(sim.openCafe('cafe')).toBe(false);
    expect(sim.openCafe('bistro')).toBe(true);
    expect(sim.cafe.equipment).toContain('stove');
    expect(sim.cafe.hasItem('lunch')).toBe(true);
    expect(sim.cafe.premises.seats).toBe(true);
  });
});

describe('Город из двух точек', () => {
  it('квартал открывается после двух недель с прибылью от 15 000 ₽', () => {
    const main = new Simulation(1);
    main.openCafe('cafe');
    const city = new City(main);
    const report = (profit: number) => ({ opened: true, profit }) as DayReport;
    main.reports.push(...Array.from({ length: 7 }, () => report(3_000)));
    expect(city.unlockProgress().weeks).toBe(1);
    expect(city.checkUnlock()).toBe(false);
    // Неделя чуть ниже цели — счёт подряд прерывается
    main.reports.push(...Array.from({ length: 7 }, () => report(UNLOCK.weeklyProfit / 7 - 100)));
    expect(city.unlockProgress().weeks).toBe(0);
    main.reports.push(...Array.from({ length: 7 }, () => report(2_200)));
    expect(city.unlockProgress().weeks).toBe(1);
    main.reports.push(...Array.from({ length: 7 }, () => report(2_200)));
    expect(city.checkUnlock()).toBe(true);
    expect(city.branch?.district).toBe('delovoy');
    expect(city.unlocked).toBe(true);
  });

  it('касса общая: аренда бистро списывается из тех же денег', () => {
    const main = new Simulation(4);
    main.openCafe('cafe');
    const city = new City(main);
    const before = main.cash;
    const branch = city.openDistrict();
    branch.openCafe('bistro');
    expect(main.cash).toBe(before - PREMISES.bistro.openingCost);
    expect(branch.cash).toBe(main.cash);
  });

  it('владелец стоит в первой точке: во второй без бариста некому обслужить', () => {
    const main = new Simulation(4);
    main.openCafe('cafe');
    const city = new City(main);
    const branch = city.openDistrict();
    branch.openCafe('bistro');
    expect(branch.cafe.unstaffed).toBe(true);
    expect(staffWarnings(branch.cafe).join(' ')).toContain('первой точке');
    branch.hireBarista('shift');
    expect(branch.cafe.unstaffed).toBe(false);
  });

  it('бистро с бариста продаёт обеды; дни у точек закрываются вместе, погода одна', () => {
    const city = cityWithBistro();
    city.advance(3 * DAY);
    const b = city.branch!;
    expect(b.reports).toHaveLength(city.main.reports.length);
    const lunches = b.reports.reduce((n, r) => n + (r.sold.lunch ?? 0) + (r.sold.soup ?? 0), 0);
    expect(lunches).toBeGreaterThan(20);
    expect(b.weather).toEqual(city.main.weather);
    expect(b.reports.at(-1)!.cashAfter).toBe(city.main.cash);
  });

  it('сохранение города: обе точки и общая касса', () => {
    const city = cityWithBistro();
    city.advance(DAY + 300);
    const back = City.restore(JSON.parse(JSON.stringify(city.serialize())))!;
    expect(back.unlocked).toBe(true);
    expect(back.branch?.district).toBe('delovoy');
    expect(back.branch?.cafe.premisesId).toBe('bistro');
    expect(back.main.cash).toBe(city.main.cash);
    back.branch!.cash -= 1000;
    expect(back.main.cash).toBe(city.main.cash - 1000);
    back.main.cash += 1000;
    // Дальше идут одинаково
    city.advance(DAY);
    back.advance(DAY);
    expect(back.main.cash).toBe(city.main.cash);
    expect(back.branch!.reports.at(-1)!.guests).toBe(city.branch!.reports.at(-1)!.guests);
  });

  it('старое сохранение одной точки загружается как город без квартала', () => {
    const sim = new Simulation(1);
    sim.openCafe('cafe');
    const city = City.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(city.branch).toBeNull();
    expect(city.unlocked).toBe(false);
  });
});
