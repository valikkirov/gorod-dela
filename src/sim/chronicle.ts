// Хроника района: еженедельная «газета» из того, что действительно случилось за неделю.
// Только шаблоны по журналу дня (DayReport) — ничего не выдумывается и ничего не хранится:
// хроника собирается заново из отчётов, поэтому сохранению она не нужна.
import type { DayReport, RejectReason } from './cafe';
import { getLang, L, num, tr } from './i18n';
import { periodByIndex } from './periods';
import type { DistrictId } from './world';

export interface ChronicleStory {
  icon: string;
  title: string;
  text: string;
}

export interface Chronicle {
  week: number;
  title: string;
  stories: ChronicleStory[];
}

export interface ChronicleNames {
  district: DistrictId;
  /** Название кафе игрока */
  cafe: string;
  /** Конкурент, если есть */
  rival: string | null;
  /** Название позиции меню по id */
  item: (id: string) => string;
}

/** Сколько заметок в выпуске */
export const CHRONICLE_STORIES = 4;
/** Ниже этого за неделю отказы по одной причине — не новость */
const LOST_NEWS = 7;

export const CHRONICLE_TITLE: Record<DistrictId, string> = {
  klenovaya: L('Новости Кленовой'),
  delovoy: L('Вести Делового квартала'),
};

/** Почему уходили — заголовок и пояснение; причины «фона» (не по пути, не знал) в газету не попадают */
const LOST_STORY: Partial<Record<RejectReason, (n: number, h: number | null) => ChronicleStory>> = {
  queue: (n, h) => ({
    icon: '⏳',
    title: L('Очередь отпугивает прохожих'),
    text: h === null ? tr`${times(n)} жители заглядывали и\u00a0уходили, не\u00a0дождавшись.` : tr`${times(n)} жители заглядывали и\u00a0уходили, не\u00a0дождавшись. Тяжелее всего\u00a0—\u00a0около ${h}:00.`,
  }),
  expensive: (n) => ({ icon: '💸', title: L('«Дороговато»'), text: tr`${times(n)} жители смотрели на\u00a0ценник и\u00a0шли мимо.` }),
  closed: (n, h) => ({
    icon: '🔒',
    title: L('Поцеловали замок'),
    text: h === null ? tr`${times(n)} приходили, а\u00a0кафе закрыто.` : tr`${times(n)} приходили, а\u00a0кафе закрыто. Чаще всего\u00a0—\u00a0около ${h}:00.`,
  }),
  'out-of-stock': (n) => ({ icon: '📦', title: L('Пустые полки'), text: tr`${times(n)} гостю не\u00a0хватило продуктов на\u00a0заказ.` }),
  rival: (n) => ({ icon: '🏃', title: L('Уходят к\u00a0соседям'), text: tr`${times(n)} жители выбрали конкурента.` }),
  'no-item': (n) => ({ icon: '🔍', title: L('Искали в\u00a0меню\u00a0—\u00a0не\u00a0нашли'), text: tr`${times(n)} гости не\u00a0нашли то, за\u00a0чем пришли.` }),
  'no-staff': (n) => ({ icon: '🧑‍🍳', title: L('Некому обслужить'), text: tr`${times(n)} за\u00a0стойкой никого не\u00a0было.` }),
};

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

/** «1 раз», «3 раза», «28 раз» */
function times(n: number): string {
  if (getLang() === 'en') return n === 1 ? '1 time' : `${num(n)} times`;
  const a = n % 100;
  const b = a % 10;
  return `${num(n)}\u00a0${a > 10 && a < 20 ? 'раз' : b >= 2 && b <= 4 ? 'раза' : 'раз'}`;
}

/** Метка события, решённого по умолчанию: такие в хронику не берём, если есть живые */
const AUTO = tr` (не\u00a0успели решить)`;

function hoursOf(days: DayReport[], pick: (r: DayReport) => number[] | undefined): number[] {
  const out = new Array<number>(24).fill(0);
  for (const r of days) pick(r)?.forEach((v, h) => (out[h] += v));
  return out;
}

const peakHour = (hours: number[]): number | null => {
  const top = Math.max(...hours);
  return top > 0 ? hours.indexOf(top) : null;
};

const topSold = (days: DayReport[]): [string, number] | null => {
  const sold: Record<string, number> = {};
  for (const r of days) for (const [id, n] of Object.entries(r.sold)) sold[id] = (sold[id] ?? 0) + n;
  const best = Object.entries(sold).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best && best[1] > 0 ? best : null;
};

/** Заметка-кандидат: важность и ключ (одна и та же тема две недели подряд опускается вниз) */
type Candidate = [score: number, key: string, story: ChronicleStory];

/** Повтор темы прошлой недели теряет столько важности */
const REPEAT_PENALTY = 4;

function candidates(days: DayReport[], prevDays: DayReport[], names: ChronicleNames): Candidate[] {
  const out: Candidate[] = [];
  const add = (score: number, key: string, s: ChronicleStory) => out.push([score, key, s]);

  // Знакомые лица: новости о постоянных гостях — как есть, это уже живые истории
  const news = days.flatMap((r) => r.news ?? []);
  if (news.length) add(9, 'news', { icon: '👋', title: L('Знакомые лица'), text: `${news.slice(-2).join('. ')}.`.replace(/\.\.$/, '.') });

  // Случай недели: что случилось и что выбрал владелец; решённое самим — интереснее, чем по умолчанию
  const events = days.flatMap((r) => r.events ?? []);
  const live = events.filter((e) => !e.endsWith(AUTO));
  if (live.length) add(8, 'event', { icon: '📌', title: L('Случай недели'), text: live[live.length - 1] });

  // Главная причина, по которой уходили
  const lost: Partial<Record<RejectReason, number>> = {};
  for (const r of days) for (const [k, v] of Object.entries(r.missed)) lost[k as RejectReason] = (lost[k as RejectReason] ?? 0) + (v ?? 0);
  const worst = (Object.entries(lost) as [RejectReason, number][])
    .filter(([k, n]) => LOST_STORY[k] && n >= LOST_NEWS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (worst) {
    const h = peakHour(hoursOf(days, (r) => r.lostHour?.[worst[0]]));
    add(7, `lost:${worst[0]}`, LOST_STORY[worst[0]]!(worst[1], h));
  }

  // Постоянные приводят знакомых — кафе становится местом встречи
  const company = sum(days.map((r) => r.company ?? 0));
  if (company >= 3)
    add(6, 'company', {
      icon: '☕',
      title: tr`${names.cafe}\u00a0—\u00a0место встречи`,
      text: tr`За\u00a0неделю постоянные гости ${times(company)} приводили с\u00a0собой знакомых.`,
    });

  // Известность
  const before = prevDays.at(-1)?.awareCount ?? 0;
  const after = days.at(-1)!.awareCount;
  if (after - before >= 5)
    add(5, 'aware', {
      icon: '🗣️',
      title: L('О\u00a0кафе говорят'),
      text: before
        ? tr`Число жителей, которые знают о\u00a0кафе, выросло на\u00a0${num(after - before)}: теперь их ${num(after)}.`
        : tr`За\u00a0первую неделю о\u00a0кафе узнали ${num(after)} жителей района.`,
    });

  // Конкурент
  const promo = days.filter((r) => r.rivalPromo).length;
  if (names.rival && promo)
    add(5, 'rival', {
      icon: '🏷️',
      title: tr`Акция у\u00a0${names.rival}`,
      text: tr`${promo} из\u00a07 дней конкурент снижал цены. За\u00a0неделю у\u00a0него было ${num(sum(days.map((r) => r.rivalGuests ?? 0)))} гостей, у\u00a0вас\u00a0—\u00a0${num(sum(days.map((r) => r.guests)))}.`,
    });

  // Хит недели и смена хита
  const hit = topSold(days);
  if (hit) {
    const was = topSold(prevDays);
    const name = names.item(hit[0]);
    const changed = was && was[0] !== hit[0];
    add(changed ? 5 : 4, `hit:${hit[0]}`, {
      icon: '⭐',
      title: changed ? tr`Новый хит\u00a0—\u00a0${name}` : tr`Хит недели\u00a0—\u00a0${name}`,
      text: changed ? tr`${num(hit[1])} за\u00a0неделю, обогнали «${names.item(was[0])}».` : tr`${num(hit[1])} за\u00a0неделю\u00a0—\u00a0больше всего в\u00a0меню.`,
    });
  }

  // Час пик
  const peak = peakHour(hoursOf(days, (r) => r.servedHour));
  if (peak !== null) {
    const when = peak < 11 ? L('утренний кофе по\u00a0дороге к\u00a0метро') : peak < 16 ? L('обеденный перерыв') : L('вечерние посиделки');
    add(3, `peak:${peak}`, { icon: '🕗', title: tr`Самый людный час\u00a0—\u00a0${peak}:00`, text: tr`Больше всего гостей приходит около ${peak}:00: ${when}.` });
  }

  // Погода
  const wet = days.filter((r) => r.weather?.kind === 'rain').length;
  const snow = days.filter((r) => r.weather?.kind === 'snow' || r.weather?.kind === 'frost').length;
  if (snow >= 3) add(3, 'snow', { icon: '❄️', title: L('Зимняя неделя'), text: tr`${snow} из\u00a07 дней\u00a0—\u00a0снег или мороз: на\u00a0улице меньше прохожих.` });
  else if (wet >= 3) add(3, 'rain', { icon: '🌧️', title: L('Дождливая неделя'), text: tr`${wet} из\u00a07 дней шёл дождь: на\u00a0улице меньше прохожих.` });
  return out;
}

/** Лучшие заметки по важности; при равенстве — в порядке добавления */
function pick(list: Candidate[], repeat: Set<string>): Candidate[] {
  return list
    .map((c, i) => [c[0] - (repeat.has(c[1]) ? REPEAT_PENALTY : 0), i, c] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, CHRONICLE_STORIES)
    .map((x) => x[2]);
}

const daysOf = (reports: DayReport[], week: number): DayReport[] => {
  const p = periodByIndex('week', week);
  return reports.filter((r) => r.day >= p.from && r.day <= p.to);
};

/**
 * Выпуск хроники за неделю week (1, 2, …). null — неделя не закончилась, кафе в ней не работало или писать не о чем.
 * Заметки — по важности: знакомые лица, случай недели, главная причина отказов, компании, известность, конкурент,
 * хит, час пик, погода. Тема, которая была в прошлом выпуске (кроме лиц и случаев — они всегда новые), уходит ниже.
 */
export function chronicle(reports: DayReport[], week: number, names: ChronicleNames): Chronicle | null {
  const days = daysOf(reports, week);
  if (days.length < 7 || !days.some((r) => r.opened)) return null;
  const prevDays = daysOf(reports, week - 1);
  // Темы прошлого выпуска (без штрафа за позапрошлый: глубже не смотрим)
  const repeat = new Set<string>();
  if (prevDays.length === 7)
    for (const c of pick(candidates(prevDays, daysOf(reports, week - 2), names), new Set())) if (c[1] !== 'news' && c[1] !== 'event') repeat.add(c[1]);
  const stories = pick(candidates(days, prevDays, names), repeat).map((c) => c[2]);
  if (!stories.length) return null;
  return { week, title: CHRONICLE_TITLE[names.district], stories };
}
