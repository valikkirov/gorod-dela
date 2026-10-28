import { describe, expect, it } from 'vitest';
import { hm } from '../src/sim/clock';
import { cashDiagnosis, paymentLeft } from '../src/sim/loans';
import { Simulation } from '../src/sim/simulation';
import { daysText, menuAddWarning, orderWarning, priceWarning, staffWarnings } from '../src/sim/warnings';

function opened(): Simulation {
  const sim = new Simulation(1); // понедельник, 06:00
  sim.openCafe();
  return sim;
}

describe('Предупреждения до решения', () => {
  it('скоропорт, который приедет в закрытую точку, предупреждает о списании', () => {
    const sim = opened();
    // Вт и Ср — выходные: выпечка (1 день) приедет во вторник и испортится
    sim.setDayHours(1, null);
    sim.setDayHours(2, null);
    expect(orderWarning(sim.cafe, 'bakery', hm(10))).toMatch(/во вторник/);
    // Молоко живёт 3 дня: приедет во вторник, в четверг уже открыто — но срок Вт, Ср, Чт включает четверг
    expect(orderWarning(sim.cafe, 'milk', hm(10))).toBeNull();
    // Зерно не портится
    expect(orderWarning(sim.cafe, 'beans', hm(10))).toBeNull();
    // До 6:00 заказ приезжает сегодня (понедельник открыт)
    expect(orderWarning(sim.cafe, 'bakery', hm(5))).toBeNull();
  });

  it('цена не выше себестоимости', () => {
    const sim = opened();
    const latte = sim.cafe.menu.find((m) => m.id === 'latte')!;
    expect(priceWarning(latte)).toBeNull();
    sim.setPrice('latte', latte.cost - 10);
    expect(priceWarning(sim.cafe.menu.find((m) => m.id === 'latte')!)).toMatch(/минус/);
  });

  it('позиция без запаса и без автозаказа', () => {
    const sim = opened();
    sim.buyEquipment('tap');
    // Пиво и сидр по умолчанию не держим
    expect(menuAddWarning(sim.cafe, 'beer')).toMatch(/пиво и сидр/);
    sim.setKeep('bar', 20);
    expect(menuAddWarning(sim.cafe, 'beer')).toBeNull();
    expect(menuAddWarning(sim.cafe, 'americano')).toBeNull();
  });

  it('часы длиннее смены и почасовой вне часов работы', () => {
    const sim = opened();
    sim.setHours(hm(7), hm(23));
    sim.hireBarista('shift');
    expect(staffWarnings(sim.cafe)[0]).toMatch(/каждый день после 19:00/);
    sim.setHours(hm(8), hm(20));
    expect(staffWarnings(sim.cafe)).toEqual([]);
    sim.hireBarista('hourly');
    const b = sim.cafe.staff[1];
    sim.setStaffSchedule(b.id, { days: [true, true, true, true, true, true, true], from: hm(20), to: hm(23) });
    expect(staffWarnings(sim.cafe)[0]).toMatch(/Бариста 2.*не выйдет/);
  });

  it('дни недели одной строкой', () => {
    expect(daysText([0, 1, 2, 3, 4])).toBe('Пн–Пт');
    expect(daysText([5, 6])).toBe('Сб, Вс');
    expect(daysText([0, 2, 3, 4, 6])).toBe('Пн, Ср–Пт, Вс');
  });
});

describe('Кредит против недельной прибыли', () => {
  const day = (profit: number, invested = 0) => ({ opened: true, profit, invested });

  it('точка в плюсе, деньги ушли во вложения — кредит закрывает разрыв', () => {
    const d = cashDiagnosis([...Array(7)].map((_, i) => day(1_000, i === 0 ? 45_000 : 0)));
    expect(d).toMatchObject({ kind: 'profit', weekProfit: 7_000, invested: 45_000 });
    expect(paymentLeft(d, 5_000)).toBe(2_000);
    expect(paymentLeft(d, 9_000)).toBe(-2_000);
  });

  it('точка сама в минусе — это видно до кредита', () => {
    expect(cashDiagnosis([...Array(7)].map(() => day(-500))).kind).toBe('loss');
    expect(cashDiagnosis([day(500), day(500)]).kind).toBe('early');
    // Неполная неделя пересчитывается на семь дней
    const d = cashDiagnosis([...Array(4)].map(() => day(1_000)));
    expect(paymentLeft(d, 0)).toBe(7_000);
  });
});
