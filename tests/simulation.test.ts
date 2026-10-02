import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { ECONOMY } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

describe('Город', () => {
  it('детерминирован: один seed — один и тот же город', () => {
    const a = new Simulation(42);
    const b = new Simulation(42);
    a.openCafe();
    b.openCafe();
    a.advance(DAY);
    b.advance(DAY);
    expect(a.residents.map((r) => r.pos)).toEqual(b.residents.map((r) => r.pos));
    expect(a.cash).toBe(b.cash);
  });

  it('ночью большинство спит, но улица живёт: молодёжь и ночная смена', () => {
    const sim = new Simulation(1, hm(23, 0));
    sim.advance(hm(1, 30)); // до 00:30
    const out = sim.residents.filter((r) => r.placeId !== r.homeId);
    expect(out.length).toBeGreaterThan(5);
    expect(out.every((r) => r.kind === 'youth' || r.kind === 'nightworker' || r.kind === 'student')).toBe(true);
  });

  it('днём офисные сотрудники доходят до работы', () => {
    const sim = new Simulation(1);
    sim.advance(hm(4, 30)); // 06:00 → 10:30
    for (const r of sim.residents.filter((r) => r.kind === 'office')) {
      expect(r.placeId).toBe(r.workId);
    }
  });
});

describe('Кафе', () => {
  it('пока кафе не открыто, спрос всё равно виден в отчёте', () => {
    const sim = new Simulation(1);
    sim.advance(DAY);
    const report = sim.reports[0];
    expect(report.guests).toBe(0);
    expect(report.missed['not-open']).toBeGreaterThan(20);
    expect(sim.cash).toBe(ECONOMY.startCash);
  });

  it('открытие стоит денег, гости приносят выручку', () => {
    const sim = new Simulation(1);
    expect(sim.openCafe()).toBe(true);
    expect(sim.cash).toBe(ECONOMY.startCash - ECONOMY.cafeOpeningCost);
    sim.advance(DAY);
    const r = sim.reports[0];
    expect(r.guests).toBeGreaterThan(10);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.rent).toBe(ECONOMY.rentPerDay);
    expect(r.tax).toBe(Math.round(r.revenue * ECONOMY.taxRate));
    expect(r.cashAfter).toBe(sim.cash);
  });

  it('при завышенных ценах почти никто не заходит — «дорого»', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    for (const m of sim.cafe.menu) sim.setPrice(m.id, m.price * 3);
    sim.advance(DAY);
    const r = sim.reports[0];
    expect(r.guests).toBeLessThanOrEqual(2);
    expect(r.missed.expensive).toBeGreaterThan(30);
  });

  it('открыться раньше — поймать утренний поток', () => {
    const late = new Simulation(1);
    const early = new Simulation(1);
    late.openCafe();
    early.openCafe();
    early.setHours(hm(7, 0), hm(20, 0));
    late.advance(DAY);
    early.advance(DAY);
    expect(early.reports[0].missed.closed ?? 0).toBeLessThan(late.reports[0].missed.closed ?? 0);
    expect(early.reports[0].guests).toBeGreaterThan(late.reports[0].guests);
  });

  it('почасовой бариста получает за каждый отработанный час', () => {
    const sim = new Simulation(1); // старт в 06:00
    sim.openCafe(); // 08:00–20:00 — 12 часов
    sim.hireBarista('hourly');
    sim.advance(DAY);
    expect(sim.reports[0].wages).toBe(12 * ECONOMY.baristaWagePerHour);
  });

  it('почасового можно отпустить — платим только за пик', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.hireBarista('hourly');
    const id = sim.cafe.staff[0].id;
    sim.advance(hm(4)); // 06:00 → 10:00, работал 2 часа
    sim.setOnDuty(id, false);
    sim.advance(DAY - hm(4));
    // ±1 минута на границе отпуска
    expect(Math.abs(sim.reports[0].wages - 2 * ECONOMY.baristaWagePerHour)).toBeLessThanOrEqual(5);
  });

  it('смена — фикс за день, дольше 12 часов бариста не работает', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(7), hm(21)); // 14 часов, без ночных
    sim.hireBarista('shift');
    sim.advance(hm(13, 30)); // 06:00 → 19:30: 12,5 часа с открытия
    expect(sim.cafe.baristas).toBe(0); // смена закончилась в 19:00
    sim.advance(DAY - hm(13, 30));
    expect(sim.reports[0].wages).toBe(ECONOMY.shiftWage);
  });

  it('ночные часы дороже на 20 % — и почасово, и в смену', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(20), hm(24)); // 20:00–00:00: 2 часа обычных + 2 ночных
    sim.hireBarista('hourly');
    sim.advance(DAY);
    const rate = ECONOMY.baristaWagePerHour;
    expect(sim.reports[0].wages).toBe(2 * rate + 2 * rate * (1 + ECONOMY.nightBonus));

    const shift = new Simulation(1);
    shift.openCafe();
    shift.setHours(hm(20), hm(24));
    shift.hireBarista('shift');
    shift.advance(DAY);
    const perHour = ECONOMY.shiftWage / ECONOMY.shiftHours;
    expect(shift.reports[0].wages).toBe(Math.round(ECONOMY.shiftWage + 2 * perHour * ECONOMY.nightBonus));
  });

  it('кафе может работать через полночь и круглосуточно', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(10), hm(26)); // до 02:00
    expect(sim.cafe.isOpenAt(hm(1))).toBe(true);
    expect(sim.cafe.isOpenAt(hm(3))).toBe(false);
    sim.setHours(hm(8), hm(32)); // 24 часа
    expect(sim.cafe.isOpenAt(hm(4))).toBe(true);
  });

  it('ночью молодёжь идёт в бар, если в меню есть пиво или сидр', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(8), hm(26));
    sim.removeMenuItem('tea');
    sim.addMenuItem('beer');
    sim.addMenuItem('cider');
    sim.advance(DAY);
    const bar = (sim.reports[0].sold.beer ?? 0) + (sim.reports[0].sold.cider ?? 0);
    expect(bar).toBeGreaterThan(3);
  });

  it('без бара ночной спрос виден как «нет нужного в меню»', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.setHours(hm(8), hm(26));
    sim.advance(DAY);
    expect(sim.reports[0].missingKinds.bar ?? 0).toBeGreaterThan(3);
  });

  it('меню: до 8 позиций, хотя бы одна', () => {
    const sim = new Simulation(1);
    for (const id of ['latte', 'raf', 'sandwich', 'soup', 'beer']) sim.addMenuItem(id);
    expect(sim.cafe.menu.length).toBe(8);
    expect(sim.addMenuItem('cider')).toBe(false);
    for (const m of [...sim.cafe.menu]) sim.removeMenuItem(m.id);
    expect(sim.cafe.menu.length).toBe(1);
  });

  it('три дня в минусе — банкротство', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.cash = 1_000;
    for (const m of sim.cafe.menu) sim.setPrice(m.id, 5_000);
    sim.advance(DAY * 4);
    expect(sim.bankrupt).toBe(true);
    expect(sim.reports.length).toBe(3);
  });

  it('у каждого жителя видно, почему он зашёл или нет', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.advance(DAY);
    const decided = sim.residents.filter((r) => r.decision);
    expect(decided.length).toBeGreaterThan(30);
    for (const r of decided) {
      expect(r.decision!.visited || r.decision!.reason).toBeTruthy();
    }
  });

  it('в выходные офисы пустые — бизнес-ланчи не продаются, зато гуляют', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.advance(DAY * 6); // до субботы
    const fri = sim.reports[4];
    const sat = sim.reports[5];
    expect(fri.weekday).toBe(4);
    expect(sat.weekday).toBe(5);
    expect(fri.sold.lunch ?? 0).toBeGreaterThan(5);
    expect(sat.sold.lunch ?? 0).toBeLessThan(fri.sold.lunch ?? 0);
  });

  it('погода детерминирована и есть прогноз на завтра', () => {
    const a = new Simulation(3);
    const b = new Simulation(3);
    a.advance(DAY * 3);
    b.advance(DAY * 3);
    expect(a.reports.map((r) => r.weather)).toEqual(b.reports.map((r) => r.weather));
    expect(a.reports[0].forecast).toEqual(a.reports[1].weather);
  });
});

