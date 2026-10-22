import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

describe('Оборудование под категорию меню', () => {
  it('без плиты обедов нет, без крана — пива; купил — можно добавить', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    expect(sim.addMenuItem('lunch')).toBe(false);
    expect(sim.cafe.missingEquipment('lunch')).toBe('stove');
    expect(sim.cafe.missingEquipment('beer')).toBe('tap');
    expect(sim.cafe.missingEquipment('croissant')).toBeNull();
    const cash = sim.cash;
    expect(sim.buyEquipment('stove')).toBe(true);
    expect(sim.cash).toBe(cash - EQUIPMENT.stove.cost);
    expect(sim.buyEquipment('stove')).toBe(false); // второй раз не покупается
    expect(sim.addMenuItem('lunch')).toBe(true);
    expect(sim.addMenuItem('beer')).toBe(false);
  });

  it('в киоске плиту и кран не купить', () => {
    const sim = new Simulation(1);
    sim.openCafe('kiosk');
    expect(sim.buyEquipment('stove')).toBe(false);
    expect(sim.buyEquipment('tap')).toBe(false);
  });

  it('оборудование прибавляет к коммуналке за часы работы', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const before = sim.cafe.utilitiesPerDay;
    sim.buyEquipment('stove');
    const hours = (sim.cafe.closeAt - sim.cafe.openAt) / 60;
    expect(sim.cafe.utilitiesPerDay - before).toBe(Math.round(EQUIPMENT.stove.utilitiesPerHour * hours));
  });

  it('старое сохранение: что уже продаётся, то оборудование и стоит', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.cafe.equipment.push('stove');
    sim.addMenuItem('lunch');
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    delete save.cafe.equipment;
    const back = Simulation.restore(save)!;
    expect(back.cafe.equipment).toEqual(['stove']);
  });
});
