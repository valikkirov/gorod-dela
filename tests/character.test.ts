import { describe, expect, it } from 'vitest';
import { makeCharacter, rateVisit, tasteMatch, type Character } from '../src/sim/character';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { evaluate } from '../src/sim/demand';
import { CATALOG } from '../src/sim/cafe';
import { Simulation } from '../src/sim/simulation';

const base: Character = { hurry: 0.5, thrift: 0.5, curiosity: 0.5, taste: { sweet: 0, strong: 0, hearty: 0, novel: 0 } };
const item = (id: string) => ({ ...CATALOG.find((c) => c.id === id)! });

describe('Характер и вкус жителя', () => {
  it('у того же seed те же характеры; характер не сдвигает остальной город', () => {
    const a = new Simulation(11);
    const b = new Simulation(11);
    expect(a.residents.map((r) => r.character)).toEqual(b.residents.map((r) => r.character));
    // Разные жители — разные характеры
    const set = new Set(a.residents.map((r) => r.character.hurry.toFixed(3)));
    expect(set.size).toBeGreaterThan(50);
    // Свой генератор: состояние основного не зависит от характеров
    const c = makeCharacter(11, 0, 'office', a.residents[0].favorites);
    expect(c).toEqual(a.residents[0].character);
  });

  it('сладкоежке раф по вкусу, американо — нет', () => {
    const sweet = { ...base, taste: { sweet: 0.9, strong: -0.6, hearty: 0, novel: 0.2 } };
    expect(tasteMatch(sweet, 'raf')).toBeGreaterThan(0.3);
    expect(tasteMatch(sweet, 'americano')).toBeLessThan(-0.3);
  });

  it('по вкусу житель выбирает позицию из меню и охотнее заходит', () => {
    const sim = new Simulation(2);
    const r = { ...sim.residents[0], favorites: { ...sim.residents[0].favorites, coffee: 'none' }, budget: { ...sim.residents[0].budget, coffee: 300 }, loyalty: 0 };
    const want = { kind: 'coffee' as const, mode: 'stopover' as const, dwell: 0 };
    const menu = [item('americano'), item('raf')];
    const p = { x: 0, y: 0 };
    const likes = evaluate({ ...r, character: { ...base, taste: { sweet: 0.9, strong: -0.6, hearty: 0, novel: 0.3 } } }, want, menu, p, p, p);
    const hates = evaluate({ ...r, character: { ...base, taste: { sweet: -0.9, strong: 0.8, hearty: 0, novel: -0.3 } } }, want, menu, p, p, p);
    expect(likes.item?.id).toBe('raf');
    expect(hates.item?.id).toBe('americano');
    const onlyRaf = evaluate({ ...r, character: { ...base, taste: { sweet: -0.9, strong: 0.8, hearty: 0, novel: -0.3 } } }, want, [item('raf')], p, p, p);
    expect(onlyRaf.p).toBeLessThan(likes.p);
  });

  it('торопливый не любит крюк, экономный острее реагирует на цену', () => {
    const sim = new Simulation(2);
    const r = { ...sim.residents[0], loyalty: 0 };
    const want = { kind: 'coffee' as const, mode: 'stopover' as const, dwell: 0 };
    const menu = [item('americano')];
    const from = { x: 0, y: 0 };
    const cafe = { x: 300, y: 0 };
    const goal = { x: 0, y: 100 };
    const fast = evaluate({ ...r, character: { ...base, hurry: 1 } }, want, menu, from, cafe, goal);
    const slow = evaluate({ ...r, character: { ...base, hurry: 0 } }, want, menu, from, cafe, goal);
    expect(fast.pRoute).toBeLessThan(slow.pRoute);
    const pricey = [{ ...item('americano'), price: Math.round(r.budget.coffee * 1.1) }];
    const thrifty = evaluate({ ...r, character: { ...base, thrift: 1 } }, want, pricey, from, from, from);
    const loose = evaluate({ ...r, character: { ...base, thrift: 0 } }, want, pricey, from, from, from);
    expect(thrifty.pPrice).toBeLessThan(loose.pPrice);
  });

  it('оценка визита: вкусно и быстро — хорошо; не свой вкус и долгое ожидание — плохо', () => {
    const sweet = { ...base, taste: { sweet: 0.9, strong: -0.6, hearty: 0, novel: 0.2 } };
    const good = rateVisit(sweet, 'raf', 200, 260, 2, false);
    const bad = rateVisit({ ...sweet, hurry: 1 }, 'americano', 200, 180, 20, false);
    expect(good.score).toBeGreaterThan(0.3);
    expect(good.notes).toContain('tasty');
    expect(bad.score).toBeLessThan(-0.2);
    expect(bad.notes).toEqual(expect.arrayContaining(['not-my-taste', 'long-wait', 'pricey']));
  });

  it('гости запоминают визиты, память переживает сохранение', () => {
    const sim = new Simulation(4);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    sim.advance(3 * MINUTES_PER_DAY);
    const remembered = sim.residents.filter((r) => r.memory.length > 0);
    expect(remembered.length).toBeGreaterThan(10);
    expect(remembered.every((r) => r.memory.length <= 5)).toBe(true);
    const back = Simulation.restore(JSON.parse(JSON.stringify(sim.serialize())))!;
    expect(back.residents.map((r) => r.memory)).toEqual(sim.residents.map((r) => r.memory));
    expect(back.residents.map((r) => r.character)).toEqual(sim.residents.map((r) => r.character));
  }, 60_000);

  it('меню не по вкусу улицы: часть гостей отказывается — «не его вкус»', () => {
    const sim = new Simulation(4);
    sim.openCafe();
    for (const r of sim.residents) r.aware = true;
    // Только американо: сладкоежкам не подходит
    for (const m of [...sim.cafe.menu]) if (m.id !== 'americano') sim.removeMenuItem(m.id);
    sim.advance(2 * MINUTES_PER_DAY);
    const taste = sim.reports.reduce((s, d) => s + (d.missed.taste ?? 0), 0);
    expect(taste).toBeGreaterThan(0);
  }, 60_000);
});
