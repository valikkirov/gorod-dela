import { describe, expect, it } from 'vitest';
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';
import { BIG_PARK, PARK_LOOP } from '../src/sim/world';

/** Точка лежит на дорожке большого сквера (клетки рядов и столбцов) */
function onPath(p: { x: number; y: number }): boolean {
  const pad = 12;
  return (
    BIG_PARK.rows.some((r) => p.y >= r.y - pad && p.y <= r.y + 40 + pad && p.x >= r.x0 - pad && p.x <= r.x1 + 40 + pad) ||
    BIG_PARK.cols.some((c) => p.x >= c.x - pad && p.x <= c.x + 40 + pad && p.y >= c.y0 - pad && p.y <= c.y1 + 40 + pad)
  );
}

describe('Большой сквер', () => {
  it('днём там гуляют, и все стоят и ходят по дорожкам', () => {
    const sim = new Simulation(3);
    // Суббота: гуляют почти все
    sim.advance(5 * MINUTES_PER_DAY + hm(8));
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      sim.advance(10);
      const here = sim.residents.filter((r) => r.placeId === 'bigpark' && r.visible);
      seen = Math.max(seen, here.length);
      for (const r of here) if (!r.walking) expect(onPath(r.pos)).toBe(true);
    }
    expect(seen).toBeGreaterThan(8);
  });

  it('гуляющие не стоят на месте: ходят по кольцу', () => {
    const sim = new Simulation(3);
    sim.advance(5 * MINUTES_PER_DAY + hm(14));
    const here = sim.residents.filter((r) => r.placeId === 'bigpark' && !r.walking);
    const before = here.map((r) => ({ ...r.pos }));
    sim.advance(40);
    const moved = here.filter((r, i) => r.placeId === 'bigpark' && (r.pos.x !== before[i].x || r.pos.y !== before[i].y));
    expect(moved.length).toBeGreaterThan(0);
    expect(PARK_LOOP.length).toBeGreaterThan(8);
  });

  it('сохранение не сбивает прогулки', () => {
    const a = new Simulation(5);
    a.advance(5 * MINUTES_PER_DAY + hm(12));
    const b = Simulation.restore(JSON.parse(JSON.stringify(a.serialize())))!;
    a.advance(120);
    b.advance(120);
    expect(b.residents.map((r) => r.pos)).toEqual(a.residents.map((r) => r.pos));
  });
});
