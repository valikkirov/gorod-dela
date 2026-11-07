// Вехи первой точки и улучшения, которые они открывают.
// Веха — понятная цель с прогрессом («неделя в плюсе: 4 из 7»). Часть вех открывает улучшение:
// его можно купить, и оно меняет возможности заведения, а не просто цифру.
import type { DayReport } from './cafe';
import type { PremisesId } from './economy';

import { getLang, L, tr } from './i18n';
export type MilestoneId = 'hundred' | 'week-plus' | 'no-queue' | 'no-waste' | 'regulars' | 'cushion' | 'known';

export interface MilestoneCtx {
  reports: DayReport[];
  /** Сколько жителей с лояльностью «свой» */
  loyal: number;
  aware: number;
  population: number;
  cash: number;
  /** Сколько было до открытия — для «вложения вернулись» */
  startCash: number;
}

export interface Milestone {
  id: MilestoneId;
  title: string;
  hint: string;
  progress: (c: MilestoneCtx) => [done: number, target: number];
  /** Как дела сейчас, если прогресс не число: «за неделю −3 200 ₽» */
  now?: (c: MilestoneCtx) => string | null;
}

/** Последние 7 дней, если кафе работало все семь */
function lastWeek(reports: DayReport[]): DayReport[] | null {
  const w = reports.slice(-7);
  return w.length === 7 && w.every((r) => r.opened) ? w : null;
}

const weekProfit = (w: DayReport[]): number => w.reduce((s, r) => s + r.profit, 0);
const wasteShare = (w: DayReport[]): number => {
  const bought = w.reduce((s, r) => s + r.purchases, 0);
  return bought > 0 ? w.reduce((s, r) => s + r.writtenOff, 0) / bought : 1;
};
/** Доля списаний для вехи «Бережливость» */
export const WASTE_SHARE = 0.1;
const rub = (n: number): string => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US').replace(/\s/g, '\u00a0')}\u00a0₽`;

/** Будний день с нормальным потоком, когда никто не ушёл из‑за очереди */
export const calmDay = (r: DayReport): boolean =>
  r.opened &&
  r.weekday !== undefined &&
  r.weekday < 5 &&
  r.guests >= 30 &&
  (r.missed.queue ?? 0) + (r.missed['no-time'] ?? 0) === 0;

export const MILESTONES: Milestone[] = [
  {
    id: 'hundred',
    title: L('Первая сотня гостей'),
    hint: L('Обслужить 100 гостей'),
    progress: (c) => [c.reports.reduce((s, r) => s + r.guests, 0), 100],
  },
  {
    id: 'week-plus',
    title: L('Неделя в\u00a0плюсе'),
    hint: L('Прибыль за\u00a0последние 7 дней больше нуля'),
    progress: (c) => {
      const w = lastWeek(c.reports);
      return [w && weekProfit(w) > 0 ? 1 : 0, 1];
    },
    now: (c) => {
      const w = lastWeek(c.reports);
      return w ? tr`сейчас ${rub(weekProfit(w))}` : null;
    },
  },
  {
    id: 'no-queue',
    title: L('Без очереди'),
    hint: L('Будний день от\u00a030 гостей, и\u00a0никто не\u00a0ушёл из‑за очереди'),
    progress: (c) => [c.reports.some(calmDay) ? 1 : 0, 1],
  },
  {
    id: 'no-waste',
    title: L('Бережливость'),
    hint: L('За\u00a0неделю списали меньше 10\u00a0% закупленного'),
    progress: (c) => {
      const w = lastWeek(c.reports);
      return [w && wasteShare(w) < WASTE_SHARE ? 1 : 0, 1];
    },
    now: (c) => {
      const w = lastWeek(c.reports);
      return w ? tr`сейчас ${Math.round(wasteShare(w) * 100)}\u00a0%` : null;
    },
  },
  {
    id: 'regulars',
    title: L('Свои люди'),
    hint: L('40 постоянных гостей: привыкли к\u00a0кафе и\u00a0заходили на\u00a0этой неделе'),
    progress: (c) => [c.loyal, 40],
  },
  {
    id: 'cushion',
    title: L('Вложения вернулись'),
    hint: L('В\u00a0кассе больше, чем было до\u00a0открытия'),
    progress: (c) => [Math.max(0, Math.round(c.cash)), c.startCash],
  },
  {
    id: 'known',
    title: L('Узнаваемое место'),
    hint: L('О\u00a0кафе знают 80\u00a0% жителей'),
    progress: (c) => [c.aware, Math.ceil(c.population * 0.8)],
  },
];

export const milestone = (id: MilestoneId): Milestone => MILESTONES.find((m) => m.id === id)!;

/** 'interior' — старое улучшение, теперь это зал (interior.ts); остаётся ради старых сохранений */
export type UpgradeId = 'machine' | 'showcase' | 'interior' | KioskFitId;

/** Вещи стойки киоска (GDD §13.4, блок 1): покупаются во вкладке «Стойка» */
export type KioskFitId = 'terminal' | 'board' | 'pastry' | 'shelves' | 'awning';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  cost: number;
  effect: string;
  /** Какая веха открывает покупку; нет — доступно сразу */
  unlock?: MilestoneId;
  /** Где возможно (интерьер — только там, где есть зал) */
  premises: PremisesId[];
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'machine',
    name: L('Вторая кофемашина'),
    cost: 60_000,
    effect: L('Заказ готовится быстрее: 3\u00a0мин вместо 4, с\u00a0бариста\u00a0— 1,5 вместо 2'),
    unlock: 'hundred',
    premises: ['cafe', 'kiosk'],
  },
  {
    id: 'showcase',
    name: L('Холодильная витрина'),
    cost: 40_000,
    effect: L('Скоропорт хранится на\u00a0день дольше'),
    unlock: 'week-plus',
    premises: ['cafe', 'kiosk'],
  },
  // Стойка киоска
  {
    id: 'terminal',
    name: L('Терминал для карт'),
    cost: 5_000,
    effect: L('Оплата быстрее: на\u00a0гостя −15\u00a0% времени, очередь короче'),
    premises: ['kiosk'],
  },
  {
    id: 'board',
    name: L('Меню-доска с\u00a0подсветкой'),
    cost: 5_000,
    effect: L('Прохожие замечают киоск в\u00a01,5 раза чаще, вечером\u00a0— вдвое. Меню видно издалека: заходят охотнее'),
    premises: ['kiosk'],
  },
  {
    id: 'pastry',
    name: L('Витринка с\u00a0выпечкой на\u00a0стойке'),
    cost: 6_000,
    effect: L('Выпечка на\u00a0виду: примерно 1\u00a0из\u00a07 гостей докупает её к\u00a0кофе или чаю'),
    premises: ['kiosk'],
  },
  {
    id: 'shelves',
    name: L('Полки с\u00a0зерном и\u00a0цветок'),
    cost: 4_000,
    effect: L('Киоск выглядит обжитым: заходят чуть охотнее, постоянными становятся быстрее'),
    premises: ['kiosk'],
  },
  {
    id: 'awning',
    name: L('Навес над\u00a0окном'),
    cost: 6_000,
    effect: L('Снаружи. Без навеса в\u00a0дождь у\u00a0окна не\u00a0стоят в\u00a0очереди больше трёх человек'),
    premises: ['kiosk'],
  },
];

/** Порядок на стойке киоска: номер на картинке = место в списке */
export const KIOSK_FITS: UpgradeId[] = ['terminal', 'board', 'pastry', 'shelves', 'machine', 'showcase', 'awning'];

export const upgrade = (id: UpgradeId): Upgrade => UPGRADES.find((u) => u.id === id)!;

/** Эффекты улучшений — числа в одном месте */
export const UPGRADE_EFFECT = {
  /** Множитель времени приготовления */
  machineService: 0.75,
  showcaseShelfDays: 1,
  /** Терминал: время на гостя */
  terminalService: 0.85,
  /** Доска с подсветкой: во сколько раз чаще замечают днём и вечером (с 17:00) */
  boardNotice: 1.5,
  boardNoticeEvening: 2,
  /** Доска и полки: насколько охотнее заходят те, кто знает о киоске */
  boardPull: 0.12,
  shelvesPull: 0.04,
  /** Витринка: шанс докупить выпечку к кофе или чаю */
  pastryChance: 0.15,
  /** Полки: прибавка к привязанности за визит */
  shelvesLoyalty: 0.05,
  /** Без навеса в дождь очередь у окна короче на столько человек */
  rainQueue: 3,
} as const;
