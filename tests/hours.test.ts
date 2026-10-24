import { describe, expect, it } from 'vitest';
import { analyzeDay } from '../src/sim/analysis';
import { weekHoursText } from '../src/sim/cafe';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

describe('Часы работы по дням недели', () => {
  it('в выходной закрыто весь день, хвост ночи с вечера накануне остаётся', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    // День 1 — понедельник. Пн работаем до 02:00, Вт — выходной.
    sim.setDayHours(0, { openAt: hm(10), closeAt: hm(26) });
    sim.setDayHours(1, null);
    expect(sim.cafe.isOpenAt(hm(12))).toBe(true);
    sim.advance(DAY); // вторник
    expect(sim.cafe.dayOff).toBe(true);
    expect(sim.cafe.isOpenAt(hm(1))).toBe(true); // ночь понедельника
    expect(sim.cafe.isOpenAt(hm(3))).toBe(false);
    expect(sim.cafe.isOpenAt(hm(12))).toBe(false);
    expect(sim.cafe.nextOpening(hm(12))).toEqual({ inDays: 1, at: hm(8) });
  });

  it('нельзя закрыться на всю неделю; изменения пишутся одной строкой', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    sim.setHours(hm(8), hm(20));
    for (let d = 0; d < 7; d++) sim.setDayHours(d, null);
    expect(sim.cafe.week.filter(Boolean)).toHaveLength(1);
    sim.setHours(hm(8), hm(20));
    sim.setDayHours(5, { openAt: hm(10), closeAt: hm(22) });
    sim.setDayHours(6, { openAt: hm(10), closeAt: hm(22) });
    expect(weekHoursText(sim.cafe.week)).toBe('Пн–Пт 08:00–20:00, Сб, Вс 10:00–22:00');
    expect(sim.cafe.sameEveryDay).toBe(false);
  });

  it('выходной: без гостей и поставки, коммуналка только базовая, отчёт про выходной', () => {
    const sim = new Simulation(4);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    sim.setDayHours(2, null); // среда — выходной
    sim.advance(4 * DAY + hm(1)); // утро четверга
    const tue = sim.reports.find((r) => r.day === 2)!;
    const wed = sim.reports.find((r) => r.day === 3)!;
    expect(wed.dayOff).toBe(true);
    expect(wed.guests).toBe(0);
    expect(wed.revenue).toBe(0);
    expect(wed.utilities).toBeLessThan(tue.utilities);
    // Заказ на среду не делали — закупка в среду только та, что уже ехала
    expect(wed.purchases).toBe(0);
    const a = analyzeDay(sim.reports, wed);
    expect(a.compare).toMatch(/Выходной/);
    // В четверг сравнение идёт не с выходным
    const thu = analyzeDay(sim.reports, sim.reports.find((r) => r.day === 4)!);
    expect(thu.comparison?.report.dayOff).toBeFalsy();
  }, 30_000);

  it('часы по дням сохраняются; старые сохранения получают одинаковые часы', () => {
    const sim = new Simulation(5);
    sim.openCafe();
    sim.setDayHours(6, null);
    sim.setDayHours(4, { openAt: hm(9), closeAt: hm(25) });
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const back = Simulation.restore(save)!;
    expect(back.cafe.week).toEqual(sim.cafe.week);
    delete save.cafe.week;
    save.cafe.openAt = hm(7);
    save.cafe.closeAt = hm(21);
    const old = Simulation.restore(save)!;
    expect(old.cafe.week.every((h) => h?.openAt === hm(7) && h.closeAt === hm(21))).toBe(true);
  });
});
