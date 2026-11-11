import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY, weekday } from '../src/sim/clock';
import { formGroups, GROUP } from '../src/sim/groups';
import { Simulation } from '../src/sim/simulation';

/** Кафе с бизнес-ланчем, все знают, открыто 8–20 */
function openLunch(seed = 3): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  sim.setHours(hm(8), hm(20));
  sim.cafe.equipment.push('stove');
  sim.cafe.addItem('lunch');
  for (const r of sim.residents) r.aware = true;
  return sim;
}

describe('Компании коллег', () => {
  it('коллеги одного офиса, по 3–4 человека, не больше четырёх компаний', () => {
    for (const district of ['klenovaya', 'delovoy'] as const) {
      const sim = new Simulation(7, undefined, district);
      const groups = formGroups(sim.residents);
      expect(groups.length).toBe(GROUP.max);
      for (const g of groups) {
        expect(g.members.length).toBeGreaterThanOrEqual(GROUP.minSize);
        expect(g.members.length).toBeLessThanOrEqual(GROUP.size);
        for (const id of g.members) {
          expect(sim.residents[id].kind).toBe('office');
          expect(sim.residents[id].workId).toBe(g.workId);
        }
      }
    }
  });

  it('решают вместе: в будний обед никто из компании не обедает у вас, если компания решила идти мимо', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = openLunch(seed);
      while (weekday(sim.today) > 4) sim.advance(MINUTES_PER_DAY);
      sim.advance(hm(9)); // 15:00
      for (const g of sim.groups) {
        const t = sim.groupFor(g.members[0])!.today;
        if (!t) continue;
        for (const id of g.members) {
          const d = sim.residents[id].decision;
          if (!d || d.want !== 'lunch' || d.day !== sim.today) continue;
          checked += 1;
          // Решили идти — у каждого своя судьба в очереди, но не «компания против»; решили мимо — не зашёл никто
          if (t.go) expect(d.reason).not.toBe('company');
          else {
            expect(d.visited).toBe(false);
            expect(d.reason).toBe(t.reason);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);

  it('решение компании переживает сохранение', () => {
    const sim = openLunch();
    while (weekday(sim.today) > 4) sim.advance(MINUTES_PER_DAY);
    sim.advance(hm(9));
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    for (const g of sim.groups) expect(back.groupFor(g.members[0])!.today).toEqual(sim.groupFor(g.members[0])!.today);
  }, 60_000);
});
