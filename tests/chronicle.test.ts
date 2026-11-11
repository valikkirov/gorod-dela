import { describe, expect, it } from 'vitest';
import type { DayReport } from '../src/sim/cafe';
import { chronicle, CHRONICLE_STORIES, type ChronicleNames } from '../src/sim/chronicle';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';

const names = (sim: Simulation): ChronicleNames => ({
  district: sim.district,
  cafe: sim.cafe.title,
  rival: sim.rival?.t.name ?? null,
  item: (id) => sim.cafe.menu.find((m) => m.id === id)?.name ?? id,
});

function played(seed: number, days: number): Simulation {
  const sim = new Simulation(seed);
  sim.openCafe('cafe');
  sim.buySign();
  sim.advance(days * MINUTES_PER_DAY);
  return sim;
}

/** Пустой отчёт дня: кафе открыто, ничего не случилось */
function quiet(day: number, patch: Partial<DayReport> = {}): DayReport {
  return {
    day,
    opened: true,
    guests: 10,
    revenue: 2_000,
    cogs: 600,
    purchases: 0,
    writtenOff: 0,
    writtenOffItems: {},
    marketing: 0,
    giveaways: 0,
    newAware: {},
    awareCount: 50,
    rent: 0,
    utilities: 0,
    wages: 0,
    tax: 0,
    profit: 0,
    cashAfter: 0,
    currency: 'RUB',
    wanted: 10,
    missed: {},
    missingKinds: {},
    sold: {},
    ...patch,
  } as DayReport;
}

const NAMES: ChronicleNames = { district: 'klenovaya', cafe: 'Кафе', rival: '«Кофе на бегу»', item: (id) => id };

describe('Хроника района', () => {
  it('выходит только за законченную неделю, не больше четырёх заметок', () => {
    const sim = played(3, 10);
    const c = chronicle(sim.reports, 1, names(sim));
    expect(c).not.toBeNull();
    expect(c!.title).toBe('Новости Кленовой');
    expect(c!.stories.length).toBeGreaterThan(0);
    expect(c!.stories.length).toBeLessThanOrEqual(CHRONICLE_STORIES);
    expect(chronicle(sim.reports, 2, names(sim))).toBeNull();
  }, 60_000);

  it('одинаковая игра — одинаковый выпуск', () => {
    const a = played(5, 7);
    const b = played(5, 7);
    expect(chronicle(a.reports, 1, names(a))).toEqual(chronicle(b.reports, 1, names(b)));
  }, 60_000);

  it('пишет только о том, что было: хит недели — то, чего продано больше всего', () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => quiet(d, { sold: { latte: 5, cappuccino: d === 7 ? 2 : 3 } }));
    const c = chronicle(week, 1, NAMES)!;
    const hit = c.stories.find((s) => s.title.includes('Хит'));
    expect(hit?.title).toContain('latte');
    expect(hit?.text).toContain('35');
  });

  it('очередь, из-за которой ушли, — новость с часом, когда тяжелее всего', () => {
    const lostHour = new Array<number>(24).fill(0);
    lostHour[8] = 3;
    lostHour[13] = 1;
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => quiet(d, { missed: { queue: 4 }, lostHour: { queue: lostHour } }));
    const c = chronicle(week, 1, NAMES)!;
    const q = c.stories.find((s) => s.icon === '⏳');
    expect(q?.text).toContain('28');
    expect(q?.text).toContain('8:00');
  });

  it('тихая неделя без новостей — без отказов, акций и погоды в газете нет лишнего', () => {
    const twoWeeks = Array.from({ length: 14 }, (_, i) => quiet(i + 1));
    const c = chronicle(twoWeeks, 2, NAMES);
    // Ни продаж, ни событий, ни роста известности — выпускать нечего
    expect(c).toBeNull();
  });

  it('акция конкурента попадает в выпуск с числом дней', () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((d) => quiet(d, { rivalPromo: d <= 3, rivalGuests: 20 }));
    const c = chronicle(week, 1, NAMES)!;
    const promo = c.stories.find((s) => s.icon === '🏷️');
    expect(promo?.text.startsWith('3')).toBe(true);
  });
});
