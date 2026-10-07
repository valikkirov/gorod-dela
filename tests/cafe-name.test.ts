import { describe, expect, it } from 'vitest';
import { CAFE_NAME_MAX } from '../src/sim/cafe';
import { Simulation } from '../src/sim/simulation';

describe('Название заведения', () => {
  it('по умолчанию — по помещению, своё название сохраняется и обрезается', () => {
    const sim = new Simulation(3);
    sim.openCafe('kiosk');
    expect(sim.cafe.title).toBe(sim.cafe.premises.mine);
    sim.cafe.rename('   Кофейня   у сквера  ');
    expect(sim.cafe.title).toBe('Кофейня у сквера');
    const copy = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(copy.cafe.title).toBe('Кофейня у сквера');
    sim.cafe.rename('x'.repeat(100));
    expect(sim.cafe.title).toHaveLength(CAFE_NAME_MAX);
    sim.cafe.rename('   ');
    expect(sim.cafe.title).toBe(sim.cafe.premises.mine);
  });
});
