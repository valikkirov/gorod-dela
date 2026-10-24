import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { compareLine, funnel, periodByIndex, periodOf, summarize } from '../src/sim/periods';
import { Simulation } from '../src/sim/simulation';

describe('Отчёты за период', () => {
  it('неделя — 7 дней от первого, месяц — 4 недели', () => {
    expect(periodOf('week', 1)).toMatchObject({ index: 1, from: 1, to: 7 });
    expect(periodOf('week', 8)).toMatchObject({ index: 2, from: 8, to: 14 });
    expect(periodOf('month', 28)).toMatchObject({ index: 1, from: 1, to: 28 });
    expect(periodOf('month', 29)).toMatchObject({ index: 2, from: 29, to: 56 });
  });

  it('итоги недели сходятся с суммой дней, маржа по позициям — из выручки и себестоимости дня', () => {
    const sim = new Simulation(3);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    sim.advance(15 * MINUTES_PER_DAY);
    const priceOf = (id: string) => sim.cafe.menu.find((m) => m.id === id) ?? null;
    const w2 = summarize(sim.reports, periodByIndex('week', 2), priceOf);
    const days = sim.reports.filter((r) => r.day >= 8 && r.day <= 14);
    expect(w2.complete).toBe(true);
    expect(w2.days).toHaveLength(7);
    expect(w2.profit).toBe(days.reduce((s, r) => s + r.profit, 0));
    expect(w2.revenue).toBe(days.reduce((s, r) => s + r.revenue, 0));
    expect(w2.items.length).toBeGreaterThan(0);
    // Выручка по позициям сходится с выручкой дня (без подарков по карте лояльности)
    const byItems = w2.items.reduce((s, i) => s + i.revenue, 0);
    expect(byItems).toBe(w2.revenue);
    expect(w2.items[0].margin).toBeGreaterThanOrEqual(w2.items.at(-1)!.margin);
    // Воронка не растёт к концу
    const f = funnel(w2).map(([, n]) => n);
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeLessThanOrEqual(f[i - 1]);
    // Третья неделя ещё идёт
    const w3 = summarize(sim.reports, periodByIndex('week', 3), priceOf);
    expect(w3.complete).toBe(false);
    expect(compareLine(w3, w2)).toMatch(/ещё идёт/);
    expect(compareLine(w2, summarize(sim.reports, periodByIndex('week', 1), priceOf))).toMatch(/чем на прошлой неделе|Так же/);
  }, 60_000);
});
