import { describe, expect, it } from 'vitest';
import { MARKDOWN_DEFAULT } from '../src/sim/cafe';
import { City } from '../src/sim/city';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { PREMISES } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

/** Город с кафе на Кленовой и открытым кварталом: пекарню уже можно открыть */
function cityWithCafe(seed = 4): City {
  const main = new Simulation(seed);
  main.openCafe('cafe');
  main.buySign();
  const c = new City(main);
  c.advance(3 * DAY);
  c.openDistrict();
  return c;
}

describe('Пекарня на Садовой', () => {
  it('открывается второй точкой в районе: жители и касса общие, своего конкурента нет', () => {
    const c = cityWithCafe();
    const cash = c.main.cash;
    expect(c.canOpenBakery()).toBe(true);
    const b = c.openBakery()!;
    expect(b).not.toBeNull();
    expect(b.residents).toBe(c.main.residents);
    expect(b.rival).toBeNull();
    expect(c.main.cash).toBe(cash - PREMISES.bakery.openingCost);
    expect(b.cafe.menu.every((m) => m.kind !== 'lunch')).toBe(true);
    expect(b.cafe.hasItem('bread')).toBe(true);
    expect(c.canOpenBakery()).toBe(false);
  }, 60_000);

  it('за неделю жители ходят в обе точки, кафе своё не теряет полностью', () => {
    const c = cityWithCafe();
    const b = c.openBakery()!;
    // Владелец стоит в кафе — в пекарне нужен свой человек
    expect(b.hireBarista('shift')).toBe(true);
    c.advance(7 * DAY);
    const week = (s: Simulation) => s.reports.slice(-7).reduce((x, r) => x + r.guests, 0);
    expect(week(b)).toBeGreaterThan(30);
    expect(week(c.main)).toBeGreaterThan(30);
    // Своя выпечка продаётся только в пекарне
    expect(c.main.cafe.fits('bread')).toBe(false);
  }, 120_000);

  it('вечером своя выпечка дешевле, утром — по полной', () => {
    const c = cityWithCafe();
    const b = c.openBakery()!;
    const bread = b.cafe.menu.find((m) => m.id === 'bread')!;
    expect(b.cafe.priceAt(bread, hm(9))).toBe(bread.price);
    expect(b.cafe.priceAt(bread, MARKDOWN_DEFAULT.from + 30)).toBeLessThan(bread.price);
    const coffee = b.cafe.menu.find((m) => m.kind === 'coffee')!;
    expect(b.cafe.priceAt(coffee, MARKDOWN_DEFAULT.from + 30)).toBe(coffee.price);
    b.setMarkdown(null);
    expect(b.cafe.priceAt(bread, MARKDOWN_DEFAULT.from + 30)).toBe(bread.price);
  }, 60_000);

  it('непроданное к ночи списывается', () => {
    const c = cityWithCafe();
    const b = c.openBakery()!;
    // Печём с запасом — что-то точно останется
    b.hireBarista('shift');
    b.setKeep('oven', 200);
    c.advance(3 * DAY);
    expect(b.reports.slice(-2).some((r) => (r.writtenOffItems.oven ?? 0) > 0)).toBe(true);
  }, 120_000);

  it('пекарня переживает сохранение и продолжает работать', () => {
    const c = cityWithCafe();
    c.openBakery()!.hireBarista('shift');
    c.advance(2 * DAY);
    const back = City.restore(JSON.parse(JSON.stringify(c.serialize())))!;
    expect(back.bakery).not.toBeNull();
    expect(back.bakery!.residents).toBe(back.main.residents);
    c.advance(DAY);
    back.advance(DAY);
    expect(back.bakery!.reports.length).toBe(c.bakery!.reports.length);
    expect(back.bakery!.reports.at(-1)!.guests).toBeGreaterThan(0);
  }, 120_000);
});
