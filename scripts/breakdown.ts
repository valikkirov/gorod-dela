// Разбор дня по статьям: откуда прибыль и куда уходят деньги (дни 15…N, среднее по seed)
// Запуск: npx vite-node scripts/breakdown.ts [дней] [seed-ов] [--only=id,id]
process.env.NO_MAIN = '1';
const { STRATEGIES, runWithSim } = await import('./strategies');
const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 42);
const seeds = Number(args.filter((a) => /^\d+$/.test(a))[1] ?? 2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const keys = ['guests', 'revenue', 'purchases', 'writtenOff', 'rent', 'utilities', 'wages', 'tax', 'marketing', 'giveaways', 'profit'] as const;
console.log(['формат'.padEnd(14), ...keys.map((k) => k.slice(0, 8).padStart(8)), 'чек'.padStart(6)].join(' '));
for (const s of STRATEGIES) {
  if (only ? !only.includes(s.id) : s.id.endsWith('-solo')) continue;
  const acc: Record<string, number> = {};
  let n = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { sim } = runWithSim(s, seed, days);
    for (const r of sim.reports.slice(14)) {
      n++;
      for (const k of keys) acc[k] = (acc[k] ?? 0) + ((r as unknown as Record<string, number>)[k] ?? 0);
    }
  }
  const v = (k: string) => Math.round(acc[k] / n);
  console.log([s.id.padEnd(14), ...keys.map((k) => String(v(k)).padStart(8)), String(Math.round(acc.revenue / acc.guests)).padStart(6)].join(' '));
}
