// Разбор дня для отчёта: с чем сравнить, что главное, где потеряли гостей.
// Отчёт даёт доказательства, а не готовые инструкции — решение за игроком.
import type { DayReport, RejectReason } from './cafe';
import { isWeekend, WEEKDAY_FULL } from './clock';
import { formatMoney } from './economy';
import type { ResidentKind } from './residents';
import { WEATHER_LABEL } from './weather';

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
  'not-open': `кафе ещё не${NB}открыто`,
  closed: `было закрыто`,
  expensive: 'дорого',
  'off-route': `не${NB}по${NB}пути`,
  'no-item': `не${NB}нашли нужного в${NB}меню`,
  queue: 'очередь',
  'no-time': `не${NB}дождались заказа`,
  mood: `не${NB}сегодня`,
  'out-of-stock': 'кончились продукты',
  unaware: `не${NB}знали о${NB}кафе`,
  rival: `ушли к${NB}конкуренту`,
  taste: `не${NB}их вкус`,
};

/** Кому: «Студентам дорого» */
const KIND_DATIVE: Record<ResidentKind, string> = {
  office: 'Офисным',
  student: 'Студентам',
  pensioner: 'Пенсионерам',
  shopkeeper: 'Продавцам',
  remote: 'Фрилансерам',
  youth: 'Молодёжи',
  nightworker: `Ночной${NB}смене`,
  passenger: 'Пассажирам',
  visitor: `Гостям${NB}района`,
};

/** «чаще всего офисные» */
const KIND_GENITIVE_PL: Record<ResidentKind, string> = {
  office: 'офисные',
  student: 'студенты',
  pensioner: 'пенсионеры',
  shopkeeper: 'продавцы',
  remote: 'фрилансеры',
  youth: 'молодёжь',
  nightworker: `ночная${NB}смена`,
  passenger: 'пассажиры',
  visitor: `гости${NB}района`,
};

/** «в прошлый понедельник», «в прошлую среду», «в прошлое воскресенье» */
const LAST_WEEKDAY = [
  'в прошлый понедельник',
  'в прошлый вторник',
  'в прошлую среду',
  'в прошлый четверг',
  'в прошлую пятницу',
  'в прошлую субботу',
  'в прошлое воскресенье',
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
const span = (from: number, to: number): string => `с${NB}${pad(from)}:00 до${NB}${pad(to)}:00`;
/** «ушёл 21 человек», «ушли 7 человек»: гости — только те, кто купил */
const left = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'ушёл' : 'ушли');
const people = (n: number): string => {
  const d = n % 10;
  const dd = n % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n}${NB}человека`;
  return `${n}${NB}человек`;
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
      ? 'вчера'
      : pick === sameWeekday && r.weekday !== undefined
      ? LAST_WEEKDAY[r.weekday]
      : `в${NB}последний ${isWeekend(r.day) ? 'выходной' : 'будний'} день (${WEEKDAY_FULL[pick.weekday ?? 0].toLowerCase()})`;
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
    headline: `Выходной. Итог дня ${money(r.profit)}`,
    compare: `Выходной: точка не${NB}работала`,
    factor: `Аренда, коммуналка и${NB}зарплата в${NB}выходной — ${money(fixed)}.`,
    lost: null,
    byKind: lostByKind(r),
    observations:
      want > 0
        ? [`К${NB}закрытой двери пришли ${want}${NB}раз${hour === null ? '' : `, больше всего ${span(hour, hour + 1)}`}. Реши, нужен ли этот выходной.`]
        : [],
  };
}

function headline(r: DayReport, c: Comparison | null): string {
  if (!r.opened) {
    const want = sum(r.lostHour?.['not-open']);
    return want > 0 ? `Кафе ещё не${NB}открыто. Зайти хотели ${want}${NB}раз` : `Кафе ещё не${NB}открыто`;
  }
  const result = `Итог дня ${money(r.profit)}`;
  if (!c) return `${result}. Сравнивать пока не${NB}с${NB}чем`;
  const d = r.profit - c.report.profit;
  if (Math.abs(d) < 100) return `${result} — так же, как ${c.label}`;
  return `${result} — на${NB}${money(Math.abs(d))} ${d > 0 ? 'лучше' : 'хуже'}, чем ${c.label}`;
}

function compareText(r: DayReport, c: Comparison | null): string {
  if (!r.opened) return '';
  if (!c) return `Сравнивать пока не${NB}с${NB}чем`;
  const d = r.profit - c.report.profit;
  if (Math.abs(d) < 100) return `Так же, как ${c.label}`;
  return `На${NB}${money(Math.abs(d))} ${d > 0 ? 'лучше' : 'хуже'}, чем ${c.label}`;
}

function factor(r: DayReport, c: Comparison | null): string {
  if (!r.opened) {
    const hour = peakHour(r.lostHour?.['not-open']);
    return hour === null ? '' : `Больше всего хотели зайти ${span(hour, hour + 1)}.`;
  }
  if (!c) {
    const costs: [string, number][] = [
      [`аренду и${NB}коммуналку`, r.rent + r.utilities],
      ['закупку', r.purchases],
      ['зарплату', r.wages],
      ['маркетинг', r.marketing],
    ];
    costs.sort((a, b) => b[1] - a[1]);
    const spent = costs.reduce((a, [, n]) => a + n, 0) + r.tax;
    return `Выручка ${money(r.revenue)}, расходы ${money(spent)}. Больше всего ушло на${NB}${costs[0][0]}: ${money(costs[0][1])}.`;
  }
  const p = c.report;
  const weather =
    c.sameWeather || !p.weather || !r.weather
      ? ''
      : ` Погода другая: тогда ${WEATHER_LABEL[p.weather.kind].toLowerCase()}, сегодня ${WEATHER_LABEL[r.weather.kind].toLowerCase()} — сравнение неточное.`;
  // Вклад каждой статьи в разницу итога
  const parts: [string, number][] = [
    ['revenue', r.revenue - p.revenue],
    ['purchases', -(r.purchases - p.purchases)],
    ['wages', -(r.wages - p.wages)],
    ['marketing', -(r.marketing - p.marketing)],
  ];
  const total = r.profit - p.profit;
  parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (Math.abs(total) < 100 && Math.abs(parts[0][1]) < 100) return `Почти без${NB}изменений.${weather}`;
  // Главное — то, что сильнее всего толкнуло итог в ту же сторону, куда он сдвинулся
  const main = parts.find(([, d]) => Math.sign(d) === Math.sign(total) && Math.abs(d) >= 100) ?? parts[0];
  const describe = ([key, delta]: [string, number]): string => {
    const up = delta > 0;
    const amount = money(Math.abs(delta));
    if (key === 'revenue') {
      const guests = r.guests === p.guests ? `при${NB}том же числе гостей (${r.guests}), значит, дело в${NB}среднем чеке` : `гостей ${r.guests} против ${p.guests}`;
      return `выручка ${up ? 'выше' : 'ниже'} на${NB}${amount}, ${guests}`;
    }
    if (key === 'purchases') return `закупка ${up ? 'меньше' : 'больше'} на${NB}${amount}`;
    if (key === 'wages') return `зарплата ${up ? 'меньше' : 'больше'} на${NB}${amount}`;
    return up ? `на${NB}маркетинг ушло меньше на${NB}${amount}` : `маркетинг ${money(r.marketing)}`;
  };
  let text = `Главное — ${describe(main)}.`;
  // Если самое крупное изменение тянуло в другую сторону — тоже скажем
  const other = parts.find((x) => x !== main && Math.abs(x[1]) > Math.abs(main[1]) * 0.6 && Math.abs(x[1]) >= 300);
  if (other) text += ` При этом ${describe(other)}.`;
  const changed = (r.changes?.length ?? 0) > 0 ? ` Сегодня менялись условия — смотри «Изменения» ниже.` : '';
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
    out.push([n * 2, `${cap0(span(crowd[0], crowd[1]))} стойка была занята почти всё время, ${left(n)} ${people(n)}.`]);
  }
  // Пусто: бариста на смене, а стойка простаивает два часа и дольше
  const idle = longestRun((h) => staff[h] > 30 && load(h) < 0.25);
  if (idle && idle[1] - idle[0] >= 2) {
    out.push([
      (idle[1] - idle[0]) * 2,
      `${cap0(span(idle[0], idle[1]))} бариста был на${NB}смене, а${NB}стойка была занята меньше четверти времени.`,
    ]);
  }
  // Хотели зайти, когда было закрыто
  const closed = sum(lost.closed);
  if (closed >= 4) {
    const run = heaviestRun(lost.closed ?? []);
    const when = run ? ` — чаще всего ${span(run[0], run[1])}` : '';
    out.push([closed, `Хотели зайти, когда было закрыто: ${closed}${NB}раз${when}.`]);
  }
  // Цена отсекает целую группу — возможно, это просто не${NB}твоя аудитория
  for (const [kind, reasons] of Object.entries(r.lostKind ?? {}) as [ResidentKind, Partial<Record<RejectReason, number>>][]) {
    const n = reasons.expensive ?? 0;
    if (n >= 4) out.push([n, `${KIND_DATIVE[kind]} дорого: ${n}${NB}отказов. Решай, твоя ли это аудитория — скидка для${NB}них снизит доход с${NB}остальных.`]);
  }
  // Конкурент: кто именно уходит к нему
  const toRival = r.missed.rival ?? 0;
  if (toRival >= 4) {
    const kinds = (Object.entries(r.lostKind ?? {}) as [ResidentKind, Partial<Record<RejectReason, number>>][])
      .map(([k, v]) => [k, v.rival ?? 0] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    const who = kinds.length ? ` — чаще всего ${KIND_GENITIVE_PL[kinds[0][0]]}` : '';
    const promo = r.rivalPromo ? ` У${NB}него шла акция.` : '';
    out.push([toRival * 1.5, `К${NB}конкуренту ушли ${toRival}${NB}гостей${who}.${promo}`]);
  }
  const unaware = r.missed.unaware ?? 0;
  if (unaware >= 8) out.push([unaware * 0.8, `${unaware}${NB}раз хотели куда-нибудь зайти, но о${NB}кафе не${NB}знали.`]);
  const oos = r.missed['out-of-stock'] ?? 0;
  if (oos >= 2) out.push([oos * 3, `Кончились продукты — ${left(oos)} ${people(oos)}. Это дефицит; порча — отдельно, в${NB}списании.`]);
  if (r.writtenOff >= 1000) out.push([r.writtenOff / 300, `Испортилось и${NB}списано продуктов на${NB}${money(r.writtenOff)}.`]);

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
