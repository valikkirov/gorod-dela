// Временная диагностика форматов: куда уходят деньги и гости
import { STRATEGIES, runWithSim } from './strategies';
const ids = (process.argv[2] ?? 'evening').split(',');
const seeds = Number(process.argv[3] ?? 4), days = Number(process.argv[4] ?? 42);
for (const id of ids) {
  const s = STRATEGIES.find((x) => x.id === id)!;
  const acc: Record<string, number> = {}; const sold: Record<string, number> = {}; const rev: Record<string, number> = {}; const missed: Record<string, number> = {};
  const lostH: number[] = Array(24).fill(0); let n = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { sim } = runWithSim(s, seed, days);
    for (const r of sim.reports.slice(14)) {
      n++;
      for (const k of ['guests', 'revenue', 'food', 'rent', 'utilities', 'wages', 'tax', 'marketing', 'profit', 'wanted', 'noSeat'] as const) acc[k] = (acc[k] ?? 0) + ((r as any)[k] ?? 0);
      for (const [k, v] of Object.entries(r.sold)) sold[k] = (sold[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.revenueBy ?? {})) rev[k] = (rev[k] ?? 0) + v;
      for (const [k, v] of Object.entries(r.missed)) missed[k] = (missed[k] ?? 0) + (v ?? 0);
      const lh = (r as any).lostHour as Record<string, number[]> | undefined;
      if (lh) for (const arr of Object.values(lh)) arr.forEach((v, i) => (lostH[i] += v));
    }
  }
  const f = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v / n)}`).join(' ');
  console.log(`\n== ${id}  дней ${n}`);
  console.log('в день:', f(acc));
  console.log('продано:', f(sold));
  console.log('выручка:', f(rev));
  console.log('упущено:', f(missed));
  console.log('упущено по часам:', lostH.map((v, i) => `${i}:${(v / n).toFixed(1)}`).filter((x) => !x.endsWith(':0.0')).join(' '));
}
