import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';
import { windFor } from '../src/sim/weather';

const DAY = MINUTES_PER_DAY;

describe('Ветер', () => {
  it('ветер зависит только от seed и дня, в дождь ветрено чаще', () => {
    expect(windFor(3, 10, 'rain')).toBe(windFor(3, 10, 'rain'));
    const count = (kind: 'rain' | 'sunny') => Array.from({ length: 400 }, (_, d) => windFor(7, d + 1, kind)).filter((w) => w === 2).length;
    expect(count('rain')).toBeGreaterThan(count('sunny'));
    const sim = new Simulation(9);
    sim.advance(3 * DAY);
    expect(sim.weather.wind).toBe(windFor(9, sim.today, sim.weather.kind));
  });
});
