// Расширенный прогон: форматы × вариации (цены, часы, персонал). Считает среднюю неделю со 2-й,
// разброс по seed и за сколько недель отбиваются вложения (открытие + оборудование).
// npx tsx tools/scenarios.ts [дней=28] [seed-ов=5]
import { hm, isWeekend } from '../src/sim/clock';
import { EQUIPMENT, equipmentFor, PREMISES } from '../src/sim/economy';
import { CATALOG } from '../src/sim/cafe';
import { FORMATS, play, type Format } from './balance';

const WD = [true, true, true, true, true, false, false];
const ALL = [true, true, true, true, true, true, true];

const V: [string, (f: Format) => Format][] = [
  ['как есть', (f) => f],
  ['цены −10 %', (f) => ({ ...f, priceMult: 0.9 })],
  ['цены +15 %', (f) => ({ ...f, priceMult: 1.15 })],
  ['без бариста', (f) => ({ ...f, hourly: null, shift: null })],
  ['бариста на смену', (f) => ({ ...f, hourly: null, shift: ALL })],
  ['часы −2', (f) => ({ ...f, open: f.open + 60, close: f.close - 60 })],
];

const days = Number(process.argv[2] ?? 28);
const seeds = Number(process.argv[3] ?? 5);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const k = (n: number) => `${n >= 0 ? '+' : ''}${(Math.round(n / 100) / 10).toFixed(1)}к`;

/** Сколько вложено на старте: открытие помещения + оборудование под меню */
function invested(f: Format): number {
  const eq = new Set(f.menu.map((id) => equipmentFor(CATALOG.find((c) => c.id === id)!.kind)).filter((e) => !!e));
  return PREMISES[f.premises ?? 'cafe'].openingCost + sum([...eq].map((e) => EQUIPMENT[e!].cost));
}

const rows: string[] = [];
console.log(`${days} дней × ${seeds} seed. Средняя неделя со 2-й (разброс), выходной день, отбивается за`);
for (const base of FORMATS) {
  for (const [vn, vf] of V) {
    const f = vf(base);
    const runs = Array.from({ length: seeds }, (_, i) => play(f, i + 1, days));
    const weeks = runs.map((r) => (sum(r.slice(7).map((x) => x.profit)) / Math.max(1, r.length - 7)) * 7);
    const w = avg(weeks);
    const we = avg(runs.flatMap((r) => r.slice(7).filter((x) => isWeekend(x.day)).map((x) => x.profit)));
    const bankrupt = runs.filter((r) => r.length < days).length;
    const payback = w > 0 ? `${Math.ceil(invested(f) / w)} нед.` : '—';
    const line = `${base.name.padEnd(18)} ${vn.padEnd(16)} ${k(w).padStart(7)} (${k(Math.min(...weeks))}…${k(Math.max(...weeks))}) · вых ${k(we)} · ${payback}${bankrupt ? ` · банкротств ${bankrupt}` : ''}`;
    console.log(line);
    rows.push(line);
  }
}
void hm;
void WD;
