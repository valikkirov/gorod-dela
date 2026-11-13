import { describe, expect, it } from 'vitest';
import { City } from '../src/sim/city';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { BISTRO_PRESETS, BISTRO_SLOTS } from '../src/sim/interior';
import { Simulation } from '../src/sim/simulation';

function bistro(): { city: City; br: Simulation } {
  const main = new Simulation(4);
  main.cash = 1_000_000;
  const city = new City(main);
  main.openCafe('cafe');
  city.advance(MINUTES_PER_DAY);
  const br = city.openDistrict();
  br.openCafe('bistro');
  return { city, br };
}

describe('Зал бистро', () => {
  it('у бистро свой зал: свои места, мебель и «Стандарт» при открытии', () => {
    const { city, br } = bistro();
    expect(br.cafe.interior.kind).toBe('bistro');
    expect(Object.keys(br.cafe.interior.layout).every((s) => BISTRO_SLOTS.some((b) => b.id === s))).toBe(true);
    expect(br.cafe.interior.seats).toBe(4);
    // Мебель кафе в бистро не ставится, и наоборот
    expect(br.placeFurniture('corner', 'sofa')).toBe(false);
    expect(city.main.placeFurniture('b-center', 'commune')).toBe(false);
    expect(br.placeFurniture('b-center', 'commune')).toBe(true);
    expect(br.cafe.interior.seats).toBe(10);
    // Стиля у зала бистро пока нет
    expect(br.applyStyle('loft')).toBe(false);
  });

  it('комплектации бистро ставятся и сохраняются', () => {
    const { br } = bistro();
    expect(br.applyPreset('premium')).toBe(true);
    const premium = BISTRO_PRESETS.find((p) => p.id === 'premium')!;
    expect(br.cafe.interior.matches('premium')).toBe(true);
    expect(br.cafe.interior.layout).toEqual(premium.layout);
    const back = Simulation.restore(JSON.parse(JSON.stringify(br.serialize())))!;
    expect(back.cafe.interior.layout).toEqual(premium.layout);
  });

  it('старое сохранение: в бистро стояла мебель кафе — получает «Стандарт» бистро', () => {
    const { br } = bistro();
    const save = JSON.parse(JSON.stringify(br.serialize()));
    save.cafe.interior = { 'table-1': 'table2', 'table-2': 'table2', walls: 'walls-home', floor: 'floor-home' };
    const back = Simulation.restore(save)!;
    expect(back.cafe.interior.layout).toEqual({ 'b-front-1': 'table2', 'b-front-2': 'table2' });
  });
});
