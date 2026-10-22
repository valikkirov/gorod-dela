// Пакетный прогон форматов кафе: играет «разумного игрока» за каждый формат на нескольких seed.
// npx tsx tools/balance.ts [дней=28] [seed-ов=6]
import type { DayReport } from '../src/sim/cafe';
import { hm, isWeekend, MINUTES_PER_DAY } from '../src/sim/clock';
import type { PremisesId } from '../src/sim/economy';
import { MILESTONES } from '../src/sim/milestones';
import { Simulation } from '../src/sim/simulation';
import { INGREDIENTS, RECIPES, type IngredientId } from '../src/sim/stock';

export interface Format {
  name: string;
  premises?: PremisesId;
  menu: string[];
  open: number;
  close: number;
  /** Почасовой бариста: [дни, с, до] или null */
  hourly?: [boolean[], number, number] | null;
  shift?: boolean[] | null;
  loyalty?: boolean;
  /** Дни, когда кафе закрыто (если есть такая механика) */
  closedDays?: boolean[];
  prices?: Record<string, number>;
  /** Множитель всех цен меню */
  priceMult?: number;
}

const WD = [true, true, true, true, true, false, false];
const ALL = [true, true, true, true, true, true, true];

export const FORMATS: Format[] = [
  { name: 'Киоск: кофе с собой', premises: 'kiosk', menu: ['americano', 'cappuccino', 'latte', 'croissant'], open: hm(7), close: hm(15), hourly: [WD, hm(7), hm(10)] },
  { name: 'Обеды', menu: ['americano', 'cappuccino', 'soup', 'lunch', 'sandwich', 'tea'], open: hm(8), close: hm(18), hourly: [WD, hm(11), hm(15)] },
  {
    name: 'Районная кофейня',
    menu: ['americano', 'cappuccino', 'latte', 'raf', 'croissant', 'syrniki', 'tea', 'lemonade'],
    open: hm(8),
    close: hm(21),
    loyalty: true,
  },
  { name: 'Вечерняя', menu: ['sandwich', 'lemonade', 'beer', 'cider'], open: hm(12), close: hm(26), prices: { beer: 270, cider: 290 } },
  {
    name: 'Кофейня с баром',
    menu: ['americano', 'cappuccino', 'latte', 'raf', 'croissant', 'beer', 'cider'],
    open: hm(8),
    close: hm(26),
    hourly: [WD, hm(8), hm(10)],
    prices: { beer: 280 },
  },
  { name: 'Всё сразу', menu: ['americano', 'cappuccino', 'croissant', 'lunch', 'tea', 'beer'], open: hm(8), close: hm(26), hourly: [WD, hm(8), hm(14)] },
];

/** Сколько ингредиентов ушло за день по продажам */
function usage(r: DayReport): Partial<Record<IngredientId, number>> {
  const out: Partial<Record<IngredientId, number>> = {};
  for (const [item, n] of Object.entries(r.sold)) {
    for (const [ing, q] of Object.entries(RECIPES[item] ?? {}) as [IngredientId, number][]) out[ing] = (out[ing] ?? 0) + q * n;
  }
  return out;
}

/** Разумный игрок держит запас по расходу похожих дней с запасом 15 % */
function tuneStock(sim: Simulation): void {
  for (const weekend of [false, true]) {
    const days = sim.reports.filter((r) => r.opened && isWeekend(r.day) === weekend).slice(-3);
    if (!days.length) continue;
    for (const ing of INGREDIENTS) {
      const need = Math.max(...days.map((d) => usage(d)[ing.id] ?? 0));
      const used = Object.values(sim.cafe.menu).some((m) => (RECIPES[m.id] ?? {})[ing.id]);
      sim.setKeep(ing.id, used ? Math.ceil(need * 1.15) + 2 : 0, weekend);
    }
  }
}

/** «Разумный игрок» на событиях: чинит срочно, если кофе — главное, берёт заказ, если есть обеды */
function decide(sim: Simulation): void {
  const e = sim.pendingEvent;
  if (!e) return;
  const pick: Record<string, string> = {
    breakdown: 'urgent',
    festival: 'stall',
    supplier: 'decline',
    'office-order': 'accept',
    blogger: 'treat',
    'day-off': 'let',
  };
  // Заказ офиса без бариста — потерять обед; с бариста — выгодно
  if (e.id === 'office-order' && sim.cafe.staff.length === 0) pick['office-order'] = 'decline';
  // Столик на празднике в сквере — только если сам сидишь у сквера, а не в киоске у метро
  if (e.id === 'festival' && sim.cafe.premisesId === 'kiosk') pick.festival = 'skip';
  sim.chooseEvent(pick[e.id]);
}

export function play(f: Format, seed: number, days: number, prep?: (sim: Simulation) => void): DayReport[] {
  const sim = new Simulation(seed);
  prep?.(sim);
  sim.openCafe(f.premises ?? 'cafe');
  // Оборудование под категории меню (плита, кран) — сразу при открытии
  for (const id of f.menu) {
    const need = sim.cafe.missingEquipment(id);
    if (need) sim.buyEquipment(need);
  }
  // Сначала добавить нужное, потом убрать лишнее — последнюю позицию убрать нельзя
  for (const m of [...sim.cafe.menu]) if (!f.menu.includes(m.id) && sim.cafe.menu.length > 4) sim.removeMenuItem(m.id);
  for (const id of f.menu) if (!sim.cafe.hasItem(id)) sim.addMenuItem(id);
  for (const m of [...sim.cafe.menu]) if (!f.menu.includes(m.id)) sim.removeMenuItem(m.id);
  for (const m of sim.cafe.menu) if (f.priceMult) sim.setPrice(m.id, m.price * f.priceMult);
  for (const [id, p] of Object.entries(f.prices ?? {})) sim.setPrice(id, p);
  sim.setHours(f.open, f.close);
  if (f.hourly) {
    sim.hireBarista('hourly');
    const b = sim.cafe.staff.at(-1)!;
    sim.setStaffSchedule(b.id, { days: f.hourly[0], from: f.hourly[1], to: f.hourly[2] });
  }
  if (f.shift) {
    sim.hireBarista('shift');
    const b = sim.cafe.staff.at(-1)!;
    sim.setStaffSchedule(b.id, { days: f.shift, from: f.open, to: f.close });
  }
  if (f.loyalty) sim.setLoyaltyCard(true);
  const anySim = sim as unknown as { setClosedDays?: (d: boolean[]) => void };
  if (f.closedDays && anySim.setClosedDays) anySim.setClosedDays(f.closedDays);
  sim.buySign();
  sim.setFlyers(true);
  sim.launchSocial();
  for (let d = 0; d < days; d++) {
    sim.advance(5); // события приходят в 6:00 — решаем сразу
    decide(sim);
    sim.advance(hm(17) - 5); // → 23:00
    if (d === 6) sim.setFlyers(false); // листовки — только первая неделя
    tuneStock(sim);
    sim.advance(MINUTES_PER_DAY - hm(17));
    if (sim.bankrupt) break;
  }
  return sim.reports;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const k = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n / 100) / 10}к`;

const isMain = process.argv[1]?.includes('balance');
if (isMain) {
  const days = Number(process.argv[2] ?? 28);
  const seeds = Number(process.argv[3] ?? 6);
  const showMilestones = process.argv.includes('--milestones');
  console.log(`${days} дней × ${seeds} seed. Итог за неделю 1 · средняя неделя 2+ · день: будни / выходные · гостей в день`);
  for (const f of FORMATS) {
    const runs = Array.from({ length: seeds }, (_, i) => play(f, i + 1, days));
    const w1 = avg(runs.map((r) => sum(r.slice(0, 7).map((x) => x.profit))));
    const later = avg(runs.map((r) => avg(chunk(r.slice(7), 7).map((w) => sum(w.map((x) => x.profit))))));
    const wd = avg(runs.flatMap((r) => r.slice(7).filter((x) => !isWeekend(x.day)).map((x) => x.profit)));
    const we = avg(runs.flatMap((r) => r.slice(7).filter((x) => isWeekend(x.day)).map((x) => x.profit)));
    const guests = avg(runs.flatMap((r) => r.slice(7).map((x) => x.guests)));
    const worst = Math.min(...runs.map((r) => avg(chunk(r.slice(7), 7).map((w) => sum(w.map((x) => x.profit))))));
    const bankrupt = runs.filter((r) => r.length < days).length;
    console.log(
      `${f.name.padEnd(18)} ${k(w1).padStart(7)} · ${k(later).padStart(7)} (худший ${k(worst)}) · ${k(wd)} / ${k(we)} · ${guests.toFixed(0)}${bankrupt ? ` · банкротств ${bankrupt}` : ''}`,
    );
    // Вехи: в какой день в среднем и у скольких запусков из всех
    const ms = MILESTONES.map((m) => {
      const hit = runs.map((r) => r.find((x) => x.milestones?.includes(m.id))?.day).filter((d): d is number => d !== undefined);
      return `${m.id} ${hit.length ? `д${Math.round(avg(hit))}` : '—'}${hit.length < runs.length ? ` (${hit.length}/${runs.length})` : ''}`;
    });
    if (showMilestones) console.log(`${''.padEnd(18)} ${ms.join(' · ')}`);
  }
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
