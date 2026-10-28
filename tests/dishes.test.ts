import { describe, expect, it } from 'vitest';
import { profileOf, tasteMatch } from '../src/sim/character';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { defaultDishName, dishId, dishPrep, dishRecipe, parseDish, validDish } from '../src/sim/dishes';
import { Simulation } from '../src/sim/simulation';
import { recipeCost } from '../src/sim/stock';

describe('Своё блюдо', () => {
  it('рецепт записан в id: порядок добавок не важен, лишние добавки не принимаются', () => {
    expect(dishId('milk-coffee', ['syrup', 'spices'])).toBe(dishId('milk-coffee', ['spices', 'syrup']));
    const id = dishId('milk-coffee', ['syrup', 'double']);
    expect(parseDish(id)?.base.id).toBe('milk-coffee');
    expect(dishRecipe(id)).toEqual({ beans: 2, milk: 1, syrup: 1 });
    expect(recipeCost(id)).toBe(30 * 2 + 20 + 10);
    expect(validDish('milk-coffee', ['syrup', 'double'])).toBe(true);
    expect(validDish('milk-coffee', ['syrup', 'double', 'honey'])).toBe(false); // больше двух
    expect(validDish('soup', ['syrup'])).toBe(false); // сироп в суп нельзя
    expect(defaultDishName(dishId('toast', ['cheese', 'ham']))).toBe('Тост с сыром и ветчиной');
  });

  it('добавки меняют вкус и время приготовления', () => {
    const plain = profileOf(dishId('milk-coffee', []));
    const sweet = profileOf(dishId('milk-coffee', ['syrup', 'chocolate']));
    expect(sweet.sweet).toBeGreaterThan(plain.sweet + 0.5);
    expect(dishPrep(dishId('toast', ['cheese', 'ham']))).toBeGreaterThan(dishPrep(dishId('toast', [])));
    const sweetTooth = { hurry: 0.5, thrift: 0.5, curiosity: 0.5, taste: { sweet: 0.9, strong: -0.3, hearty: 0, novel: 0.3 } };
    expect(tasteMatch(sweetTooth, dishId('milk-coffee', ['syrup', 'chocolate']))).toBeGreaterThan(tasteMatch(sweetTooth, 'americano'));
  });

  it('придумать блюдо: встаёт в меню, своих не больше двух, обеду нужна плита, в киоске нет кухни', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.removeMenuItem('tea');
    expect(sim.createDish('milk-coffee', ['syrup'], 'Сладкий латте', 260)).toBe(true);
    const it = sim.cafe.item(dishId('milk-coffee', ['syrup']));
    expect(it).toMatchObject({ name: 'Сладкий латте', price: 260, kind: 'coffee', cost: 60 });
    expect(sim.createDish('milk-coffee', ['syrup'], 'Ещё раз', 260)).toBe(false); // такое уже есть
    expect(sim.createDish('soup', ['cheese'], 'Сырный суп', 300)).toBe(false); // нет плиты
    expect(sim.createDish('pastry', ['berries'], 'Булочка с ягодами', 200)).toBe(true);
    sim.removeMenuItem('croissant');
    expect(sim.createDish('tea', ['honey'], 'Чай с мёдом', 180)).toBe(false); // третье своё — нельзя
    // Забыть одно — можно придумать новое
    expect(sim.deleteDish(dishId('pastry', ['berries']))).toBe(true);
    expect(sim.createDish('tea', ['honey'], 'Чай с мёдом', 180)).toBe(true);

    const kiosk = new Simulation(1);
    kiosk.openCafe('kiosk');
    kiosk.removeMenuItem('tea');
    expect(kiosk.createDish('soup', ['cheese'], 'Суп', 250)).toBe(false); // кухни в киоске нет
    expect(kiosk.createDish('black-coffee', ['spices'], 'Пряный американо', 180)).toBe(true);
  });

  it('новые добавки заказываются сами и приезжают утром', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.removeMenuItem('tea');
    sim.createDish('pastry', ['chocolate'], 'Булочка с шоколадом', 200);
    expect(sim.cafe.stock.keep.chocolate).toBeGreaterThan(0);
    expect(sim.cafe.stock.pending.chocolate).toBeGreaterThan(0);
    expect(sim.cafe.stock.canMake(dishId('pastry', ['chocolate']))).toBe(false);
    sim.advance(MINUTES_PER_DAY + 30);
    expect(sim.cafe.stock.qty('chocolate')).toBeGreaterThan(0);
  });

  it('сохранение: свои блюда и их цены переживают перезагрузку', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.removeMenuItem('tea');
    sim.createDish('milk-coffee', ['spices'], 'Пряный латте', 250);
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    const id = dishId('milk-coffee', ['spices']);
    expect(back.cafe.own.map((m) => m.name)).toEqual(['Пряный латте']);
    back.setPrice(id, 300);
    expect(back.cafe.own[0].price).toBe(300);
    back.removeMenuItem(id);
    expect(back.addMenuItem(id)).toBe(true);
    expect(back.cafe.item(id).price).toBe(300);
  });

  it('блюдо под вкус гостей продаётся', () => {
    const sim = new Simulation(5);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    sim.removeMenuItem('latte');
    sim.createDish('milk-coffee', ['syrup', 'chocolate'], 'Шоколадный латте', 240);
    sim.advance(10 * MINUTES_PER_DAY);
    const id = dishId('milk-coffee', ['chocolate', 'syrup']);
    const sold = sim.reports.reduce((s, d) => s + (d.sold[id] ?? 0), 0);
    expect(sold).toBeGreaterThanOrEqual(3);
    expect(sim.tasteFans(id).fans).toBeGreaterThan(sim.tasteFans('americano').fans);
  }, 60_000);
});
