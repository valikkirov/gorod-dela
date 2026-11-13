// Общий отчёт по бизнесу: все точки вместе. Не сумма отчётов точек, а свои вопросы владельца сети —
// сколько заработали вместе, какая точка тянет, какая подводит, почему итог изменился, хватает ли денег.
// Касса и кредит общие: проценты — общий расход, а не расход точки; вложения и кредит — движение денег,
// в прибыль не входят.
import type { DayReport, RejectReason } from './cafe';
import { tr } from './i18n';
import { COST_LINES, summarize, type CostKey, type PeriodSummary } from './periods';
import { formatMoney as money, PREMISES, type PremisesId } from './economy';
import type { DistrictId } from './world';

/** Точка для отчёта: её дни и как она называется */
export interface PointInput {
  key: string;
  title: string;
  district: DistrictId;
  premisesId: PremisesId;
  reports: DayReport[];
}

export interface PointResult {
  key: string;
  title: string;
  district: DistrictId;
  premisesId: PremisesId;
  s: PeriodSummary;
  /** Прибыль точки до общих расходов (проценты по кредиту — общие) */
  operating: number;
  prevOperating: number | null;
  /** Выручка минус прибыль до общих расходов */
  expenses: number;
  /** Доля в прибыли точек, % — когда все точки в плюсе */
  share: number | null;
  /** Ушли по известной причине (не знали о точке и «не вышло по пути» сюда не входят) */
  lost: number;
  topLoss: [RejectReason, number] | null;
  /** Сколько дней периода точка работала, если меньше, чем шёл период */
  partial: number | null;
}

export interface Business {
  from: number;
  to: number;
  /** Сколько дней периода уже прошло */
  days: number;
  /** Период закончился: сравнивать с прошлым можно только целый */
  complete: boolean;
  points: PointResult[];
  revenue: number;
  /** Расходы точек (без процентов) */
  expenses: number;
  /** Прибыль точек до общих расходов */
  operating: number;
  /** Общие расходы: проценты по кредиту */
  interest: number;
  /** Итог бизнеса */
  profit: number;
  prevProfit: number | null;
  guests: number;
  lost: number;
  /** Рентабельность, % */
  margin: number | null;
  costs: Record<CostKey, number>;
  purchases: number;
  invested: number;
  loanTaken: number;
  loanPaid: number;
  /** Прибыль точек по дням: [день, по точкам в порядке points] */
  daily: [number, number[]][];
}

/** Причины, которые знаем из того, что делали жители, — не догадки */
const LOSSES: RejectReason[] = ['queue', 'closed', 'no-item', 'out-of-stock', 'expensive', 'rival', 'taste', 'no-time', 'no-staff'];

const range = (from: number, to: number) => ({ kind: 'week' as const, index: 0, from, to });

function lossOf(s: PeriodSummary): { lost: number; top: [RejectReason, number] | null } {
  const list = (Object.entries(s.missed) as [RejectReason, number][]).filter(([r]) => LOSSES.includes(r));
  const lost = list.reduce((a, [, n]) => a + n, 0);
  const top = list.sort((a, b) => b[1] - a[1])[0] ?? null;
  return { lost, top };
}

/** Итоги всех точек за дни from…to; prev — прошлый такой же период для сравнения */
export function business(points: PointInput[], from: number, to: number, prev: [number, number] | null): Business {
  const none = () => null;
  const last = Math.max(0, ...points.map((p) => p.reports.at(-1)?.day ?? 0));
  const days = Math.max(0, Math.min(to, last) - from + 1);
  // Неполный период с полным прошлым не сравниваем: 2 дня недели всегда «хуже» 7 дней
  const complete = last >= to;
  if (!complete) prev = null;
  const results: PointResult[] = points.map((p) => {
    const s = summarize(p.reports, range(from, to), none);
    const ps = prev ? summarize(p.reports, range(prev[0], prev[1]), none) : null;
    const operating = s.profit + s.costs.interest;
    const { lost, top } = lossOf(s);
    return {
      key: p.key,
      title: p.title,
      district: p.district,
      premisesId: p.premisesId,
      s,
      operating,
      prevOperating: ps && ps.openDays > 0 ? ps.profit + ps.costs.interest : null,
      expenses: s.revenue - operating,
      share: null,
      lost,
      topLoss: top,
      partial: s.openDays > 0 && s.openDays < days ? s.openDays : null,
    };
  });
  const active = results.filter((r) => r.s.openDays > 0);
  const sum = (f: (r: PointResult) => number) => active.reduce((a, r) => a + f(r), 0);
  const operating = sum((r) => r.operating);
  if (active.length > 1 && active.every((r) => r.operating >= 0) && operating > 0) for (const r of active) r.share = Math.round((r.operating / operating) * 1000) / 10;
  const costs = Object.fromEntries(COST_LINES.map(([k]) => [k, sum((r) => r.s.costs[k])])) as Record<CostKey, number>;
  const revenue = sum((r) => r.s.revenue);
  const profit = sum((r) => r.s.profit);
  const prevActive = results.filter((r) => r.prevOperating !== null);
  const prevProfit = prev && prevActive.length ? prevActive.reduce((a, r) => a + r.prevOperating!, 0) - interestOf(points, prev) : null;
  const allDays = new Set<number>();
  for (const r of active) for (const d of r.s.days) allDays.add(d.day);
  const daily: [number, number[]][] = [...allDays]
    .sort((a, b) => a - b)
    .map((day) => [day, results.map((r) => {
      const d = r.s.days.find((x) => x.day === day);
      return d && d.opened ? d.profit + (d.interest ?? 0) : 0;
    })]);
  const flow = (k: 'loanTaken' | 'loanPaid') => active.reduce((a, r) => a + r.s.days.reduce((x, d) => x + (d[k] ?? 0), 0), 0);
  return {
    from,
    to,
    days,
    complete,
    points: results,
    revenue,
    expenses: revenue - operating,
    operating,
    interest: costs.interest,
    profit,
    prevProfit,
    guests: sum((r) => r.s.guests),
    lost: sum((r) => r.lost),
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    costs,
    purchases: sum((r) => r.s.purchases),
    invested: sum((r) => r.s.invested),
    loanTaken: flow('loanTaken'),
    loanPaid: flow('loanPaid'),
    daily,
  };
}

function interestOf(points: PointInput[], [from, to]: [number, number]): number {
  let n = 0;
  for (const p of points) for (const r of p.reports) if (r.day >= from && r.day <= to) n += r.interest ?? 0;
  return n;
}

/** Самая большая статья расходов точки */
function biggestCost(r: PointResult): [string, number] | null {
  const top = COST_LINES.filter(([k]) => k !== 'interest')
    .map(([k, label]) => [label, r.s.costs[k]] as [string, number])
    .sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top : null;
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`;

/**
 * Главное по сети — не больше max выводов, по силе влияния на деньги. Только то, что известно точно:
 * разница в деньгах по точкам и причины ухода гостей из того, что делали жители. reason — «потому что …»
 */
export function businessNotes(b: Business, reason: (r: RejectReason) => string, max: number): string[] {
  const out: [number, string][] = [];
  const active = b.points.filter((r) => r.s.openDays > 0);
  // Почему итог изменился — по вкладу каждой точки
  if (b.prevProfit !== null) {
    const d = b.profit - b.prevProfit;
    const parts = active
      .filter((r) => r.prevOperating !== null)
      .map((r) => [r, r.operating - r.prevOperating!] as const)
      .filter(([, x]) => Math.abs(x) >= 100)
      .sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]))
      .map(([r, x]) => tr`${r.title} ${signed(x)}`);
    if (Math.abs(d) >= 300 && parts.length) {
      out.push([Math.abs(d), tr`Общая прибыль ${d > 0 ? tr`выросла` : tr`упала`} на ${money(Math.abs(d))}: ${parts.join(', ')}.`]);
    }
  }
  // Точка в минусе — что её тянет вниз; иначе — кто главный источник прибыли
  const losing = active.filter((r) => r.operating < 0).sort((a, c) => a.operating - c.operating)[0];
  if (losing) {
    const cost = biggestCost(losing);
    out.push([
      Math.abs(losing.operating) * 1.5,
      tr`${losing.title} в минусе: ${signed(losing.operating)}${cost ? tr` — больше всего ушло на ${cost[0].toLowerCase()} (${money(cost[1])})` : ''}.`,
    ]);
  } else if (active.length > 1) {
    const lead = [...active].sort((a, c) => c.operating - a.operating)[0];
    if (lead.share !== null && lead.share >= 55) out.push([lead.operating * 0.5, tr`${lead.title} — главный источник прибыли: ${String(lead.share).replace('.', ',')}${' '}% прибыли точек.`]);
  }
  // Где больше всего теряем гостей и почему
  const leak = [...active].filter((r) => r.topLoss && r.topLoss[1] >= 10).sort((a, c) => c.topLoss![1] - a.topLoss![1])[0];
  if (leak) {
    const [why, n] = leak.topLoss!;
    const avg = leak.s.guests ? leak.s.revenue / leak.s.guests : 0;
    out.push([n * avg * 0.5, tr`${leak.title}: ${n} гостей ушли, потому что ${reason(why)}.`]);
  }
  // Новая точка работала не весь период — сравнивать с осторожностью
  const fresh = active.find((r) => r.partial !== null);
  if (fresh && b.days > 1) out.push([0, tr`${fresh.title} работала ${fresh.partial} из ${b.days} дней периода — её итог неполный.`]);
  return out
    .sort((a, c) => c[0] - a[0])
    .slice(0, max)
    .map(([, t]) => t);
}

/** На сколько дней хватит кассы на постоянные расходы (аренда, коммуналка, зарплата), если выручка встанет */
export function reserveDays(points: PointInput[], cash: number): number | null {
  const last = Math.max(0, ...points.map((p) => p.reports.at(-1)?.day ?? 0));
  let fixed = 0;
  let n = 0;
  for (let day = last - 6; day <= last; day++) {
    let f = 0;
    let any = false;
    for (const p of points) {
      const r = p.reports.find((x) => x.day === day);
      if (!r || !r.opened) continue;
      any = true;
      f += r.rent + r.utilities + r.wages;
    }
    if (any) {
      fixed += f;
      n += 1;
    }
  }
  if (!n || fixed <= 0) return null;
  return Math.max(0, Math.floor(cash / (fixed / n)));
}

export interface Payback {
  /** Открытие и улучшения */
  invested: number;
  /** Прибыль точки до общих расходов с первого дня работы */
  returned: number;
  /** Через сколько дней окупится при нынешнем темпе (неделя), null — пока не окупается */
  inDays: number | null;
}

/** Окупаемость точки: сколько в неё вложено и сколько она уже вернула */
export function payback(p: PointInput): Payback {
  const open = p.reports.filter((r) => r.opened);
  const invested = PREMISES[p.premisesId].openingCost + open.reduce((a, r) => a + (r.invested ?? 0), 0);
  const returned = open.reduce((a, r) => a + r.profit + (r.interest ?? 0), 0);
  const week = open.slice(-7);
  const pace = week.length ? week.reduce((a, r) => a + r.profit + (r.interest ?? 0), 0) / week.length : 0;
  const left = invested - returned;
  return { invested, returned, inDays: left <= 0 ? 0 : pace > 0 ? Math.ceil(left / pace) : null };
}
