// Вехи первой точки и улучшения, которые они открывают.
// Веха — понятная цель с прогрессом («неделя в плюсе: 4 из 7»). Часть вех открывает улучшение:
// его можно купить, и оно меняет возможности заведения, а не просто цифру.
import type { DayReport } from './cafe';
import type { PremisesId } from './economy';

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
const rub = (n: number): string => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString('ru-RU').replace(/\s/g, '\u00a0')}\u00a0₽`;

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
    title: 'Первая сотня гостей',
    hint: 'Обслужить 100 гостей',
    progress: (c) => [c.reports.reduce((s, r) => s + r.guests, 0), 100],
  },
  {
    id: 'week-plus',
    title: 'Неделя в\u00a0плюсе',
    hint: 'Прибыль за\u00a0последние 7 дней больше нуля',
    progress: (c) => {
      const w = lastWeek(c.reports);
      return [w && weekProfit(w) > 0 ? 1 : 0, 1];
    },
    now: (c) => {
      const w = lastWeek(c.reports);
      return w ? `сейчас ${rub(weekProfit(w))}` : null;
    },
  },
  {
    id: 'no-queue',
    title: 'Без очереди',
    hint: 'Будний день от\u00a030 гостей, и\u00a0никто не\u00a0ушёл из‑за очереди',
    progress: (c) => [c.reports.some(calmDay) ? 1 : 0, 1],
  },
  {
    id: 'no-waste',
    title: 'Бережливость',
    hint: 'За\u00a0неделю списали меньше 10\u00a0% закупленного',
    progress: (c) => {
      const w = lastWeek(c.reports);
      return [w && wasteShare(w) < WASTE_SHARE ? 1 : 0, 1];
    },
    now: (c) => {
      const w = lastWeek(c.reports);
      return w ? `сейчас ${Math.round(wasteShare(w) * 100)}\u00a0%` : null;
    },
  },
  {
    id: 'regulars',
    title: 'Свои люди',
    hint: '40 постоянных гостей: привыкли к\u00a0кафе и\u00a0заходили на\u00a0этой неделе',
    progress: (c) => [c.loyal, 40],
  },
  {
    id: 'cushion',
    title: 'Вложения вернулись',
    hint: 'В\u00a0кассе больше, чем было до\u00a0открытия',
    progress: (c) => [Math.max(0, Math.round(c.cash)), c.startCash],
  },
  {
    id: 'known',
    title: 'Узнаваемое место',
    hint: 'О\u00a0кафе знают 80\u00a0% жителей',
    progress: (c) => [c.aware, Math.ceil(c.population * 0.8)],
  },
];

export const milestone = (id: MilestoneId): Milestone => MILESTONES.find((m) => m.id === id)!;

export type UpgradeId = 'machine' | 'showcase' | 'interior';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  cost: number;
  effect: string;
  /** Какая веха открывает покупку */
  unlock: MilestoneId;
  /** Где возможно (интерьер — только там, где есть зал) */
  premises: PremisesId[];
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'machine',
    name: 'Вторая кофемашина',
    cost: 60_000,
    effect: 'Заказ готовится быстрее: 3\u00a0мин вместо 4, с\u00a0бариста\u00a0— 1,5 вместо 2',
    unlock: 'hundred',
    premises: ['cafe', 'kiosk'],
  },
  {
    id: 'showcase',
    name: 'Холодильная витрина',
    cost: 40_000,
    effect: 'Скоропорт хранится на\u00a0день дольше',
    unlock: 'week-plus',
    premises: ['cafe', 'kiosk'],
  },
  {
    id: 'interior',
    name: 'Уютный интерьер',
    cost: 80_000,
    effect: 'Сидящие гости чаще заказывают ещё, и\u00a0быстрее становятся постоянными',
    unlock: 'regulars',
    premises: ['cafe'],
  },
];

export const upgrade = (id: UpgradeId): Upgrade => UPGRADES.find((u) => u.id === id)!;

/** Эффекты улучшений — числа в одном месте */
export const UPGRADE_EFFECT = {
  /** Множитель времени приготовления */
  machineService: 0.75,
  showcaseShelfDays: 1,
  interiorExtra: 1.3,
  /** Прибавка к росту лояльности за визит */
  interiorLoyalty: 0.05,
} as const;
