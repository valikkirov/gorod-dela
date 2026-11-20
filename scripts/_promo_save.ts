// Временный: сохранения для скриншотов площадки
import { writeFileSync } from 'node:fs';
import { runWithSim, STRATEGIES } from './strategies';
import { City } from '../src/sim/city';
import { FIRST_STEPS } from '../src/sim/firstSteps';
const [strat, seed, days, hour, out] = process.argv.slice(2);
const { sim } = runWithSim({ ...STRATEGIES.find((s) => s.id === strat)!, preset: 'premium' }, Number(seed), Number(days));
sim.advance(Math.round(Number(hour) * 60));
for (const st of FIRST_STEPS) (sim.steps as Record<string, number>)[st.id] ??= sim.today;
console.log(strat, 'cash', sim.cash, 'day', sim.today);
writeFileSync(out, JSON.stringify(new City(sim).serialize()));
