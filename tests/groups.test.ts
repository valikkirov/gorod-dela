import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY, weekday } from '../src/sim/clock';
import { formGroups, FRIENDS, GROUP } from '../src/sim/groups';
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

/** Кафе с баром до ночи, все знают */
function openBar(seed = 3): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  sim.setHours(hm(8), hm(23, 30));
  sim.cafe.equipment.push('tap');
  sim.cafe.addItem('beer');
  for (const r of sim.residents) r.aware = true;
  return sim;
}

describe('Пятничные компании друзей', () => {
  it('молодёжь и студенты улицы, по 3–4 человека, не больше трёх компаний', () => {
    const sim = new Simulation(7);
    const friends = sim.groups.filter((g) => g.friends);
    expect(friends.length).toBeGreaterThan(0);
    expect(friends.length).toBeLessThanOrEqual(FRIENDS.max);
    for (const g of friends) {
      expect(g.members.length).toBeGreaterThanOrEqual(FRIENDS.minSize);
      for (const id of g.members) {
        expect(['youth', 'student']).toContain(sim.residents[id].kind);
        expect(sim.residents[id].homeId).not.toBe('metro');
      }
    }
  });

  it('в пятницу вечером компания выходит в одно время и решает вместе', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sim = openBar(seed);
      while (weekday(sim.today) !== FRIENDS.weekday) sim.advance(MINUTES_PER_DAY);
      // У всех друзей одной компании — общий вечер
      for (const g of sim.groups.filter((x) => x.friends)) {
        const starts = g.members.map((id) => sim.residents[id].schedule.find((e) => e.activity === 'night' && e.start >= FRIENDS.meet)?.start);
        expect(new Set(starts).size).toBe(1);
      }
      sim.advance(hm(16)); // с 6:00 до 22:00
      for (const g of sim.groups.filter((x) => x.friends)) {
        const t = sim.groupFor(g.members[0])!.today;
        if (!t) continue;
        checked += 1;
        for (const id of g.members) {
          const d = sim.residents[id].decision;
          if (!d || d.want !== 'bar' || d.day !== sim.today) continue;
          if (!t.go) expect(d.visited).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);

  it('в будни у друзей свой вечер, как обычно', () => {
    const sim = openBar();
    while (weekday(sim.today) !== 1) sim.advance(MINUTES_PER_DAY);
    for (const g of sim.groups.filter((x) => x.friends))
      for (const id of g.members) expect(sim.residents[id].schedule).toBe(sim.residents[id].weekday);
  }, 60_000);
});
