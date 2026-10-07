import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { ECONOMY } from '../src/sim/economy';
import { card, EVENTS } from '../src/sim/events';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

function openKnown(seed = 4): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  for (const r of sim.residents) r.aware = true;
  return sim;
}

function start(sim: Simulation, id: string): void {
  const e = sim.eligibleEvents().find((x) => x.id === id);
  if (!e) throw new Error(`Событие ${id} сейчас невозможно`);
  sim.startEvent(e);
}

const coffeeSold = (sim: Simulation) =>
  sim.cafe.menu.filter((m) => m.kind === 'coffee').reduce((s, m) => s + (sim.cafe.today.sold[m.id] ?? 0), 0);

describe('События-дилеммы', () => {
  it('случаются сами после первых дней, не чаще раза в утро, и одинаково при одном seed', () => {
    const run = () => {
      const sim = openKnown(5);
      sim.advance(DAY * 28);
      return sim.reports.map((r) => r.events ?? []);
    };
    const a = run();
    expect(a.slice(0, EVENTS.fromDay).flat()).toHaveLength(0);
    expect(a.flat().length).toBeGreaterThanOrEqual(3);
    expect(run()).toEqual(a);
  }, 30_000);

  it('у каждого события есть варианты с подсказкой и вариант по умолчанию', () => {
    const sim = openKnown();
    sim.hireBarista('shift');
    for (const e of sim.eligibleEvents()) {
      const c = card(e);
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.every((o) => o.hint.length > 5)).toBe(true);
      expect(c.options.some((o) => o.id === c.fallback)).toBe(true);
    }
  });

  it('поломка: без кофе, пока не починят; срочный мастер возвращает кофе через полтора часа', () => {
    const sim = openKnown();
    sim.advance(hm(2)); // 8:00, кафе открылось
    start(sim, 'breakdown');
    const before = coffeeSold(sim);
    sim.advance(60);
    expect(coffeeSold(sim)).toBe(before);
    const cash = sim.cash;
    expect(sim.chooseEvent('urgent')).toBe(true);
    expect(sim.cash).toBeLessThanOrEqual(cash - EVENTS.breakdown.urgentCost + 1000);
    sim.advance(hm(4));
    expect(coffeeSold(sim)).toBeGreaterThan(before);
    expect(sim.cafe.today.other).toBe(EVENTS.breakdown.urgentCost);
  });

  it('не решил до конца дня — срабатывает вариант по умолчанию, и это видно в отчёте', () => {
    const sim = openKnown();
    sim.advance(hm(2));
    start(sim, 'breakdown');
    sim.advance(DAY);
    expect(sim.pendingEvent).toBeNull();
    const r = sim.reports[0];
    expect(r.other).toBe(EVENTS.breakdown.laterCost);
    expect(r.events?.[0]).toMatch(/не.успели решить/);
    // Кофе весь день не варили
    expect(sim.cafe.menu.filter((m) => m.kind === 'coffee').every((m) => !(r.sold[m.id] ?? 0))).toBe(true);
  });

  it('заказ офиса: продукты отдельно, деньги завтра, но в обед стойка занята', () => {
    const sim = openKnown();
    start(sim, 'office-order');
    const e = sim.pendingEvent!;
    const cash = sim.cash;
    const stock = sim.cafe.stock.qty('kitchen');
    sim.chooseEvent('accept');
    expect(sim.cash).toBe(cash - e.ingredientCost!);
    expect(sim.cafe.stock.qty('kitchen')).toBe(stock);
    sim.advance(DAY + hm(5) + 1); // завтра 11:01
    expect(sim.cafe.today.revenue).toBeGreaterThanOrEqual(e.pay!);
    expect(sim.cafe.today.events?.some((l) => l.includes('Стойка была занята'))).toBe(true);
    expect(sim.cafe.prepUntil).toBeGreaterThan(hm(11) + 15);
  });

  it('поставщик: партия сразу на складе и дешевле обычного', () => {
    const sim = openKnown();
    start(sim, 'supplier');
    const id = sim.pendingEvent!.ingredientId!;
    const q = sim.cafe.stock.qty(id);
    const cash = sim.cash;
    sim.chooseEvent('take');
    expect(sim.cafe.stock.qty(id)).toBe(q + EVENTS.supplier.qty);
    expect(cash - sim.cash).toBeGreaterThan(0);
  });

  it('отгул: отпустил — бариста не работает и не получает; попросил выйти — работает за доплату', () => {
    const let_ = openKnown();
    const b = let_.cafe.staff.length ? let_.cafe.staff[0] : (let_.hireBarista('shift'), let_.cafe.staff[0]);
    start(let_, 'day-off');
    let_.chooseEvent('let');
    let_.advance(hm(4));
    expect(let_.cafe.isWorking(b)).toBe(false);
    expect(let_.cafe.wagesSoFar).toBe(0);

    const ask = openKnown();
    ask.hireBarista('shift');
    const b2 = ask.cafe.staff[0];
    start(ask, 'day-off');
    ask.chooseEvent('ask');
    ask.advance(hm(4));
    expect(ask.cafe.isWorking(b2)).toBe(true);
    expect(ask.cafe.today.other).toBe(Math.round(ECONOMY.shiftWage * EVENTS.dayOff.extra));
  });

  it('событие, ждущее решения, переживает сохранение', () => {
    const sim = openKnown();
    for (const r of sim.residents) if (r.kind === 'youth' || r.kind === 'visitor') r.aware = false;
    start(sim, 'blogger');
    const copy = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(copy.pendingEvent?.id).toBe('blogger');
    expect(copy.chooseEvent('treat')).toBe(true);
    copy.advance(DAY + 10);
    expect(copy.reports[0].events?.length).toBeGreaterThan(0);
    expect(copy.cafe.today.events?.some((l) => l.includes('блогер'))).toBe(true);
  });
});
