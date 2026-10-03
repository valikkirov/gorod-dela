import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { RIVAL } from '../src/sim/rival';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

function openKnown(sim: Simulation, premises: 'cafe' | 'kiosk' = 'cafe'): void {
  sim.openCafe(premises);
  for (const r of sim.residents) r.aware = true;
}

describe('Конкурент', () => {
  it('открывается в другом помещении через несколько дней и забирает часть гостей', () => {
    const sim = new Simulation(2);
    openKnown(sim, 'cafe');
    expect(sim.rival!.placeId).toBe('kiosk');
    expect(sim.rival!.opensDay).toBe(1 + RIVAL.delayDays);
    sim.advance(DAY * 8);
    const before = sim.reports.slice(0, RIVAL.delayDays);
    const after = sim.reports.slice(RIVAL.delayDays);
    expect(before.every((r) => !r.rivalGuests && !r.missed.rival)).toBe(true);
    expect(after.some((r) => (r.rivalGuests ?? 0) > 5)).toBe(true);
    expect(after.some((r) => (r.missed.rival ?? 0) > 0)).toBe(true);
  });

  it('если ты в киоске — напротив открывается столовая', () => {
    const sim = new Simulation(2);
    openKnown(sim, 'kiosk');
    expect(sim.rival!.placeId).toBe('cafe');
    expect(sim.rival!.menu(sim.rival!.opensDay).some((m) => m.id === 'lunch')).toBe(true);
  });

  it('акция по расписанию: каждая третья неделя, цены ниже', () => {
    const sim = new Simulation(2);
    openKnown(sim);
    const rival = sim.rival!;
    const d0 = rival.opensDay;
    expect(rival.promo(d0)).toBe(false);
    expect(rival.promo(d0 + 14)).toBe(true);
    expect(rival.promo(d0 + 20)).toBe(true);
    expect(rival.promo(d0 + 21)).toBe(false);
    const normal = rival.menu(d0).find((m) => m.id === 'cappuccino')!.price;
    const promo = rival.menu(d0 + 14).find((m) => m.id === 'cappuccino')!.price;
    expect(promo).toBeLessThan(normal);
    expect(rival.daysToPromo(d0)).toBe(14);
  });

  it('сохраняется вместе с игрой', () => {
    const a = new Simulation(5);
    openKnown(a);
    a.advance(DAY * 6 + 300);
    const b = Simulation.restore(JSON.parse(JSON.stringify(a.serialize())))!;
    a.advance(DAY * 2);
    b.advance(DAY * 2);
    expect(b.cash).toBe(a.cash);
    expect(b.reports.map((r) => r.rivalGuests)).toEqual(a.reports.map((r) => r.rivalGuests));
  });
});
