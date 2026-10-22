// Спрос: когда у жителя возникает желание зайти и как он решает.
// Логика из GDD §4.2: расстояние, цена, (позже — качество, атмосфера, отзывы), лояльность.
import type { ItemKind, MenuItem, RejectReason } from './cafe';
import { FAVORITE_MATCH, TASTE, tasteMatch } from './character';
import { hm } from './clock';
import type { Resident, ResidentKind, ScheduleEntry } from './residents';
import type { Rng } from './rng';
import { WEATHER_WANT, type WeatherKind } from './weather';
import type { Point } from './world';

export type WantKind = ItemKind;

export const WANT_LABEL: Record<WantKind, string> = {
  coffee: 'кофе',
  lunch: 'обед',
  tea: 'чай',
  snack: 'перекус',
  bar: 'выпить',
};

export interface Want {
  kind: WantKind;
  /** stopover — зайти по пути и идти дальше; replace — провести время в кафе вместо планов */
  mode: 'stopover' | 'replace';
  /** Сколько минут сидит после покупки */
  dwell: number;
}

/** Готовность платить (₽) за желание — у каждого типа жителя своя */
export const BASE_BUDGET: Record<ResidentKind, Record<WantKind, number>> = {
  office: { coffee: 200, lunch: 420, snack: 180, tea: 160, bar: 350 },
  student: { coffee: 160, lunch: 280, snack: 150, tea: 120, bar: 280 },
  pensioner: { coffee: 120, lunch: 250, snack: 120, tea: 170, bar: 200 },
  remote: { coffee: 230, lunch: 400, snack: 200, tea: 180, bar: 330 },
  shopkeeper: { coffee: 150, lunch: 300, snack: 150, tea: 130, bar: 280 },
  youth: { coffee: 220, lunch: 320, snack: 200, tea: 170, bar: 360 },
  nightworker: { coffee: 170, lunch: 300, snack: 220, tea: 140, bar: 250 },
  passenger: { coffee: 190, lunch: 350, snack: 170, tea: 150, bar: 300 },
  visitor: { coffee: 240, lunch: 420, snack: 220, tea: 190, bar: 380 },
};

/** Какие позиции меню закрывают желание */
const ACCEPTS: Record<WantKind, ItemKind[]> = {
  coffee: ['coffee'],
  lunch: ['lunch'],
  tea: ['tea', 'coffee'],
  snack: ['snack', 'coffee'],
  bar: ['bar'],
};

interface WantRule {
  test: (r: Resident, entry: ScheduleEntry, prev: ScheduleEntry | undefined) => boolean;
  chance: Partial<Record<ResidentKind, number>>;
  want: Want;
}

const MORNING_END = hm(11);
const EVENING_START = hm(16);
const NIGHT_SHIFT = hm(20);

const RULES: WantRule[] = [
  {
    // Кофе по дороге на работу или учёбу
    test: (_r, e) => (e.activity === 'work' || e.activity === 'study') && e.start < MORNING_END,
    chance: { office: 0.55, student: 0.35, shopkeeper: 0.4, passenger: 0.5 },
    want: { kind: 'coffee', mode: 'stopover', dwell: 0 },
  },
  {
    // Кофе перед ночной сменой
    test: (_r, e) => e.activity === 'work' && e.start >= NIGHT_SHIFT,
    chance: { nightworker: 0.6 },
    want: { kind: 'coffee', mode: 'stopover', dwell: 0 },
  },
  {
    // Обед — офисные идут в «Продукты», ночная смена перекусывает около 2:00
    test: (_r, e) => e.activity === 'lunch',
    chance: { office: 1, nightworker: 0.8 },
    want: { kind: 'lunch', mode: 'replace', dwell: 20 },
  },
  {
    // Вечер с друзьями — бар
    test: (_r, e) => e.activity === 'night',
    chance: { youth: 0.75, student: 0.5, visitor: 0.75 },
    want: { kind: 'bar', mode: 'replace', dwell: 60 },
  },
  {
    // Завтрак после ночной смены
    test: (_r, e, prev) => e.activity === 'home' && prev?.activity === 'work' && e.start < MORNING_END,
    chance: { nightworker: 0.4 },
    want: { kind: 'snack', mode: 'stopover', dwell: 0 },
  },
  {
    test: (_r, e) => e.activity === 'walk',
    chance: { pensioner: 0.5, visitor: 0.15 },
    want: { kind: 'tea', mode: 'replace', dwell: 30 },
  },
  {
    // Посидеть с ноутбуком или с друзьями
    test: (_r, e) => e.activity === 'walk',
    chance: { remote: 0.6, student: 0.3, youth: 0.5, office: 0.35, visitor: 0.6 },
    want: { kind: 'coffee', mode: 'replace', dwell: 40 },
  },
  {
    // Перекус по дороге домой
    test: (_r, e, prev) =>
      e.activity === 'home' && e.start >= EVENING_START && (prev?.activity === 'work' || prev?.activity === 'study'),
    chance: { office: 0.2, student: 0.3, passenger: 0.25 },
    want: { kind: 'snack', mode: 'stopover', dwell: 0 },
  },
];

/** Возникает ли желание при смене занятия. Бросок кубика — внутри. */
export function rollWant(
  rng: Rng,
  r: Resident,
  entry: ScheduleEntry,
  prev: ScheduleEntry | undefined,
  weather: WeatherKind = 'sunny',
  weekend = false,
): Want | null {
  for (const rule of RULES) {
    const chance = rule.chance[r.kind];
    if (chance === undefined || !rule.test(r, entry, prev)) continue;
    // В выходные есть время посидеть — «посидеть в кафе» случается чаще
    const free = weekend && rule.want.mode === 'replace' ? 1.5 : 1;
    const mult = (WEATHER_WANT[weather][rule.want.kind] ?? 1) * free;
    return rng.chance(Math.min(1, chance * mult)) ? rule.want : null;
  }
  return null;
}

export interface Decision {
  day: number;
  minute: number;
  want: WantKind;
  visited: boolean;
  reason?: RejectReason;
  itemId?: string;
  price?: number;
  /** Сколько был готов заплатить */
  budget: number;
}

const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export interface Offer {
  item: MenuItem | null;
  pPrice: number;
  pRoute: number;
  /** −1…1: насколько выбранная позиция во вкусе жителя */
  match: number;
  p: number;
}

/** Насколько житель склонен зайти: цена × крюк × лояльность */
export function evaluate(
  r: Resident,
  want: Want,
  menu: MenuItem[],
  from: Point,
  cafeDoor: Point,
  goalDoor: Point,
  weather: WeatherKind = 'sunny',
): Offer {
  const budget = r.budget[want.kind];
  const kinds = ACCEPTS[want.kind];
  const c = r.character;
  // Цена на 30 % ниже ожиданий — точно да, на 35 % выше — точно нет; экономный отсекает переплату раньше
  const top = 1.42 - 0.15 * c.thrift;
  // В жару «чай» превращается в лимонад
  const favorite = weather === 'hot' && want.kind === 'tea' ? 'lemonade' : r.favorites[want.kind];
  const isFav = (m: MenuItem) => m.id === favorite;
  const matchOf = (m: MenuItem) => (isFav(m) ? Math.max(FAVORITE_MATCH, tasteMatch(c, m.id)) : tasteMatch(c, m.id));
  // За то, что по вкусу, готов заплатить больше, за то, что не по вкусу, — меньше
  const pFor = (m: MenuItem) => clamp((top - m.price / (budget * (1 + TASTE.budget * matchOf(m)))) / (top - 0.7), 0, 1);
  // Без любимой позиции житель берёт другую, но с меньшей охотой; нелюбопытный — с ещё меньшей.
  // Позиция по вкусу не хуже любимой
  const other = 0.95 - 0.2 * (1 - c.curiosity);
  const suits = (m: MenuItem) => isFav(m) || tasteMatch(c, m.id) >= FAVORITE_MATCH;
  const appeal = (m: MenuItem) => pFor(m) * (suits(m) ? 1 : other) * (1 + TASTE.weight * matchOf(m));
  // Выбирает то, ради чего охотнее всего зайдёт: основная категория, цена и вкус; привычка чуть перевешивает
  const habit = 0.12 * (1 - c.curiosity);
  const rank = (m: MenuItem) => (m.kind === kinds[0] ? 2 : 0) + appeal(m) + (isFav(m) ? habit : 0);
  let item: MenuItem | null = null;
  for (const m of menu) {
    if (!kinds.includes(m.kind)) continue;
    if (item === null || rank(m) > rank(item)) item = m;
  }
  const pPrice = item ? pFor(item) * (suits(item) ? 1 : other) : 0;
  // Крюк: насколько дальше идти через кафе, чем сразу к цели; торопливый крюка не любит
  const detour =
    want.mode === 'stopover'
      ? manhattan(from, cafeDoor) + manhattan(cafeDoor, goalDoor) - manhattan(from, goalDoor)
      : manhattan(from, cafeDoor) - manhattan(from, goalDoor);
  const reach = 700 * (1.25 - 0.5 * c.hurry);
  const pRoute = clamp(1 - Math.max(0, detour) / reach, 0.15, 1);
  const match = item ? matchOf(item) : 0;
  const pTaste = 1 + TASTE.weight * match;
  const p = item ? pPrice * pRoute * pTaste * (FOCUS.base + r.loyalty) * focusFactor(menu, item.kind) : 0;
  return { item, pPrice, pRoute, match, p };
}

/**
 * Понятный формат привлекает сильнее: «кофейня», «бар», «столовая» лучше, чем «всё подряд».
 * Узкое меню (1–2 категории) — плюс, 4–5 категорий — минус; выбор внутри категории (3+ позиции) — плюс.
 */
export const FOCUS = {
  /** Базовая охота зайти у незнакомого с кафе жителя (лояльность прибавляется) */
  base: 1.0,
  /** Множитель за число категорий в меню: 1–2, 3, 4, 5 */
  breadth: [1.4, 1.2, 0.85, 0.6],
  /** За выбор внутри категории (3+ позиции) */
  depth: 1.15,
};

export function focusFactor(menu: MenuItem[], kind: ItemKind): number {
  const categories = new Set(menu.map((m) => m.kind)).size;
  const depth = menu.filter((m) => m.kind === kind).length;
  const breadth = FOCUS.breadth[Math.min(3, Math.max(0, categories - 2))];
  return breadth * (depth >= 3 ? FOCUS.depth : 1);
}

/** Почему житель не зашёл — объясняем честно, без «дорого» при нормальной цене */
export function rejectReason(o: Offer, budget: number): RejectReason {
  if (!o.item) return 'no-item';
  if (o.item.price > budget) return 'expensive';
  if (o.match <= TASTE.dislike) return 'taste';
  if (o.pRoute < 0.7) return 'off-route';
  return 'mood';
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
