import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { CHALLENGE, resultIfFinished } from '../src/game/challenge';
import { Simulation } from '../src/sim/simulation';

describe('Испытание недели', () => {
  it('у всех один и тот же город: жители, погода и события совпадают', () => {
    const a = new Simulation(CHALLENGE.seed);
    const b = new Simulation(CHALLENGE.seed);
    expect(a.residents.map((r) => [r.name, r.kind, r.homeId])).toEqual(b.residents.map((r) => [r.name, r.kind, r.homeId]));
    a.openCafe('kiosk');
    b.openCafe('kiosk');
    a.advance(MINUTES_PER_DAY * 6);
    b.advance(MINUTES_PER_DAY * 6);
    expect(a.reports.map((r) => [r.weather, r.events, r.guests])).toEqual(b.reports.map((r) => [r.weather, r.events, r.guests]));
  });

  it('итог — касса на конец последнего дня, раньше итога нет', () => {
    const sim = new Simulation(CHALLENGE.seed);
    sim.openCafe('kiosk');
    sim.advance(MINUTES_PER_DAY * (CHALLENGE.days - 1));
    expect(resultIfFinished(sim)).toBeNull();
    sim.advance(MINUTES_PER_DAY * 3);
    const r = resultIfFinished(sim)!;
    expect(r.cash).toBe(sim.reports[CHALLENGE.days - 1].cashAfter);
    expect(r.guests).toBe(sim.reports.slice(0, CHALLENGE.days).reduce((s, x) => s + x.guests, 0));
    expect(r.premises).toMatch(/^Киоск/);
  });
});
