import { describe, expect, it } from 'vitest';
import { SPECIALTY } from '../src/sim/cafe';
import { hm } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

describe('Специализация', () => {
  it('до трёх категорий в меню — специализация; четвёртая снимает её', () => {
    const sim = new Simulation(2);
    sim.openCafe('cafe');
    expect([...(sim.cafe.specialty ?? [])].sort()).toEqual(['coffee', 'snack', 'tea']);
    sim.cafe.equipment.push('stove');
    sim.cafe.addItem('lunch');
    expect(sim.cafe.specialty).toBeNull();
  });

  it('утром в пик обслуживание быстрее, в обед — как обычно', () => {
    const sim = new Simulation(2);
    sim.openCafe('cafe');
    sim.advance(hm(2)); // 8:00
    expect(sim.cafe.serviceFactor).toBeCloseTo(SPECIALTY.speed);
    sim.advance(hm(4)); // 12:00
    expect(sim.cafe.serviceFactor).toBe(1);
  });

  it('без специализации утро не быстрее', () => {
    const sim = new Simulation(2);
    sim.openCafe('cafe');
    sim.cafe.equipment.push('stove');
    sim.cafe.addItem('lunch');
    sim.advance(hm(2));
    expect(sim.cafe.serviceFactor).toBe(1);
  });
});
