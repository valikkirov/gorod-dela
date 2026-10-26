import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { KIOSK_FITS, UPGRADE_EFFECT } from '../src/sim/milestones';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

function kiosk(seed = 3): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('kiosk');
  for (const r of sim.residents) r.aware = true;
  return sim;
}

describe('Стойка киоска', () => {
  it('вещи стойки продаются только у киоска и без вехи; кофемашина и витрина — после вех', () => {
    const cafe = new Simulation(1);
    cafe.openCafe('cafe');
    expect(cafe.upgradeState('terminal')).toBe('premises');
    const sim = kiosk();
    expect(sim.upgradeState('terminal')).toBe('ok');
    expect(sim.upgradeState('machine')).toBe('locked');
    expect(KIOSK_FITS).toHaveLength(7);
    const before = sim.cafe.serviceMinutes;
    expect(sim.buyUpgrade('terminal')).toBe(true);
    expect(sim.cafe.serviceMinutes).toBeCloseTo(before * UPGRADE_EFFECT.terminalService, 5);
    expect(sim.upgradeState('terminal')).toBe('owned');
    // Сохраняется вместе с остальными улучшениями
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.cafe.has('terminal')).toBe(true);
  });

  it('витринка: к кофе докупают выпечку', () => {
    const plain = kiosk(5);
    const withPastry = kiosk(5);
    withPastry.buyUpgrade('pastry');
    plain.advance(4 * DAY);
    withPastry.advance(4 * DAY);
    const extras = (s: Simulation) => s.reports.reduce((n, r) => n + (r.extras ?? 0), 0);
    expect(extras(plain)).toBe(0);
    expect(extras(withPastry)).toBeGreaterThan(0);
  }, 30_000);
});
