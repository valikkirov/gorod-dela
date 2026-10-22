import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { ECONOMY } from '../src/sim/economy';
import { Simulation } from '../src/sim/simulation';

const DAY = MINUTES_PER_DAY;

/** Открыть кафе так, будто о нём уже знает вся улица — для тестов экономики */
/** Классическое кафе для проверок: с плитой и бизнес-ланчем, как до оборудования */
function withLunch(sim: Simulation): void {
  if (sim.cafe.premisesId !== 'cafe') return;
  sim.cafe.equipment.push('stove');
  sim.cafe.removeItem('latte');
  sim.cafe.addItem('lunch');
}

function openKnown(sim: Simulation): void {
  sim.openCafe();
  withLunch(sim);
  for (const r of sim.residents) r.aware = true;
}

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
    for (const r of sim.residents) r.aware = true;
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
    openKnown(sim);
    for (const m of sim.cafe.menu) sim.setPrice(m.id, m.price * 3);
    sim.advance(DAY);
    const r = sim.reports[0];
    expect(r.guests).toBeLessThanOrEqual(2);
    expect(r.missed.expensive).toBeGreaterThan(30);
  });

  it('открыться раньше — поймать утренний поток', () => {
    const late = new Simulation(1);
    const early = new Simulation(1);
    openKnown(late);
    openKnown(early);
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
    openKnown(sim);
    sim.setHours(hm(8), hm(26));
    sim.removeMenuItem('tea');
    sim.cafe.equipment.push('tap');
    sim.addMenuItem('beer');
    sim.addMenuItem('cider');
    sim.setKeep('bar', 30);
    sim.orderIngredient('bar', 30); // привезут утром второго дня
    sim.advance(DAY * 2);
    const bar = (sim.reports[1].sold.beer ?? 0) + (sim.reports[1].sold.cider ?? 0);
    expect(bar).toBeGreaterThanOrEqual(2);
  });

  it('без бара ночной спрос виден как «нет нужного в меню»', () => {
    const sim = new Simulation(1);
    openKnown(sim);
    sim.setHours(hm(8), hm(26));
    sim.advance(DAY);
    expect(sim.reports[0].missingKinds.bar ?? 0).toBeGreaterThan(3);
  });

  it('меню: до 8 позиций, хотя бы одна', () => {
    const sim = new Simulation(1);
    sim.cafe.equipment.push('stove', 'tap');
    for (const id of ['raf', 'sandwich', 'soup', 'beer']) sim.addMenuItem(id);
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
    openKnown(sim);
    sim.advance(DAY);
    const decided = sim.residents.filter((r) => r.decision);
    expect(decided.length).toBeGreaterThan(30);
    for (const r of decided) {
      expect(r.decision!.visited || r.decision!.reason).toBeTruthy();
    }
  });

  it('в выходные офисы пустые — бизнес-ланчи не продаются, зато гуляют', () => {
    const sim = new Simulation(1);
    openKnown(sim);
    sim.advance(DAY * 6); // до субботы
    const fri = sim.reports[4];
    const sat = sim.reports[5];
    expect(fri.weekday).toBe(4);
    expect(sat.weekday).toBe(5);
    expect(fri.sold.lunch ?? 0).toBeGreaterThan(2);
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

  it('заказ приезжает в 6:00 и оплачивается при доставке, оптом дешевле', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const cash = sim.cash;
    sim.orderIngredient('beans', 300);
    sim.advance(hm(23)); // до 05:00 следующего дня — ещё не привезли
    expect(sim.cafe.stock.pending.beans).toBe(300);
    sim.advance(hm(1, 30));
    expect(sim.cafe.stock.pending.beans ?? 0).toBe(0);
    expect(sim.reports[1] ?? sim.cafe.today).toBeTruthy();
    expect(sim.cafe.today.purchases).toBeGreaterThanOrEqual(Math.round(300 * 30 * 0.8));
    expect(sim.cash).toBeLessThan(cash);
  });

  it('выпечка живёт один день — непроданное списывается', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    sim.orderIngredient('bakery', 200);
    sim.advance(DAY * 2);
    expect(sim.reports[1].writtenOff).toBeGreaterThan(0);
    expect(sim.reports[1].writtenOffItems.bakery ?? 0).toBeGreaterThan(100);
  });

  it('кончились продукты — гости уходят с причиной «нет в наличии»', () => {
    const sim = new Simulation(1);
    openKnown(sim);
    for (const k of ['beans', 'milk', 'bakery', 'kitchen', 'drinks'] as const) sim.setKeep(k, 0);
    sim.advance(DAY * 5); // стартовый запас кончается к пятнице
    const fri = sim.reports[4];
    expect(fri.missed['out-of-stock'] ?? 0).toBeGreaterThan(10);
    expect(fri.guests).toBeLessThan(sim.reports[0].guests);
  });

  it('после открытия о кафе знают не все — незнающие не заходят', () => {
    const sim = new Simulation(1);
    sim.openCafe();
    const aware = sim.awareCount;
    expect(aware).toBeGreaterThan(10);
    expect(aware).toBeLessThan(sim.residents.length / 2);
    sim.advance(DAY);
    expect(sim.reports[0].missed.unaware ?? 0).toBeGreaterThan(10);
  });

  it('вывеска, листовки и соцсети ускоряют узнаваемость и стоят денег', () => {
    const plain = new Simulation(1);
    const promo = new Simulation(1);
    plain.openCafe();
    promo.openCafe();
    promo.buySign();
    promo.setFlyers(true);
    promo.launchSocial();
    plain.advance(DAY * 3);
    promo.advance(DAY * 3);
    expect(promo.awareCount).toBeGreaterThan(plain.awareCount + 15);
    expect(promo.reports[0].marketing).toBe(20_000 + 10_000 + 1_500);
    expect(promo.reports[1].newAware.social ?? 0).toBeGreaterThan(0);
  });

  it('счастливые часы снижают цену в выбранное время', () => {
    const sim = new Simulation(1);
    sim.setHappyHours({ from: hm(15), to: hm(17), discount: 0.2 });
    expect(sim.marketing.priceAt(200, hm(16))).toBe(160);
    expect(sim.marketing.priceAt(200, hm(18))).toBe(200);
  });

  it('карта лояльности: каждый 6-й кофе бесплатно', () => {
    const sim = new Simulation(1);
    openKnown(sim);
    sim.setHours(hm(7), hm(20));
    sim.setLoyaltyCard(true);
    sim.advance(DAY * 14);
    const given = sim.reports.reduce((a, r) => a + r.giveaways, 0);
    expect(given).toBeGreaterThan(0);
  });

  it('сохранение: игра после загрузки идёт так же, как без перерыва', () => {
    const a = new Simulation(5);
    a.openCafe();
    a.hireBarista('hourly');
    a.buySign();
    a.orderIngredient('bar', 40);
    a.advance(DAY * 2 + hm(3, 17));
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = Simulation.restore(saved)!;
    expect(b).not.toBeNull();
    a.advance(DAY * 2);
    b.advance(DAY * 2);
    expect(b.cash).toBe(a.cash);
    expect(b.reports.map((r) => r.profit)).toEqual(a.reports.map((r) => r.profit));
    expect(b.residents.map((r) => r.pos)).toEqual(a.residents.map((r) => r.pos));
  });

  it('сохранение старой версии не загружается', () => {
    const save = new Simulation(1).serialize();
    expect(Simulation.restore({ ...save, version: -1 })).toBeNull();
  });
});

describe('Сохранение до Садовой', () => {
  it('старое сохранение без жителей Садовой загружается, жители встают на новую карту', async () => {
    const { Simulation } = await import('../src/sim/simulation');
    const sim = new Simulation(7);
    sim.advance(60 * 9);
    const d = sim.serialize();
    // Как сохранение до Садовой: нет поля map и нет последних 31 жителя
    delete d.map;
    d.residents = d.residents.slice(0, d.residents.length - 31);
    const back = Simulation.restore(JSON.parse(JSON.stringify(d)));
    expect(back).not.toBeNull();
    back!.advance(60 * 3);
    expect(back!.residents.every((r) => Number.isFinite(r.pos.x) && Number.isFinite(r.pos.y))).toBe(true);
  });
});
