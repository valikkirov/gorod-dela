import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { ECONOMY } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

describe('Город', () => {
  it('детерминирован: один seed — один и тот же город', () => {
    const a = new Simulation(42);
    const b = new Simulation(42);
    a.openCafe();
    b.openCafe();
    a.advance(DAY);
    b.advance(DAY);
    expect(a.residents.map((r) => r.pos)).toEqual(b.residents.map((r) => r.pos));
    expect(a.cash).toBe(b.cash);
  });

  it('ночью улица пустая', () => {
    const sim = new Simulation(1, hm(23, 0));
    sim.advance(hm(4, 0)); // до 03:00
    expect(sim.onStreet).toBe(0);
  });

  it('днём офисные сотрудники доходят до работы', () => {
    const sim = new Simulation(1);
    sim.advance(hm(4, 30)); // 06:00 → 10:30
    for (const r of sim.residents.filter((r) => r.kind === 'office')) {
      expect(r.placeId).toBe(r.workId);
    }
  });
});

describe('Кафе', () => {
  it('пока кафе не открыто, спрос всё равно виден в отчёте', () => {
    const sim = new Simulation(1);
    sim.advance(DAY);
    const report = sim.reports[0];
    expect(report.guests).toBe(0);
    expect(report.missed['not-open']).toBeGreaterThan(20);
    expect(sim.cash).toBe(ECONOMY.startCash);
  });

  it('открытие стоит денег, гости приносят выручку', () => {
    const sim = new Simulation(1);
    expect(sim.openCafe()).toBe(true);
    expect(sim.cash).toBe(ECONOMY.startCash - ECONOMY.cafeOpeningCost);
    sim.advance(DAY);
    const r = sim.reports[0];
    expect(r.guests).toBeGreaterThan(10);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.rent).toBe(ECONOMY.rentPerDay);
    expect(r.tax).toBe(Math.round(r.revenue * ECONOMY.taxRate));
    expect(r.cashAfter).toBe(sim.cash);
  });

  it('при завышенных ценах почти никто не заходит — «дорого»', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    for (const m of sim.cafe.menu) sim.setPrice(m.id, m.price * 3);
    sim.advance(DAY);
    const r = sim.reports[0];
    expect(r.guests).toBeLessThanOrEqual(2);
    expect(r.missed.expensive).toBeGreaterThan(30);
  });

  it('открыться раньше — поймать утренний поток', () => {
    const late = new Simulation(1);
    const early = new Simulation(1);
    late.openCafe();
    early.openCafe();
    early.setHours(hm(7, 0), hm(20, 0));
    late.advance(DAY);
    early.advance(DAY);
    expect(early.reports[0].missed.closed ?? 0).toBeLessThan(late.reports[0].missed.closed ?? 0);
    expect(early.reports[0].guests).toBeGreaterThan(late.reports[0].guests);
  });

  it('бариста стоит денег в отчёте', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setBaristas(1);
    sim.advance(DAY);
    expect(sim.reports[0].wages).toBe(ECONOMY.baristaWagePerShift);
  });

  it('три дня в минусе — банкротство', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.cash = 1_000;
    for (const m of sim.cafe.menu) sim.setPrice(m.id, 5_000);
    sim.advance(DAY * 4);
    expect(sim.bankrupt).toBe(true);
    expect(sim.reports.length).toBe(3);
  });

  it('у каждого жителя видно, почему он зашёл или нет', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.advance(DAY);
    const decided = sim.residents.filter((r) => r.decision);
    expect(decided.length).toBeGreaterThan(30);
    for (const r of decided) {
      expect(r.decision!.visited || r.decision!.reason).toBeTruthy();
    }
  });
});
