// Что сдвигает баланс форматов: множитель цен и параметры экономики.
// npx tsx tools/levers.ts "подпись" rentPerDay=1500,utilitiesPerDay=300
import { ECONOMY } from '../src/sim/economy';
import { FORMATS, play } from './balance';

const E = ECONOMY as unknown as Record<string, number>;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);

/** Средний итог недели 2–3 по трём seed */
function week(f: (typeof FORMATS)[number], mult: number): number {
  const runs = [1, 2, 3].map((s) => play({ ...f, priceMult: mult }, s, 21).slice(7));
  return avg(runs.map((r) => sum(r.map((x) => x.profit)) / 2));
}

const label = process.argv[2] ?? 'база';
if (process.argv[3]) for (const kv of process.argv[3].split(',')) {
  const [k, v] = kv.split('=');
  E[k] = Number(v);
}
const rows = FORMATS.map((f) => {
  const row = [0.8, 0.9, 1, 1.1, 1.2].map((m) => Math.round(week(f, m) / 100) / 10);
  return `${f.name.padEnd(18)} ${row.map((v) => String(v).padStart(6)).join(' ')}`;
});
console.log(`${label}: неделя 2–3, тыс. ₽ при ценах ×0.8 ×0.9 ×1 ×1.1 ×1.2\n${rows.join('\n')}`);
