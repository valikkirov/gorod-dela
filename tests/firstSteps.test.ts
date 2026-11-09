import { describe, expect, it } from 'vitest';
import { FIRST_STEPS } from '../src/sim/firstSteps';
import { Simulation } from '../src/sim/simulation';

const DAY = 24 * 60;

describe('Первые шаги', () => {
  it('отмечаются по действиям игрока и по игре', () => {
    const sim = new Simulation(7);
    sim.openCafe();
    expect(Object.keys(sim.steps)).toEqual([]);
    const it0 = sim.cafe.menu[0];
    sim.setPrice(it0.id, it0.price + 20);
    sim.orderIngredient('beans', 10);
    sim.markStep('resident');
    sim.advance(3 * DAY);
    for (const s of FIRST_STEPS) expect(sim.steps[s.id], s.id).toBeDefined();
    expect(sim.drainEvents().filter((e) => e.type === 'step').length).toBe(FIRST_STEPS.length);
  });

  it('та же цена шаг не засчитывает', () => {
    const sim = new Simulation(7);
    sim.openCafe();
    const it0 = sim.cafe.menu[0];
    sim.setPrice(it0.id, it0.price);
    expect(sim.steps.price).toBeUndefined();
  });

  it('сохраняются; старая игра без шагов считается пройденной', () => {
    const sim = new Simulation(7);
    sim.openCafe();
    sim.markStep('resident');
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.steps.resident).toBe(sim.steps.resident);
    expect(back.steps.price).toBeUndefined();

    sim.advance(5 * DAY);
    const old = JSON.parse(JSON.stringify(sim.serialize()));
    delete old.steps;
    const restored = Simulation.restore(old)!;
    for (const s of FIRST_STEPS) expect(restored.steps[s.id]).toBeDefined();
  });
});
