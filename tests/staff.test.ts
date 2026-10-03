import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { ECONOMY } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;
const ALL = [true, true, true, true, true, true, true];

describe('График бариста', () => {
  it('почасовой работает только в окне графика и каждый день сам', () => {
    const sim = new Simulation(1);
    sim.openCafe(); // 08:00–20:00
    sim.hireBarista('hourly');
    const id = sim.cafe.staff[0].id;
    sim.setStaffSchedule(id, { days: ALL, from: hm(8), to: hm(11) });
    sim.advance(DAY * 3);
    for (const r of sim.reports) expect(r.wages).toBe(3 * ECONOMY.baristaWagePerHour);
    // Загрузка по часам видит бариста только утром
    const staff = sim.reports[1].staffHour!;
    expect(staff[9]).toBeGreaterThan(0);
    expect(staff[14]).toBe(0);
  });

  it('в выходной по графику не выходит и не получает', () => {
    const sim = new Simulation(1); // день 1 — понедельник
    sim.openCafe();
    sim.hireBarista('shift');
    const id = sim.cafe.staff[0].id;
    // Только будни
    sim.setStaffSchedule(id, { days: [true, true, true, true, true, false, false], from: hm(8), to: hm(20) });
    sim.advance(DAY * 7);
    const wages = sim.reports.map((r) => r.wages);
    expect(wages.slice(0, 5)).toEqual(new Array(5).fill(ECONOMY.shiftWage));
    expect(wages.slice(5)).toEqual([0, 0]);
  });

  it('разовый вызов действует только сегодня, график остаётся', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.hireBarista('hourly');
    const id = sim.cafe.staff[0].id;
    sim.setStaffSchedule(id, { days: ALL, from: hm(8), to: hm(10) });
    sim.advance(hm(6)); // 12:00
    sim.setOnDuty(id, true); // вызвали на обед до конца дня
    sim.advance(DAY - hm(6) + DAY);
    const [today, tomorrow] = sim.reports;
    // 08–10 по графику + 12–20 вызван = 10 часов (±1 минута на границе)
    expect(Math.abs(today.wages - 10 * ECONOMY.baristaWagePerHour)).toBeLessThanOrEqual(5);
    expect(tomorrow.wages).toBe(2 * ECONOMY.baristaWagePerHour);
  });

  it('окно через полночь относится ко вчерашнему дню графика', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(18), hm(26)); // до 02:00
    sim.hireBarista('hourly');
    const id = sim.cafe.staff[0].id;
    // Только понедельник, 20:00–02:00
    sim.setStaffSchedule(id, { days: [true, false, false, false, false, false, false], from: hm(20), to: hm(26) });
    sim.advance(DAY * 2);
    const rate = ECONOMY.baristaWagePerHour;
    const night = rate * (1 + ECONOMY.nightBonus);
    // Пн: 20–22 обычные, 22–24 ночные; Вт: 00–02 ночные (хвост понедельника)
    expect(sim.reports[0].wages).toBe(Math.round(2 * rate + 2 * night));
    expect(sim.reports[1].wages).toBe(Math.round(2 * night));
  });

  it('изменение графика попадает в историю изменений', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.hireBarista('hourly');
    const id = sim.cafe.staff[0].id;
    sim.setStaffSchedule(id, { days: [true, true, true, true, true, false, false], from: hm(8), to: hm(11) });
    const c = sim.cafe.today.changes!.find((x) => x.key === `schedule:${id}`)!;
    expect(c.from).toBe('каждый день, 08:00–20:00');
    expect(c.to).toBe('Пн–Пт, 08:00–11:00');
  });

  it('старое сохранение без графика загружается: почасовой работает весь день', () => {
    const sim = new Simulation(2);
    sim.openCafe();
    sim.hireBarista('hourly');
    const data = JSON.parse(JSON.stringify(sim.serialize()));
    for (const b of data.cafe.staff) {
      delete b.schedule;
      delete b.override;
      delete b.shiftActive;
      b.onDuty = true;
    }
    const restored = Simulation.restore(data)!;
    restored.advance(DAY);
    expect(restored.reports[0].wages).toBe(12 * ECONOMY.baristaWagePerHour);
  });
});

describe('Промотка', () => {
  it('до утра — до 6:00 следующего дня с отчётом за прошедший', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.advance(hm(10)); // 16:00
    sim.skipToMorning();
    expect(sim.minute).toBeCloseTo(hm(6), 0);
    expect(sim.reports.length).toBe(1);
    sim.skipToMorning();
    expect(sim.reports.length).toBe(2);
  });
});
