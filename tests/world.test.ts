import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/simulation';
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

  it('выход метро на Садовую пока закрыт, у сквера два входа; входы стоят на тротуарах', () => {
    expect(entrancesOf(PLACES.find((p) => p.id === 'metro')!)).toHaveLength(1);
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

describe('Южная сторона Садовой', () => {
  const south = PLACES.filter((p) => p.territoryId === 'street-2' && p.rect.y >= SADOVAYA.bottom);
  const inside = (p: Point, r: { x: number; y: number; w: number; h: number }): boolean =>
    p.x > r.x + 2 && p.x < r.x + r.w - 2 && p.y > r.y + 2 && p.y < r.y + r.h - 2;

  it('дома стоят крышей к тротуару, двери на фасаде со двора, на сетке 40', () => {
    expect(south.length).toBe(5);
    for (const p of south) {
      expect(p.rect.y).toBe(1240);
      expect(p.door.y).toBeGreaterThan(p.rect.y + p.rect.h);
      expect((p.rect.x - 20) % 40, p.id).toBe(0);
    }
  });

  it('путь от тротуара к двери идёт проходом между домами, не через здания', () => {
    for (const p of south) {
      const [e] = entrancesOf(p);
      const pts = [e.front, ...(e.via ?? []), e.door];
      expect(e.via?.length).toBeGreaterThan(0);
      for (let i = 1; i < pts.length; i++) {
        for (let t = 0; t <= 1; t += 0.05) {
          const q = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
          for (const b of PLACES.filter((x) => x.indoor)) expect(inside(q, b.rect), `${p.id} через ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('жители южных домов за день ни разу не проходят сквозь здания', () => {
    const sim = new Simulation(7);
    const homes = new Set(['home-6', 'home-7']);
    let seen = 0;
    for (let m = 0; m < 1440; m += 1) {
      sim.advance(1);
      for (const r of sim.residents) {
        if (!r.walking) continue;
        if (homes.has(r.homeId)) seen++;
        for (const b of south) expect(inside(r.pos, b.rect), `${r.id} в ${b.id}`).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 60_000);
});
