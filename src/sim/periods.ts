// Отчёты за период (GDD §13.4, блок 2): неделя и месяц по дням отчётов.
// Неделя — 7 игровых дней от первого, месяц — 4 недели (28 дней): так периоды стыкуются с днями недели.
import type { DayReport, RejectReason } from './cafe';
import { formatMoney } from './economy';

const NB = ' ';
const money = formatMoney;

export type PeriodKind = 'week' | 'month';
export const PERIOD_DAYS: Record<PeriodKind, number> = { week: 7, month: 28 };

export interface Period {
  kind: PeriodKind;
  /** 1, 2, 3… */
  index: number;
  from: number;
  to: number;
}

export function periodOf(kind: PeriodKind, day: number): Period {
  const len = PERIOD_DAYS[kind];
  const index = Math.floor((day - 1) / len) + 1;
  return { kind, index, from: (index - 1) * len + 1, to: index * len };
}

export function periodByIndex(kind: PeriodKind, index: number): Period {
  const len = PERIOD_DAYS[kind];
  return { kind, index, from: (index - 1) * len + 1, to: index * len };
}

/** Статьи расходов в порядке показа */
export const COST_LINES = [
  ['purchases', 'Закупка'],
  ['rent', 'Аренда'],
  ['utilities', 'Коммуналка'],
  ['wages', 'Зарплата'],
  ['tax', 'Налог'],
  ['marketing', 'Маркетинг'],
  ['other', 'События'],
  ['interest', 'Проценты по кредиту'],
] as const;
export type CostKey = (typeof COST_LINES)[number][0];

export interface ItemResult {
  id: string;
  sold: number;
  revenue: number;
  /** Выручка минус себестоимость */
  margin: number;
}

export interface PeriodSummary {
  period: Period;
  /** Дни периода, которые уже прошли */
  days: DayReport[];
  /** Все дни периода позади */
  complete: boolean;
  /** Сколько дней точка работала */
  openDays: number;
  revenue: number;
  costs: Record<CostKey, number>;
  profit: number;
  guests: number;
  wanted: number;
  writtenOff: number;
  purchases: number;
  invested: number;
  items: ItemResult[];
  missed: Partial<Record<RejectReason, number>>;
}

const add = <K extends string>(into: Partial<Record<K, number>>, k: K, v: number) => {
  into[k] = (into[k] ?? 0) + v;
};

/**
 * Итоги периода. price — цена позиции сейчас: для старых отчётов без выручки по позициям
 * считаем по ней (и себестоимость по cost).
 */
export function summarize(
  reports: DayReport[],
  period: Period,
  priceOf: (id: string) => { price: number; cost: number } | null,
): PeriodSummary {
  const days = reports.filter((r) => r.day >= period.from && r.day <= period.to);
  const costs = Object.fromEntries(COST_LINES.map(([k]) => [k, 0])) as Record<CostKey, number>;
  const sold: Record<string, number> = {};
  const rev: Record<string, number> = {};
  const cogs: Record<string, number> = {};
  const missed: Partial<Record<RejectReason, number>> = {};
  let revenue = 0;
  let profit = 0;
  let guests = 0;
  let wanted = 0;
  let writtenOff = 0;
  let invested = 0;
  for (const r of days) {
    revenue += r.revenue;
    profit += r.profit;
    guests += r.guests;
    wanted += r.wanted;
    writtenOff += r.writtenOff;
    invested += r.invested ?? 0;
    for (const [k] of COST_LINES) costs[k] += (r[k] as number | undefined) ?? 0;
    for (const [id, n] of Object.entries(r.sold)) {
      add(sold, id, n);
      const p = priceOf(id);
      add(rev, id, r.revenueBy?.[id] ?? (p ? p.price * n : 0));
      add(cogs, id, r.cogsBy?.[id] ?? (p ? p.cost * n : 0));
    }
    for (const [reason, n] of Object.entries(r.missed) as [RejectReason, number][]) add(missed, reason, n);
  }
  const items = Object.keys(sold)
    .map((id) => ({ id, sold: sold[id], revenue: rev[id] ?? 0, margin: (rev[id] ?? 0) - (cogs[id] ?? 0) }))
    .sort((a, b) => b.margin - a.margin);
  const last = reports.at(-1)?.day ?? 0;
  return {
    period,
    days,
    complete: last >= period.to,
    openDays: days.filter((r) => r.opened).length,
    revenue,
    costs,
    profit,
    guests,
    wanted,
    writtenOff,
    purchases: costs.purchases,
    invested,
    items,
    missed,
  };
}

/** От желания до покупки: хотели → знали → было открыто и нашлось нужное → решили зайти → обслужены */
export function funnel(s: PeriodSummary): [string, number][] {
  const m = s.missed;
  const n = (k: RejectReason) => m[k] ?? 0;
  const knew = s.wanted - n('unaware') - n('not-open');
  const could = knew - n('closed') - n('no-item');
  const decided = could - n('expensive') - n('off-route') - n('mood') - n('rival') - n('taste');
  return [
    ['Хотели зайти', s.wanted],
    [`Знали о${NB}точке`, Math.max(0, knew)],
    [`Было открыто и${NB}нашлось нужное`, Math.max(0, could)],
    ['Решили зайти', Math.max(0, decided)],
    ['Обслужены', s.guests],
  ];
}

/** Сравнение с прошлым периодом: «на 7 490 ₽ больше, чем на прошлой неделе» */
export function compareLine(s: PeriodSummary, prev: PeriodSummary | null): string {
  const what = s.period.kind === 'week' ? `на${NB}прошлой неделе` : `в${NB}прошлом месяце`;
  if (!prev || prev.openDays === 0) return s.period.kind === 'week' ? 'Первая неделя: сравнивать пока не с чем' : 'Первый месяц: сравнивать пока не с чем';
  if (!s.complete) return `Период ещё идёт: ${s.days.length}${NB}из${NB}${PERIOD_DAYS[s.period.kind]}${NB}дней`;
  const d = s.profit - prev.profit;
  if (Math.abs(d) < 100) return `Так же, как ${what}`;
  return `На${NB}${money(Math.abs(d))} ${d > 0 ? 'больше' : 'меньше'}, чем ${what}`;
}

/** Два-три вывода за период: что приносит деньги, где теряем гостей, сколько выбросили */
export function insights(s: PeriodSummary, name: (id: string) => string, reasonText: (r: RejectReason) => string): string[] {
  const out: string[] = [];
  const [top, second] = s.items;
  if (top && second && second.sold < top.sold * 0.7 && second.margin > top.margin * 0.75) {
    out.push(`${name(second.id)} приносит почти столько же, сколько ${name(top.id).toLowerCase()}: ${money(second.margin)} маржи против ${money(top.margin)}, хотя продаётся реже.`);
  } else if (top) {
    out.push(`Больше всего зарабатывает ${name(top.id).toLowerCase()}: ${money(top.margin)} маржи, продано ${top.sold}.`);
  }
  const lost = (Object.entries(s.missed) as [RejectReason, number][])
    .filter(([r]) => r !== 'not-open' && r !== 'mood' && r !== 'unaware')
    .sort((a, b) => b[1] - a[1])[0];
  if (lost && lost[1] >= 10) out.push(`${lost[1].toLocaleString('ru-RU').replace(/\s/g, NB)}${NB}раз не${NB}зашли, потому что ${reasonText(lost[0])}.`);
  if (s.purchases > 0 && s.writtenOff > 0) {
    const pct = Math.round((s.writtenOff / s.purchases) * 100);
    if (pct >= 5) out.push(`Списано ${money(s.writtenOff)} продуктов${NB}— ${pct}${NB}% закупки.`);
  }
  if (s.invested > 0) out.push(`Вложено в${NB}улучшения ${money(s.invested)}${NB}— в${NB}итог не${NB}входит, но${NB}из${NB}кассы ушло.`);
  return out.slice(0, 3);
}
