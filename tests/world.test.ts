import { describe, expect, it } from 'vitest';
import { entrancesOf, PLACES, ROAD, SADOVAYA, walkPath, WALKWAYS, type Point } from '../src/sim/world';

const onWalkway = (p: Point): boolean =>
  WALKWAYS.some((w) => {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / (dx * dx + dy * dy);
    if (t < -1e-6 || t > 1 + 1e-6) return false;
    return Math.hypot(w.a.x + dx * t - p.x, w.a.y + dy * t - p.y) < 0.5;
  });

/** Отрезок пути идёт по проезжей части не по переходу */
const crossesRoadOutsideCrosswalk = (a: Point, b: Point): boolean => {
  const seg = WALKWAYS.find((w) => {
    const has = (p: Point) => onWalkway(p);
    return has(a) && has(b) && w.cross;
  });
  if (seg) return false;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const onKlenovaya = mid.x > ROAD.left && mid.x < ROAD.right && mid.y > 112 && mid.y < ROAD.bottom;
  const onSadovaya = mid.y > SADOVAYA.top && mid.y < SADOVAYA.bottom;
  return onKlenovaya || onSadovaya;
};

describe('Карта с Садовой', () => {
  const targets = PLACES.filter((p) => !p.decor);

  it('из любого места можно дойти до любого по тротуарам и переходам', () => {
    for (const from of targets) {
      for (const to of targets) {
        for (const a of entrancesOf(from)) {
          for (const b of entrancesOf(to)) {
            const path = walkPath(a.front, b.front);
            expect(path[0]).toEqual(a.front);
            expect(path[path.length - 1]).toEqual(b.front);
            for (const p of path) expect(onWalkway(p), `${from.id}→${to.id}: ${p.x},${p.y}`).toBe(true);
            for (let i = 1; i < path.length; i++) expect(crossesRoadOutsideCrosswalk(path[i - 1], path[i])).toBe(false);
          }
        }
      }
    }
  });

  it('у метро два выхода, у сквера два входа; входы стоят на тротуарах', () => {
    expect(entrancesOf(PLACES.find((p) => p.id === 'metro')!)).toHaveLength(2);
    expect(entrancesOf(PLACES.find((p) => p.id === 'park')!)).toHaveLength(2);
    for (const p of targets) for (const e of entrancesOf(p)) expect(onWalkway(e.front), p.id).toBe(true);
  });

  it('от дома на Садовой до «Продуктов» — через переход у перекрёстка, а не через дорогу где попало', () => {
    const home = PLACES.find((p) => p.id === 'home-6')!;
    const shop = PLACES.find((p) => p.id === 'shop')!;
    const path = walkPath(home.front, shop.front);
    expect(path.some((p) => p.x === 440 && p.y === 1060)).toBe(true);
  });
});
