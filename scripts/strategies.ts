// Прогоны стратегий: несколько форматов на одинаковых условиях и разных seed.
// Запуск: npx vite-node scripts/strategies.ts [дней] [seed-ов] [--only=id,id] [--nomarketing]
// Игрок в прогоне — «разумный»: вывеска в первый день, закупка подстраивается под расход,
// оборудование и зал — по формату. Цены — по умолчанию. Больше ничего не трогает.
import { hm, MINUTES_PER_DAY } from '../src/sim/clock';
import type { EquipmentId, PremisesId } from '../src/sim/economy';
import type { PresetId } from '../src/sim/interior';
import { KIOSK_FITS, upgrade } from '../src/sim/milestones';
import { Simulation } from '../src/sim/simulation';
import { INGREDIENTS } from '../src/sim/stock';
import { dailyUse } from '../src/sim/stockView';
import type { DayHours } from '../src/sim/cafe';

interface Staff {
  contract: 'shift' | 'hourly';
  from: number;
  to: number;
  days?: boolean[];
}

interface Strategy {
  id: string;
  name: string;
  premises: PremisesId;
  menu: string[];
  equipment?: EquipmentId[];
  preset?: PresetId;
  /** Часы по дням недели, 0 — понедельник; null — выходной */
  week: (DayHours | null)[];
  staff: Staff[];
  /** Киоск докупает вещи стойки, когда денег больше порога */
  kioskFits?: boolean;
}

const every = (h: DayHours): DayHours[] => Array.from({ length: 7 }, () => ({ ...h }));
const weekdays = (wd: DayHours | null, we: DayHours | null): (DayHours | null)[] =>
  Array.from({ length: 7 }, (_, i) => (i < 5 ? wd : we));
const ALL = [true, true, true, true, true, true, true];
const WD = [true, true, true, true, true, false, false];

export const STRATEGIES: Strategy[] = [
  {
    id: 'togo',
    name: 'Кофе с собой',
    premises: 'cafe',
    menu: ['americano', 'cappuccino', 'latte', 'raf', 'croissant', 'sandwich'],
    week: weekdays({ openAt: hm(7), closeAt: hm(16) }, { openAt: hm(9), closeAt: hm(16) }),
    staff: [{ contract: 'hourly', from: hm(7), to: hm(11), days: WD }],
  },
  {
    id: 'lunch',
    name: 'Обеды',
    premises: 'cafe',
    menu: ['americano', 'cappuccino', 'sandwich', 'syrniki', 'soup', 'lunch'],
    equipment: ['stove'],
    week: weekdays({ openAt: hm(9), closeAt: hm(17) }, null),
    staff: [{ contract: 'hourly', from: hm(12), to: hm(15), days: WD }],
  },
  {
    id: 'cozy',
    name: 'Районная кофейня',
    premises: 'cafe',
    menu: ['americano', 'cappuccino', 'latte', 'raf', 'croissant', 'syrniki', 'tea', 'lemonade'],
    preset: 'premium',
    week: every({ openAt: hm(8), closeAt: hm(20) }),
    // Владелец — 12 ч, бариста на вечерний пик, когда зал полный
    staff: [{ contract: 'hourly', from: hm(17), to: hm(20) }],
  },
  {
    id: 'evening',
    name: 'Вечернее',
    premises: 'cafe',
    menu: ['americano', 'sandwich', 'lemonade', 'beer', 'cider'],
    equipment: ['tap'],
    preset: 'comfort',
    week: every({ openAt: hm(16), closeAt: hm(24) }),
    staff: [{ contract: 'hourly', from: hm(18), to: hm(24) }],
  },
  {
    id: 'all',
    name: 'Всё сразу',
    premises: 'cafe',
    menu: ['americano', 'cappuccino', 'croissant', 'sandwich', 'soup', 'lunch', 'tea', 'beer'],
    equipment: ['stove', 'tap'],
    week: every({ openAt: hm(7), closeAt: hm(23) }),
    // Утро — бариста на пик, остальное — владелец
    staff: [{ contract: 'hourly', from: hm(7), to: hm(13) }],
  },
  {
    id: 'kiosk',
    name: 'Киоск у метро',
    premises: 'kiosk',
    menu: ['americano', 'cappuccino', 'latte', 'croissant', 'tea'],
    week: every({ openAt: hm(7), closeAt: hm(20) }),
    staff: [{ contract: 'hourly', from: hm(7), to: hm(10) }],
    kioskFits: true,
  },
];

// Варианты: те же форматы без наёмного бариста (за стойкой сам владелец)
for (const id of ['togo', 'cozy', 'all', 'kiosk', 'evening', 'lunch']) {
  const b = STRATEGIES.find((x) => x.id === id)!;
  STRATEGIES.push({ ...b, id: `${id}-solo`, name: `${b.name} (сам)`, staff: [] });
}
STRATEGIES.push({ ...STRATEGIES.find((x) => x.id === 'kiosk')!, id: 'kiosk-bare-solo', name: 'Киоск без стойки', kioskFits: false });
// Сильная, но тяжёлая для владельца альтернатива: всё сразу с бариста на смене
STRATEGIES.push({
  ...STRATEGIES.find((x) => x.id === 'all')!,
  id: 'all-shift-solo',
  name: 'Всё сразу, смена',
  staff: [{ contract: 'shift', from: hm(7), to: hm(19) }],
});

export interface RunResult {
  strategy: string;
  seed: number;
  /** Прибыль по дням (операционная, без вложений) */
  profit: number[];
  guests: number[];
  revenue: number[];
  invested: number;
  cashEnd: number;
  bankruptDay: number | null;
  missed: Record<string, number>;
  /** Дни акции конкурента */
  promo: boolean[];
  rain: boolean[];
}

export function run(s: Strategy, seed: number, days: number, marketing = true): RunResult {
  const sim = new Simulation(seed);
  const cash0 = sim.cash;
  sim.openCafe(s.premises);
  sim.buySign();
  if (marketing) {
    sim.setFlyers(true);
    sim.launchSocial();
  }
  for (const id of s.equipment ?? []) sim.buyEquipment(id);
  if (s.preset) sim.applyPreset(s.preset);
  for (const m of [...sim.cafe.menu]) if (!s.menu.includes(m.id)) sim.removeMenuItem(m.id);
  for (const id of s.menu) sim.addMenuItem(id);
  for (const m of [...sim.cafe.menu]) if (!s.menu.includes(m.id)) sim.removeMenuItem(m.id);
  sim.setWeekHours(s.week);
  for (const st of s.staff) {
    sim.hireBarista(st.contract);
    const b = sim.cafe.staff[sim.cafe.staff.length - 1];
    sim.setStaffSchedule(b.id, { days: st.days ?? ALL, from: st.from, to: st.to });
  }
  const invested0 = cash0 - sim.cash;
  // Ингредиенты, которых нет в меню, не держим
  const used = new Set<string>();
  for (const m of sim.cafe.menu) for (const ing of INGREDIENTS) if (sim.cafe.stock && recipeHas(m.id, ing.id)) used.add(ing.id);
  for (const ing of INGREDIENTS) {
    if (!used.has(ing.id)) sim.setKeep(ing.id, 0), sim.setKeep(ing.id, 0, true);
    else if (ing.id === 'bar') sim.setKeep('bar', 30), sim.setKeep('bar', 30, true);
  }

  const out: RunResult = {
    strategy: s.id,
    seed,
    profit: [],
    guests: [],
    revenue: [],
    invested: invested0,
    cashEnd: 0,
    bankruptDay: null,
    missed: {},
    promo: [],
    rain: [],
  };
  let extra = 0;
  for (let d = 0; d < days && !sim.bankrupt; d++) {
    sim.advance(MINUTES_PER_DAY);
    const r = sim.reports[sim.reports.length - 1];
    out.profit.push(r.profit);
    out.guests.push(r.guests);
    out.revenue.push(r.revenue);
    out.promo.push(!!sim.rival?.promo(r.day));
    out.rain.push(r.weather?.kind === 'rain');
    for (const [k, v] of Object.entries(r.missed)) out.missed[k] = (out.missed[k] ?? 0) + (v ?? 0);
    if (sim.bankrupt) out.bankruptDay = d + 1;
    if (marketing && d === 13) sim.setFlyers(false);
    // Закупка под расход: скоропорт — на день с запасом, остальное — на три дня
    const use = dailyUse(sim.reports);
    if (use) {
      for (const ing of INGREDIENTS) {
        if (!used.has(ing.id)) continue;
        const per = use[ing.id] ?? 0;
        const keep = Math.ceil(per * (ing.shelfDays !== null && ing.shelfDays <= 2 ? 1.15 : 3)) + 2;
        sim.setKeep(ing.id, keep);
        sim.setKeep(ing.id, keep, true);
      }
    }
    if (s.kioskFits) {
      for (const id of KIOSK_FITS) {
        if (sim.upgradeState(id) === 'ok' && sim.cash - upgrade(id).cost > 60_000) {
          sim.buyUpgrade(id);
          extra += upgrade(id).cost;
        }
      }
    }
  }
  out.invested += extra;
  out.cashEnd = sim.cash;
  return out;
}

import { recipeOf } from '../src/sim/stock';
function recipeHas(itemId: string, ing: string): boolean {
  return (recipeOf(itemId) as Record<string, number>)[ing] > 0;
}

// ——— Сводка ———
const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]): number => (a.length ? sum(a) / a.length : 0);
const fmt = (n: number): string => Math.round(n).toLocaleString('ru-RU');

function main(): void {
  const args = process.argv.slice(2);
  const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 42);
  const seeds = Number(args.filter((a) => /^\d+$/.test(a))[1] ?? 4);
  const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const rows: string[] = [];
  const all: RunResult[] = [];
  for (const s of STRATEGIES) {
    if (only ? !only.includes(s.id) : s.id.endsWith('-solo')) continue;
    const rs: RunResult[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const t = Date.now();
      const r = run(s, seed, days, !args.includes('--nomarketing'));
      rs.push(r);
      all.push(r);
      process.stderr.write(`${s.id} seed ${seed}: ${((Date.now() - t) / 1000).toFixed(1)} с\n`);
    }
    // Установившийся режим: с 15-го дня
    const steady = rs.map((r) => avg(r.profit.slice(14)));
    const firstWeeks = rs.map((r) => sum(r.profit.slice(0, 14)));
    const promoDays = rs.flatMap((r) => r.profit.slice(14).filter((_, i) => r.promo[i + 14]));
    const plainDays = rs.flatMap((r) => r.profit.slice(14).filter((_, i) => !r.promo[i + 14]));
    const rainDays = rs.flatMap((r) => r.profit.slice(14).filter((_, i) => r.rain[i + 14]));
    const dryDays = rs.flatMap((r) => r.profit.slice(14).filter((_, i) => !r.rain[i + 14]));
    const payback = rs.map((r) => {
      let acc = -r.invested;
      for (let i = 0; i < r.profit.length; i++) if ((acc += r.profit[i]) >= 0) return i + 1;
      return null;
    });
    const missed: Record<string, number> = {};
    for (const r of rs) for (const [k, v] of Object.entries(r.missed)) missed[k] = (missed[k] ?? 0) + v / rs.length / r.profit.length;
    const topMissed = Object.entries(missed)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v.toFixed(0)}`)
      .join(', ');
    rows.push(
      [
        s.name.padEnd(17),
        fmt(avg(steady)).padStart(7),
        `${fmt(Math.min(...steady))}…${fmt(Math.max(...steady))}`.padStart(15),
        fmt(avg(firstWeeks)).padStart(9),
        fmt(avg(rs.map((r) => r.invested))).padStart(8),
        payback.map((p) => p ?? '—').join('/').padStart(14),
        fmt(avg(rs.map((r) => avg(r.guests.slice(14))))).padStart(5),
        `${fmt(avg(plainDays))}/${fmt(avg(promoDays))}`.padStart(13),
        `${fmt(avg(dryDays))}/${fmt(avg(rainDays))}`.padStart(13),
        rs.filter((r) => r.bankruptDay).length.toString().padStart(3),
        topMissed,
      ].join(' │ '),
    );
  }
  console.log(`Дней: ${days}, seed: 1…${seeds}`);
  console.log(
    [
      'Формат'.padEnd(17),
      'день'.padStart(7),
      'разброс seed'.padStart(15),
      '2 нед.'.padStart(9),
      'вложено'.padStart(8),
      'окупаемость'.padStart(14),
      'гост'.padStart(5),
      'обыч/акция'.padStart(13),
      'сухо/дождь'.padStart(13),
      'банк'.padStart(3),
      'чаще всего не зашли (в день)',
    ].join(' │ '),
  );
  for (const r of rows) console.log(r);
  if (args.includes('--json')) console.log(JSON.stringify(all));
}

if (!process.env.NO_MAIN) main();
