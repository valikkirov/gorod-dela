import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY, weekday } from '../src/sim/clock';
import { card, EVENTS } from '../src/sim/events';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

/** Кафе с бизнес-ланчем, все знают, открыто 8–20 */
function openKnown(seed = 4): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  sim.setHours(hm(8), hm(20));
  sim.cafe.equipment.push('stove');
  sim.cafe.removeItem('latte');
  sim.cafe.addItem('lunch');
  for (const r of sim.residents) r.aware = true;
  return sim;
}

function start(sim: Simulation, id: string): void {
  const e = sim.eligibleEvents().find((x) => x.id === id);
  if (!e) throw new Error(`Событие ${id} сейчас невозможно`);
  sim.startEvent(e);
}

/** До следующего будня (Пн–Чт), 6:00 — тогда возможны заказы офиса */
function toOfficeMorning(sim: Simulation): void {
  do sim.advance(DAY);
  while (weekday(sim.today) > 3);
}

/** Жить по часу; случайные события — по умолчанию, чтобы не мешали. Стоп — когда «Север» предлагает продлить */
function liveUntilRenew(sim: Simulation, days: number): void {
  for (let h = 0; h < days * 24; h++) {
    sim.advance(60);
    const e = sim.pendingEvent;
    if (e?.id === 'contract-renew') return;
    if (e) sim.chooseEvent(card(e).fallback);
  }
}

/** Выполнить разовый заказ офиса: после него «Север» может предложить договор */
function doOfficeOrder(sim: Simulation): void {
  start(sim, 'office-order');
  sim.chooseEvent('accept');
  sim.advance(DAY);
}

describe('Договор с офисом', () => {
  it('предлагается только после удачного разового заказа', () => {
    const sim = openKnown();
    toOfficeMorning(sim);
    expect(sim.eligibleEvents().some((e) => e.id === 'contract')).toBe(false);
    doOfficeOrder(sim);
    toOfficeMorning(sim);
    expect(sim.eligibleEvents().some((e) => e.id === 'contract')).toBe(true);
  }, 60_000);

  it('каждый будний день платят к 11:00, в выходные заказов нет; без срывов — предлагают продлить на больше порций', () => {
    const sim = openKnown();
    doOfficeOrder(sim);
    toOfficeMorning(sim);
    start(sim, 'contract');
    const offer = sim.pendingEvent!;
    sim.chooseEvent('sign');
    expect(sim.contract?.left).toBe(EVENTS.contract.weekdays);
    // Не дольше трёх недель: 10 будних заказов
    liveUntilRenew(sim, 21);
    const done = sim.reports.flatMap((r) => r.events ?? []).filter((l) => l.includes('по договору'));
    expect(done.length).toBe(EVENTS.contract.weekdays);
    // Ни одного заказа в субботу и воскресенье
    for (const r of sim.reports) if ((r.weekday ?? 0) >= 5) expect((r.events ?? []).some((l) => l.includes('по договору'))).toBe(false);
    expect(sim.contract).toBeNull();
    const renew = sim.pendingEvent!;
    expect(renew.id).toBe('contract-renew');
    expect(renew.qty).toBe(offer.qty! + EVENTS.contract.grow);
    sim.chooseEvent('renew');
    expect(sim.contract?.qty).toBe(offer.qty! + EVENTS.contract.grow);
  }, 120_000);

  it('в 11:00 закрыто — заказ сорван, второй срыв расторгает договор и офис месяц не обращается', () => {
    const sim = openKnown();
    doOfficeOrder(sim);
    toOfficeMorning(sim);
    start(sim, 'contract');
    sim.chooseEvent('sign');
    // Открываемся только в 12:00 — к 11:00 закрыто
    sim.setHours(hm(12), hm(20));
    let cash = sim.cash;
    toOfficeMorning(sim);
    sim.advance(hm(5) + 1); // 11:01
    expect(sim.contract?.strikes).toBe(1);
    expect(sim.cafe.today.events?.some((l) => l.includes('сорван'))).toBe(true);
    // Продукты куплены, денег за заказ нет
    expect(sim.cash).toBeLessThan(cash);
    cash = sim.cash;
    sim.advance(DAY - hm(5) - 1);
    while (weekday(sim.today) > 4) sim.advance(DAY);
    sim.advance(hm(5) + 1);
    expect(sim.contract).toBeNull();
    expect(sim.cafe.today.events?.some((l) => l.includes('расторг'))).toBe(true);
    sim.advance(DAY - hm(5) - 1);
    toOfficeMorning(sim);
    expect(sim.eligibleEvents().some((e) => e.id === 'contract')).toBe(false);
  }, 60_000);

  it('договор переживает сохранение', () => {
    const sim = openKnown();
    doOfficeOrder(sim);
    toOfficeMorning(sim);
    start(sim, 'contract');
    sim.chooseEvent('sign');
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.contract).toEqual(sim.contract);
    expect(back.eligibleEvents().some((e) => e.id === 'office-order')).toBe(false);
  }, 60_000);
});
