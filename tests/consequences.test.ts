import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { EVENTS } from '../src/sim/events';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

/** Кафе, проработавшее несколько дней; сейчас 7:00 */
function running(seed = 5): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  sim.advance(4 * DAY + hm(7));
  return sim;
}

/** Дождаться утра через n дней (после поставки) */
function morningIn(sim: Simulation, n: number): void {
  sim.advance(n * DAY);
}

const lines = (sim: Simulation, days = 10) => sim.reports.slice(-days).flatMap((r) => r.events ?? []).concat(sim.cafe.today.events ?? []);

describe('События с последствиями', () => {
  it('жалоба: выслушали и угостили — через пару дней о вас узнают соседи гостя', () => {
    const sim = running();
    for (const r of sim.residents) r.aware = false;
    const guest = sim.residents.find((r) => sim.residents.some((x) => x.id !== r.id && x.homeId === r.homeId))!;
    guest.aware = true;
    sim.startEvent({ id: 'complaint', day: sim.today, residentId: guest.id, residentName: guest.name, topic: 'long-wait', itemId: 'americano', itemName: 'Американо' });
    const before = guest.loyalty;
    expect(sim.chooseEvent('apologize')).toBe(true);
    expect(guest.loyalty).toBeGreaterThan(before);
    const aware = sim.awareCount;
    morningIn(sim, EVENTS.complaint.goodAfter);
    expect(sim.awareCount).toBeGreaterThan(aware);
    expect(lines(sim).some((l) => l.startsWith('💬'))).toBe(true);
  }, 60_000);

  it('жалоба: промолчали — через несколько дней знакомые гостя относятся к вам холоднее', () => {
    const sim = running();
    const guest = sim.residents[0];
    for (const r of sim.residents) {
      r.aware = true;
      r.loyalty = 0.3;
    }
    sim.startEvent({ id: 'complaint', day: sim.today, residentId: guest.id, residentName: guest.name, topic: 'pricey', itemId: 'americano', itemName: 'Американо' });
    sim.chooseEvent('ignore');
    expect(guest.loyalty).toBeLessThan(0.3);
    // До срока ничего не происходит
    sim.advance(DAY);
    expect(lines(sim, 1).some((l) => l.startsWith('💬'))).toBe(false);
    morningIn(sim, EVENTS.complaint.badAfter - 1);
    expect(lines(sim).some((l) => l.startsWith('💬') && l.includes('холоднее'))).toBe(true);
  }, 60_000);

  it('жалобу приносит вчерашний гость, которому визит не понравился', () => {
    const sim = running();
    const r = sim.residents.find((x) => !x.commute)!;
    r.aware = true;
    r.memory = [{ day: sim.today - 1, itemId: 'americano', score: -0.5, notes: ['long-wait'] }];
    const e = sim.eligibleEvents().find((x) => x.id === 'complaint');
    expect(e?.residentId).toBe(r.id);
    expect(e?.topic).toBe('long-wait');
  });

  it('холодильник: подлатали — потечёт снова, скоропорт пропадёт и компрессор всё равно менять', () => {
    let checked = false;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = running(seed);
      sim.cafe.addItem('cappuccino');
      sim.startEvent({ id: 'fridge', day: sim.today });
      sim.chooseEvent('patch');
      const relapse = sim.effects.find((e) => e.type === 'relapse');
      if (!relapse || relapse.type !== 'relapse') continue;
      sim.cafe.stock.addNow('milk', 30, relapse.day - 1, 20);
      sim.advance((relapse.day - sim.today) * DAY - hm(7) + hm(6) + 30);
      const t = sim.cafe.today;
      expect(t.writtenOffItems.milk ?? 0).toBeGreaterThan(0);
      expect((t.events ?? []).some((l) => l.startsWith('🧊'))).toBe(true);
      expect(t.other ?? 0).toBeGreaterThanOrEqual(EVENTS.fridge.fixCost);
      checked = true;
      break;
    }
    expect(checked).toBe(true);
  }, 120_000);

  it('холодильник: поменяли компрессор — больше не течёт', () => {
    const sim = running();
    sim.startEvent({ id: 'fridge', day: sim.today });
    const cash = sim.cash;
    sim.chooseEvent('fix');
    expect(sim.cash).toBe(cash - EVENTS.fridge.fixCost);
    expect(sim.effects.some((e) => e.type === 'relapse')).toBe(false);
  });

  it('проверка: без подготовки нашли нарушения — штраф и стойка стоит; подготовились — без штрафа', () => {
    for (const option of ['risk', 'prepare'] as const) {
      const sim = running();
      sim.setHours(hm(7), hm(22));
      sim.startEvent({ id: 'inspection', day: sim.today });
      sim.chooseEvent(option);
      const e = sim.effects.find((x) => x.type === 'inspection')!;
      expect(e).toBeDefined();
      if (e.type !== 'inspection') continue;
      if (option === 'risk') e.fail = true;
      expect(e.day).toBeGreaterThanOrEqual(sim.today + EVENTS.inspection.from);
      expect(e.day).toBeLessThanOrEqual(sim.today + EVENTS.inspection.to);
      sim.advance((e.day - sim.today) * DAY + (e.minute - hm(7)) + 5);
      expect(sim.effects.some((x) => x.type === 'inspection')).toBe(false);
      const line = (sim.cafe.today.events ?? []).find((l) => l.startsWith('🧾'))!;
      expect(line).toBeDefined();
      expect(sim.cafe.prepUntil).toBeGreaterThan(e.minute);
      if (option === 'risk') expect(sim.cafe.today.other ?? 0).toBeGreaterThanOrEqual(EVENTS.inspection.fine);
      else expect(line).toContain('нарушений нет');
    }
  }, 120_000);

  it('ферма: молоко дешевле, испорченная партия идёт в списание, в конце — итог', () => {
    const sim = running();
    sim.cafe.addItem('cappuccino');
    sim.startEvent({ id: 'farm', day: sim.today, ingredientId: 'milk' });
    sim.chooseEvent('sign');
    const farm = sim.farm!;
    expect(farm.price).toBeLessThan(20);
    sim.cafe.stock.order('milk', 40);
    morningIn(sim, 1);
    expect(sim.farm!.saved).toBeGreaterThan(0);
    // Сбой на ближайшую поставку: заказываем каждый вечер, пока не привезут испорченное
    farm.bad = Array.from({ length: 7 }, (_, i) => sim.today + 1 + i);
    let spoiled = false;
    for (let i = 0; i < 7 && !spoiled; i++) {
      sim.cafe.stock.order('milk', 30);
      morningIn(sim, 1);
      spoiled = (sim.cafe.today.writtenOffItems.milk ?? 0) > 0;
    }
    expect(spoiled).toBe(true);
    expect((sim.cafe.today.events ?? []).some((l) => l.startsWith('🚜'))).toBe(true);
    expect(sim.farm!.lost).toBeGreaterThan(0);
    morningIn(sim, EVENTS.farm.days);
    expect(sim.farm).toBeNull();
    expect(lines(sim, EVENTS.farm.days).some((l) => l.includes('Договор с фермой закончился'))).toBe(true);
  }, 120_000);

  it('отложенные последствия переживают сохранение', () => {
    const sim = running();
    sim.cafe.addItem('cappuccino');
    sim.startEvent({ id: 'farm', day: sim.today, ingredientId: 'milk' });
    sim.chooseEvent('sign');
    sim.advance(DAY);
    sim.startEvent({ id: 'inspection', day: sim.today });
    sim.chooseEvent('prepare');
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.farm).toEqual(sim.farm);
    expect(back.effects).toEqual(sim.effects);
  }, 60_000);
});
