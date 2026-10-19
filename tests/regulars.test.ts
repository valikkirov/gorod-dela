import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { newsLine, statusOf, type Regular } from '../src/sim/regulars';
import { Simulation } from '../src/sim/simulation';
import type { Resident } from '../src/sim/residents';

const DAY = MINUTES_PER_DAY;

function openKnown(sim: Simulation, premises: 'cafe' | 'kiosk' = 'cafe'): void {
  sim.openCafe(premises);
  for (const r of sim.residents) r.aware = true;
}

const reg = (history: Regular['history']): Regular => ({ residentId: 0, trait: '', usual: 'coffee', history, status: 'visiting' });
const res = (loyalty: number, aware = true) => ({ aware, loyalty }) as Resident;

describe('Знакомые лица', () => {
  it('шесть разных жителей, одинаковые при одном seed', () => {
    const a = new Simulation(5).regulars.map((g) => g.residentId);
    const b = new Simulation(5).regulars.map((g) => g.residentId);
    expect(a).toHaveLength(6);
    expect(new Set(a).size).toBe(6);
    expect(a).toEqual(b);
  });

  it('статус: не знает, ещё не был, постоянный, пропал с главной причиной', () => {
    expect(statusOf(reg([]), res(0, false), 10).status).toBe('unaware');
    expect(statusOf(reg([]), res(0), 10).status).toBe('new');
    const regular = reg([
      { day: 8, minute: 500, ok: true },
      { day: 9, minute: 500, ok: true },
    ]);
    expect(statusOf(regular, res(0.3), 10).status).toBe('regular');
    expect(statusOf(regular, res(0.1), 10).status).toBe('visiting');
    const lost = reg([
      { day: 1, minute: 500, ok: true },
      { day: 8, minute: 500, ok: false, reason: 'queue' },
      { day: 9, minute: 500, ok: false, reason: 'queue' },
      { day: 10, minute: 500, ok: false, reason: 'expensive' },
      { day: 10, minute: 600, ok: false, reason: 'mood' },
    ]);
    expect(statusOf(lost, res(0.1), 10)).toEqual({ status: 'lost', reason: 'queue' });
    // «Не сегодня» — не повод записывать в пропавшие
    const moody = reg([
      { day: 1, minute: 500, ok: true },
      { day: 9, minute: 500, ok: false, reason: 'mood' },
      { day: 10, minute: 500, ok: false, reason: 'mood' },
    ]);
    expect(statusOf(moody, res(0.1), 10).status).toBe('visiting');
  });

  it('новости согласуются по роду', () => {
    expect(newsLine('Анна Иванова', 'new', 'visiting')).toBe('Анна впервые зашла');
    expect(newsLine('Глеб Иванов', 'visiting', 'lost', 'queue')).toBe('Глеб перестал заходить: очередь');
    expect(newsLine('Глеб Иванов', 'unaware', 'new')).toBeNull();
  });

  it('история пишется по ходу игры, статусы и новости — в отчёте, всё переживает сохранение', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.advance(DAY * 10);
    const withHistory = sim.regulars.filter((g) => g.history.length > 0);
    expect(withHistory.length).toBeGreaterThanOrEqual(3);
    expect(sim.regulars.some((g) => g.history.some((n) => n.ok))).toBe(true);
    expect(sim.reports.some((r) => (r.news?.length ?? 0) > 0)).toBe(true);

    const copy = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(copy.regulars.map((g) => [g.status, g.history.length])).toEqual(sim.regulars.map((g) => [g.status, g.history.length]));
    expect(copy.milestones).toEqual(sim.milestones);
  });
});

describe('Вехи и улучшения', () => {
  it('первая сотня гостей отмечается один раз и открывает кофемашину', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    expect(sim.upgradeState('machine')).toBe('locked');
    expect(sim.buyUpgrade('machine')).toBe(false);
    sim.advance(DAY * 4);
    expect(sim.milestones.hundred).toBeDefined();
    const marked = sim.reports.filter((r) => r.milestones?.includes('hundred'));
    expect(marked).toHaveLength(1);

    const before = sim.cafe.serviceMinutes;
    const cash = sim.cash;
    expect(sim.buyUpgrade('machine')).toBe(true);
    expect(sim.cash).toBe(cash - 60_000);
    expect(sim.cafe.serviceMinutes).toBeCloseTo(before * 0.75);
    expect(sim.upgradeState('machine')).toBe('owned');
    expect(sim.buyUpgrade('machine')).toBe(false);
  });

  it('витрина продлевает срок годности уже лежащего и нового скоропорта', () => {
    const sim = new Simulation(3);
    openKnown(sim);
    sim.milestones['week-plus'] = 1;
    const bakeryToday = sim.cafe.stock.expiringToday('bakery', sim.today);
    expect(bakeryToday).toBeGreaterThan(0);
    expect(sim.buyUpgrade('showcase')).toBe(true);
    expect(sim.cafe.stock.expiringToday('bakery', sim.today)).toBe(0);
    expect(sim.cafe.stock.shelfBonus).toBe(1);
    const copy = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(copy.cafe.stock.shelfBonus).toBe(1);
    expect(copy.cafe.has('showcase')).toBe(true);
  });

});
