// Разбор дня для отчёта: с чем сравнить, что главное, где потеряли гостей.
// Отчёт даёт доказательства, а не готовые инструкции — решение за игроком.
import { foodLine, type DayReport, type RejectReason } from './cafe';
import { isWeekend, WEEKDAY_FULL } from './clock';
import { formatMoney } from './economy';
import type { ResidentKind } from './residents';
import { WEATHER_LABEL } from './weather';

import { L, tr } from './i18n';
const NB = ' ';
const money = formatMoney;

/** Причины, на которые игрок может повлиять (без «ещё не открыто» и «не сегодня») */
const ACTIONABLE: RejectReason[] = [
  'queue',
  'no-time',
  'closed',
  'expensive',
  'out-of-stock',
  'no-item',
  'off-route',
  'unaware',
  'rival',
  'taste',
];

const REASON_WHY: Record<RejectReason, string> = {
  'not-open': tr`кафе ещё не открыто`,
  closed: tr`было закрыто`,
  expensive: L('дорого'),
  'off-route': tr`не по пути`,
  'no-item': tr`не нашли нужного в меню`,
  queue: L('очередь'),
  'no-time': tr`не дождались заказа`,
  mood: tr`не сегодня`,
  'out-of-stock': L('кончились продукты'),
  unaware: tr`не знали о кафе`,
  rival: tr`ушли к конкуренту`,
  taste: tr`не их вкус`,
  'no-staff': tr`некому было обслужить`,
};

/** Кому: «Студентам дорого» */
const KIND_DATIVE: Record<ResidentKind, string> = {
  office: L('Офисным'),
  student: L('Студентам'),
  pensioner: L('Пенсионерам'),
  shopkeeper: L('Продавцам'),
  remote: L('Фрилансерам'),
  youth: L('Молодёжи'),
  nightworker: tr`Ночной смене`,
  passenger: L('Пассажирам'),
  visitor: tr`Гостям района`,
};

/** «чаще всего офисные» */
const KIND_GENITIVE_PL: Record<ResidentKind, string> = {
  office: L('офисные'),
  student: L('студенты'),
  pensioner: L('пенсионеры'),
  shopkeeper: L('продавцы'),
  remote: L('фрилансеры'),
  youth: L('молодёжь'),
  nightworker: tr`ночная смена`,
  passenger: L('пассажиры'),
  visitor: tr`гости района`,
};

/** «в прошлый понедельник», «в прошлую среду», «в прошлое воскресенье» */
const LAST_WEEKDAY = [
  L('в прошлый понедельник'),
  L('в прошлый вторник'),
  L('в прошлую среду'),
  L('в прошлый четверг'),
  L('в прошлую пятницу'),
  L('в прошлую субботу'),
  L('в прошлое воскресенье'),
].map((s) => s.replace(/ /g, NB));

export interface Comparison {
  report: DayReport;
  /** «в прошлый понедельник» или «в последний будний день (пятница)» */
  label: string;
  sameWeather: boolean;
}

export interface LostWindow {
  from: number;
  to: number;
  count: number;
  reason: RejectReason;
}

export interface DayAnalysis {
  comparison: Comparison | null;
  /** Итог одной фразой: «Итог −2 300 ₽ — на 1 800 ₽ лучше, чем в прошлый вторник» */
  headline: string;
  /** Сравнение отдельной строкой под итогом: «на 1 800 ₽ лучше, чем в прошлый вторник» */
  compare: string;
  /** Главный фактор результата */
  factor: string;
  /** Где потеряли больше всего гостей */
  lost: LostWindow | null;
  /** Ушедшие по типам жителей: [тип, сколько, главная причина] — по убыванию */
  byKind: [ResidentKind, number, RejectReason][];
  /** Одно-два наблюдения, которые стоит проверить */
  observations: string[];
}

const sum = (a: number[] | undefined): number => (a ? a.reduce((x, y) => x + y, 0) : 0);
const pad = (n: number): string => String(n % 24).padStart(2, '0');
const span = (from: number, to: number): string => tr`с ${pad(from)}:00 до ${pad(to)}:00`;
/** «ушёл 21 человек», «ушли 7 человек»: гости — только те, кто купил */
const left = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? L('ушёл') : L('ушли'));
const people = (n: number): string => {
  const d = n % 10;
  const dd = n % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return tr`${n} человека`;
  return tr`${n} человек`;
};

/** С чем честно сравнивать: тот же день недели неделю назад, иначе последний день того же типа (будни/выходные) */
export function comparableDay(reports: DayReport[], r: DayReport): Comparison | null {
  const earlier = reports.filter((x) => x.day < r.day && x.opened && !x.dayOff);
  const sameWeekday = earlier.filter((x) => x.weekday === r.weekday).at(-1);
  const sameType = earlier.filter((x) => isWeekend(x.day) === isWeekend(r.day)).at(-1);
  const pick = sameWeekday ?? sameType;
  if (!pick) return null;
  const label =
    pick.day === r.day - 1
      ? L('вчера')
      : pick === sameWeekday && r.weekday !== undefined
      ? LAST_WEEKDAY[r.weekday]
      : tr`в последний ${isWeekend(r.day) ? L('выходной') : L('будний')} день (${WEEKDAY_FULL[pick.weekday ?? 0].toLowerCase()})`;
  return { report: pick, label, sameWeather: pick.weather?.kind === r.weather?.kind };
}

export function analyzeDay(reports: DayReport[], r: DayReport): DayAnalysis {
  if (r.dayOff) return dayOffAnalysis(r);
  const comparison = r.opened ? comparableDay(reports, r) : null;
  return {
    comparison,
    headline: headline(r, comparison),
    compare: compareText(r, comparison),
    factor: factor(r, comparison),
    lost: lostWindow(r),
    byKind: lostByKind(r),
    observations: observations(r),
  };
}

/** Выходной: денег не заработали, а аренда и коммуналка идут. Сколько людей пришли к закрытой двери. */
function dayOffAnalysis(r: DayReport): DayAnalysis {
  const want = sum(r.lostHour?.closed);
  const fixed = r.rent + r.utilities + r.wages;
  const hour = peakHour(r.lostHour?.closed);
  return {
    comparison: null,
    headline: tr`Выходной. Итог дня ${money(r.profit)}`,
    compare: tr`Выходной: точка не работала`,
    factor: tr`Аренда, коммуналка и зарплата в выходной — ${money(fixed)}.`,
    lost: null,
    byKind: lostByKind(r),
    observations:
      want > 0
        ? [tr`К закрытой двери пришли ${want} раз${hour === null ? '' : tr`, больше всего ${span(hour, hour + 1)}`}. Реши, нужен ли этот выходной.`]
        : [],
  };
}

function headline(r: DayReport, c: Comparison | null): string {
  if (!r.opened) {
    const want = sum(r.lostHour?.['not-open']);
    return want > 0 ? tr`Кафе ещё не открыто. Зайти хотели ${want} раз` : tr`Кафе ещё не открыто`;
  }
  const result = tr`Итог дня ${money(r.profit)}`;
  if (!c) return tr`${result}. Сравнивать пока не с чем`;
  const d = r.profit - c.report.profit;
  if (Math.abs(d) < 100) return tr`${result} — так же, как ${c.label}`;
  return tr`${result} — на ${money(Math.abs(d))} ${d > 0 ? L('лучше') : L('хуже')}, чем ${c.label}`;
}

function compareText(r: DayReport, c: Comparison | null): string {
  if (!r.opened) return '';
  if (!c) return tr`Сравнивать пока не с чем`;
  const d = r.profit - c.report.profit;
  if (Math.abs(d) < 100) return tr`Так же, как ${c.label}`;
  return tr`На ${money(Math.abs(d))} ${d > 0 ? L('лучше') : L('хуже')}, чем ${c.label}`;
}

function factor(r: DayReport, c: Comparison | null): string {
  if (!r.opened) {
    const hour = peakHour(r.lostHour?.['not-open']);
    return hour === null ? '' : tr`Больше всего хотели зайти ${span(hour, hour + 1)}.`;
  }
  if (!c) {
    const costs: [string, number][] = [
      [tr`аренду и коммуналку`, r.rent + r.utilities],
      [L('продукты'), foodLine(r)],
      [L('зарплату'), r.wages],
      [L('маркетинг'), r.marketing],
    ];
    costs.sort((a, b) => b[1] - a[1]);
    const spent = costs.reduce((a, [, n]) => a + n, 0) + r.tax;
    return tr`Выручка ${money(r.revenue)}, расходы ${money(spent)}. Больше всего ушло на ${costs[0][0]}: ${money(costs[0][1])}.`;
  }
  const p = c.report;
  const weather =
    c.sameWeather || !p.weather || !r.weather
      ? ''
      : tr` Погода другая: тогда ${WEATHER_LABEL[p.weather.kind].toLowerCase()}, сегодня ${WEATHER_LABEL[r.weather.kind].toLowerCase()} — сравнение неточное.`;
  // Вклад каждой статьи в разницу итога
  const parts: [string, number][] = [
    ['revenue', r.revenue - p.revenue],
    ['purchases', -(foodLine(r) - foodLine(p))],
    ['wages', -(r.wages - p.wages)],
    ['marketing', -(r.marketing - p.marketing)],
  ];
  const total = r.profit - p.profit;
  parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (Math.abs(total) < 100 && Math.abs(parts[0][1]) < 100) return tr`Почти без изменений.${weather}`;
  // Главное — то, что сильнее всего толкнуло итог в ту же сторону, куда он сдвинулся
  const main = parts.find(([, d]) => Math.sign(d) === Math.sign(total) && Math.abs(d) >= 100) ?? parts[0];
  const describe = ([key, delta]: [string, number]): string => {
    const up = delta > 0;
    const amount = money(Math.abs(delta));
    if (key === 'revenue') {
      const guests = r.guests === p.guests ? tr`при том же числе гостей (${r.guests}), значит, дело в среднем чеке` : tr`гостей ${r.guests} против ${p.guests}`;
      return tr`выручка ${up ? L('выше') : L('ниже')} на ${amount}, ${guests}`;
    }
    if (key === 'purchases') return tr`на продукты ушло ${up ? L('меньше') : L('больше')} на ${amount}`;
    if (key === 'wages') return tr`зарплата ${up ? L('меньше') : L('больше')} на ${amount}`;
    return up ? tr`на маркетинг ушло меньше на ${amount}` : tr`маркетинг ${money(r.marketing)}`;
  };
  let text = tr`Главное — ${describe(main)}.`;
  // Если самое крупное изменение тянуло в другую сторону — тоже скажем
  const other = parts.find((x) => x !== main && Math.abs(x[1]) > Math.abs(main[1]) * 0.6 && Math.abs(x[1]) >= 300);
  if (other) text += tr` При этом ${describe(other)}.`;
  const changed = (r.changes?.length ?? 0) > 0 ? tr` Сегодня менялись условия — смотри «Изменения» ниже.` : '';
  return text + weather + changed;
}

function peakHour(hours: number[] | undefined): number | null {
  if (!hours) return null;
  let best = -1;
  let bestN = 0;
  hours.forEach((n, h) => {
    if (n > bestN) {
      best = h;
      bestN = n;
    }
  });
  return best < 0 ? null : best;
}

/** Самое тяжёлое окно потерь: один-два соседних часа с одной причиной */
function lostWindow(r: DayReport): LostWindow | null {
  if (!r.opened || !r.lostHour) return null;
  let best: LostWindow | null = null;
  for (const reason of ACTIONABLE) {
    const hours = r.lostHour[reason];
    if (!hours) continue;
    for (let h = 0; h < 24; h++) {
      const one = hours[h];
      const two = one + hours[(h + 1) % 24];
      const cand =
        two >= one * 1.5 && hours[(h + 1) % 24] > 0
          ? { from: h, to: h + 2, count: two, reason }
          : { from: h, to: h + 1, count: one, reason };
      if (cand.count > (best?.count ?? 0)) best = cand;
    }
  }
  return best && best.count >= 2 ? best : null;
}

export function describeLost(w: LostWindow): string {
  const cap = span(w.from, w.to);
  return `${cap[0].toUpperCase()}${cap.slice(1)} ${left(w.count)} ${people(w.count)}: ${REASON_WHY[w.reason]}.`;
}

function lostByKind(r: DayReport): [ResidentKind, number, RejectReason][] {
  if (!r.lostKind) return [];
  const rows: [ResidentKind, number, RejectReason][] = [];
  for (const [kind, reasons] of Object.entries(r.lostKind) as [ResidentKind, Partial<Record<RejectReason, number>>][]) {
    const entries = (Object.entries(reasons) as [RejectReason, number][]).filter(
      ([reason]) => r.opened ? reason !== 'not-open' && reason !== 'mood' : reason === 'not-open',
    );
    const total = entries.reduce((a, [, n]) => a + n, 0);
    if (total === 0) continue;
    entries.sort((a, b) => b[1] - a[1]);
    rows.push([kind, total, entries[0][0]]);
  }
  return rows.sort((a, b) => b[1] - a[1]);
}

/** Наблюдения с весом: показываем два самых весомых */
function observations(r: DayReport): string[] {
  if (!r.opened) return [];
  const out: [number, string][] = [];
  const cap = r.capHour ?? [];
  const used = r.usedHour ?? [];
  const staff = r.staffHour ?? [];
  const lost = r.lostHour ?? {};
  const load = (h: number) => (cap[h] > 0 ? used[h] / cap[h] : 0);

  // Тесно: ушли из-за очереди или ожидания, а стойка была занята почти всё время
  const waited = (h: number) => (lost.queue?.[h] ?? 0) + (lost['no-time']?.[h] ?? 0);
  const crowd = longestRun((h) => waited(h) > 0 && load(h) >= 0.85);
  if (crowd) {
    let n = 0;
    for (let h = crowd[0]; h < crowd[1]; h++) n += waited(h);
    out.push([n * 2, tr`${cap0(span(crowd[0], crowd[1]))} стойка была занята почти всё время, ${left(n)} ${people(n)}.`]);
  }
  // Пусто: бариста на смене, а стойка простаивает два часа и дольше
  const idle = longestRun((h) => staff[h] > 30 && load(h) < 0.25);
  if (idle && idle[1] - idle[0] >= 2) {
    out.push([
      (idle[1] - idle[0]) * 2,
      tr`${cap0(span(idle[0], idle[1]))} бариста был на смене, а стойка была занята меньше четверти времени.`,
    ]);
  }
  // Хотели зайти, когда было закрыто
  const closed = sum(lost.closed);
  if (closed >= 4) {
    const run = heaviestRun(lost.closed ?? []);
    const when = run ? tr` — чаще всего ${span(run[0], run[1])}` : '';
    out.push([closed, tr`Хотели зайти, когда было закрыто: ${closed} раз${when}.`]);
  }
  // Цена отсекает целую группу — возможно, это просто не${NB}твоя аудитория
  for (const [kind, reasons] of Object.entries(r.lostKind ?? {}) as [ResidentKind, Partial<Record<RejectReason, number>>][]) {
    const n = reasons.expensive ?? 0;
    if (n >= 4) out.push([n, tr`${KIND_DATIVE[kind]} дорого: ${n} отказов. Решай, твоя ли это аудитория — скидка для них снизит доход с остальных.`]);
  }
  // Конкурент: кто именно уходит к нему
  const toRival = r.missed.rival ?? 0;
  if (toRival >= 4) {
    const kinds = (Object.entries(r.lostKind ?? {}) as [ResidentKind, Partial<Record<RejectReason, number>>][])
      .map(([k, v]) => [k, v.rival ?? 0] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    const who = kinds.length ? tr` — чаще всего ${KIND_GENITIVE_PL[kinds[0][0]]}` : '';
    const promo = r.rivalPromo ? tr` У него шла акция.` : '';
    out.push([toRival * 1.5, tr`К конкуренту ушли ${toRival} гостей${who}.${promo}`]);
  }
  const unaware = r.missed.unaware ?? 0;
  if (unaware >= 8) out.push([unaware * 0.8, tr`${unaware} раз хотели куда-нибудь зайти, но о кафе не знали.`]);
  const oos = r.missed['out-of-stock'] ?? 0;
  if (oos >= 2) out.push([oos * 3, tr`Кончились продукты — ${left(oos)} ${people(oos)}. Это дефицит; порча — отдельно, в списании.`]);
  if (r.writtenOff >= 1000) out.push([r.writtenOff / 300, tr`Испортилось и списано продуктов на ${money(r.writtenOff)}.`]);

  return out
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([, t]) => t);
}

const cap0 = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** Самый длинный непрерывный отрезок часов [from, to) */
function longestRun(test: (h: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let h = 0; h <= 24; h++) {
    const ok = h < 24 && test(h);
    if (ok && start < 0) start = h;
    if (!ok && start >= 0) {
      if (!best || h - start > best[1] - best[0]) best = [start, h];
      start = -1;
    }
  }
  return best;
}

/** Непрерывный отрезок часов с самой большой суммой [from, to) */
function heaviestRun(values: number[]): [number, number] | null {
  let best: [number, number] | null = null;
  let bestSum = 0;
  for (let from = 0; from < 24; from++) {
    let acc = 0;
    for (let to = from; to < 24 && values[to] > 0 && to - from < 3; to++) {
      acc += values[to];
      if (acc > bestSum) {
        bestSum = acc;
        best = [from, to + 1];
      }
    }
  }
  return best;
}
