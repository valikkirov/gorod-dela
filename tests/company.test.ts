import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

function cafeWith(preset: 'standard' | 'premium'): Simulation {
  const sim = new Simulation(2);
  sim.openCafe();
  if (preset !== 'standard') sim.applyPreset(preset);
  for (const r of sim.residents) {
    r.aware = true;
    r.loyalty = 0.35;
  }
  sim.advance(5 * MINUTES_PER_DAY);
  return sim;
}

describe('Постоянные гости приводят знакомых', () => {
  it('в уютном зале за компанию приходят чаще, это видно в отчёте', () => {
    const plain = cafeWith('standard').reports.reduce((n, r) => n + (r.company ?? 0), 0);
    const cozy = cafeWith('premium');
    const company = cozy.reports.reduce((n, r) => n + (r.company ?? 0), 0);
    expect(company).toBeGreaterThan(plain);
    expect(company).toBeGreaterThan(0);
  }, 60_000);

  it('знакомое лицо приводит кого-то — история попадает в новости дня', () => {
    const sim = cafeWith('premium');
    const lines = sim.reports.flatMap((r) => r.news ?? []);
    expect(lines.some((l) => /привел|привёл|привела/.test(l))).toBe(true);
  }, 60_000);
});
