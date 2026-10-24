import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { LOAN, totalInterest, weeklyPayment } from '../src/sim/loans';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

describe('Кредит', () => {
  it('частник даёт сразу, банк — после недели работы', () => {
    const sim = new Simulation(1);
    expect(sim.loanOffer('private').refusal).not.toBeNull(); // точка не открыта
    sim.openCafe();
    expect(sim.loanOffer('private')).toMatchObject({ refusal: null, max: LOAN.privateMax });
    expect(sim.loanOffer('bank').refusal).toMatch(/истори/);
    sim.advance(8 * DAY);
    const bank = sim.loanOffer('bank');
    if (bank.refusal === null) expect(bank.max).toBeGreaterThanOrEqual(LOAN.bankBase);
    else expect(bank.refusal).toMatch(/убытке/);
  });

  it('деньги сразу в кассу, один кредит за раз, платёж через неделю: проценты — в итог дня, долг — нет', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    const cash = sim.cash;
    expect(sim.takeLoan('private', 30_000)).toBe(true);
    expect(sim.cash).toBe(cash + 30_000);
    expect(sim.takeLoan('private', 10_000)).toBe(false); // второй — нельзя
    const pay = weeklyPayment({ source: 'private', amount: 30_000 });
    sim.advance(8 * DAY);
    const paidDay = sim.reports.find((r) => r.interest);
    expect(paidDay?.interest).toBe(pay.interest);
    expect(paidDay?.loanPaid).toBe(pay.principal);
    expect(sim.loan?.left).toBe(30_000 - pay.principal);
    // Итог дня считает проценты, но не возврат долга
    const r = paidDay!;
    expect(r.profit).toBe(r.revenue - r.purchases - r.rent - r.utilities - r.wages - r.tax - r.marketing - (r.other ?? 0) - r.interest!);
  });

  it('за весь срок переплата равна процентам, после погашения — пауза перед новым', () => {
    const sim = new Simulation(3);
    sim.openCafe();
    sim.takeLoan('private', 20_000);
    sim.advance(22 * DAY);
    expect(sim.loan).toBeNull();
    const interest = sim.reports.reduce((s, r) => s + (r.interest ?? 0), 0);
    expect(interest).toBe(totalInterest('private', 20_000));
    expect(sim.loanOffer('private').refusal).toMatch(/через/);
    sim.advance(LOAN.cooldownDays * DAY);
    expect(sim.loanOffer('private').refusal).toBeNull();
  }, 60_000);

  it('досрочное погашение и сохранение', () => {
    const sim = new Simulation(4);
    sim.openCafe();
    sim.takeLoan('private', 15_000);
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.loan).toEqual(sim.loan);
    const cash = back.cash;
    expect(back.repayLoan()).toBe(true);
    expect(back.cash).toBe(cash - 15_000);
    expect(back.loan).toBeNull();
  });

  it('частник выручает не больше двух раз за игру', () => {
    const sim = new Simulation(5);
    sim.openCafe();
    for (let i = 0; i < LOAN.privateTimes; i++) {
      expect(sim.takeLoan('private', 5_000)).toBe(true);
      expect(sim.repayLoan()).toBe(true);
      sim.advance(LOAN.cooldownDays * DAY);
    }
    expect(sim.loanOffer('private').refusal).toMatch(/больше не/);
  });

  it('пустая касса в день платежа — просрочка и штраф к долгу', () => {
    const sim = new Simulation(6);
    sim.openCafe();
    sim.takeLoan('private', 40_000);
    sim.advance(7 * DAY + 600); // день платежа, 16:00
    sim.cash = -30_000;
    sim.advance(DAY);
    expect(sim.loan?.late).toBe(1);
    expect(sim.reports.some((r) => (r.loanFine ?? 0) > 0)).toBe(true);
    expect(sim.loanHistory.late).toBe(1);
  });

  it('безнадёжная точка на кредитах не живёт: три бариста на смену в пустой день — банкротство всё равно наступает', () => {
    const sim = new Simulation(7);
    sim.openCafe();
    for (let i = 0; i < 3; i++) sim.hireBarista('shift');
    let day = 0;
    for (; day < 120 && !sim.bankrupt; day++) {
      // Каждый раз, когда можно, берём максимум — у банка или у частника
      for (const src of ['bank', 'private'] as const) {
        const o = sim.loanOffer(src);
        if (!o.refusal && o.max > 0) {
          sim.takeLoan(src, o.max);
          break;
        }
      }
      sim.advance(DAY);
    }
    expect(sim.bankrupt).toBe(true);
    expect(day).toBeLessThan(120);
  }, 120_000);
});
