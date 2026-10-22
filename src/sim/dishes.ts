// Своё блюдо (этап B2, GDD §5.1): основа + до двух добавок со склада.
// Рецепт целиком записан в id блюда — own:основа:добавка+добавка, — поэтому склад, вкус и себестоимость
// считаются из id без отдельного реестра. Название и цену выбирает игрок, их хранит кафе.
import type { ItemKind } from './cafe';
import type { Profile, TasteAxis } from './character';
import type { IngredientId } from './stock';

export type BaseId = 'milk-coffee' | 'black-coffee' | 'pastry' | 'toast' | 'soup' | 'hot' | 'tea' | 'lemonade';
export type AddInId = 'syrup' | 'chocolate' | 'honey' | 'spices' | 'double' | 'berries' | 'cheese' | 'ham';

export interface DishBase {
  id: BaseId;
  /** Как основа называется в конструкторе */
  name: string;
  /** С чего начинается название блюда по умолчанию */
  short: string;
  kind: ItemKind;
  recipe: Partial<Record<IngredientId, number>>;
  profile: Profile;
  /** Сколько минут сверх обычного обслуживания уходит на приготовление */
  prep: number;
  /** Цена похожей позиции из каталога — от неё считается предложенная цена */
  price: number;
  addIns: AddInId[];
}

export interface AddIn {
  id: AddInId;
  name: string;
  /** «с сиропом» — для названия блюда */
  with: string;
  ingredient: IngredientId;
  qty: number;
  delta: Partial<Record<TasteAxis, number>>;
}

const P = (sweet: number, strong: number, hearty: number, novel: number): Profile => ({ sweet, strong, hearty, novel });

export const BASES: readonly DishBase[] = [
  { id: 'milk-coffee', name: 'Кофе с молоком', short: 'Латте', kind: 'coffee', recipe: { beans: 1, milk: 1 }, profile: P(0.35, 0.5, 0.3, 0.15), prep: 0, price: 220, addIns: ['syrup', 'chocolate', 'honey', 'spices', 'double'] },
  { id: 'black-coffee', name: 'Чёрный кофе', short: 'Американо', kind: 'coffee', recipe: { beans: 1 }, profile: P(0, 0.85, 0.1, 0.1), prep: 0, price: 150, addIns: ['double', 'spices', 'syrup', 'honey'] },
  { id: 'pastry', name: 'Выпечка', short: 'Булочка', kind: 'snack', recipe: { bakery: 1 }, profile: P(0.4, 0, 0.4, 0.15), prep: 0.5, price: 160, addIns: ['chocolate', 'berries', 'cheese', 'honey', 'spices'] },
  { id: 'toast', name: 'Тост', short: 'Тост', kind: 'snack', recipe: { bakery: 1, kitchen: 0.3 }, profile: P(0.05, 0.15, 0.6, 0.2), prep: 1, price: 230, addIns: ['cheese', 'ham', 'berries', 'honey'] },
  { id: 'soup', name: 'Суп', short: 'Суп', kind: 'lunch', recipe: { kitchen: 1 }, profile: P(0.05, 0.2, 0.65, 0.15), prep: 1, price: 250, addIns: ['cheese', 'ham', 'spices'] },
  { id: 'hot', name: 'Горячее', short: 'Горячее', kind: 'lunch', recipe: { kitchen: 1.8 }, profile: P(0.1, 0.2, 0.95, 0.2), prep: 2, price: 360, addIns: ['cheese', 'ham', 'spices'] },
  { id: 'tea', name: 'Чай', short: 'Чай', kind: 'tea', recipe: { drinks: 1 }, profile: P(0.25, 0.25, 0.05, 0.1), prep: 0, price: 150, addIns: ['honey', 'berries', 'spices', 'syrup'] },
  { id: 'lemonade', name: 'Лимонад', short: 'Лимонад', kind: 'tea', recipe: { drinks: 2 }, profile: P(0.7, 0, 0, 0.4), prep: 0.5, price: 200, addIns: ['berries', 'syrup', 'spices'] },
];

export const ADDINS: readonly AddIn[] = [
  { id: 'syrup', name: 'Сироп', with: 'с сиропом', ingredient: 'syrup', qty: 1, delta: { sweet: 0.35, novel: 0.1 } },
  { id: 'chocolate', name: 'Шоколад', with: 'с шоколадом', ingredient: 'chocolate', qty: 1, delta: { sweet: 0.3, hearty: 0.15 } },
  { id: 'honey', name: 'Мёд', with: 'с мёдом', ingredient: 'honey', qty: 1, delta: { sweet: 0.25 } },
  { id: 'spices', name: 'Специи', with: 'со специями', ingredient: 'spices', qty: 1, delta: { novel: 0.35, strong: 0.1 } },
  { id: 'double', name: 'Двойной эспрессо', with: 'с двойным эспрессо', ingredient: 'beans', qty: 1, delta: { strong: 0.35 } },
  { id: 'berries', name: 'Ягоды', with: 'с ягодами', ingredient: 'berries', qty: 1, delta: { sweet: 0.15, novel: 0.25 } },
  { id: 'cheese', name: 'Сыр', with: 'с сыром', ingredient: 'cheese', qty: 1, delta: { hearty: 0.3, novel: 0.05 } },
  { id: 'ham', name: 'Ветчина', with: 'с ветчиной', ingredient: 'ham', qty: 1, delta: { hearty: 0.35 } },
];

/** Фирменное блюдо: если оно гостю по вкусу, конкурент переманивает его реже */
export const SIGNATURE_MATCH = 0.3;
export const DISH_EFFECT = { rivalPull: 0.5 };

/** Сколько своих блюд можно держать и сколько добавок в одном блюде */
export const MAX_OWN = 2;
export const MAX_ADDINS = 2;
/** Добавка прибавляет к приготовлению, мин */
export const ADDIN_PREP = 0.3;

export const base = (id: BaseId): DishBase => BASES.find((b) => b.id === id)!;
export const addIn = (id: AddInId): AddIn => ADDINS.find((a) => a.id === id)!;

export const isDish = (id: string): boolean => id.startsWith('own:');

/** id блюда из рецепта: добавки по алфавиту — одинаковый рецепт даёт одинаковый id */
export function dishId(baseId: BaseId, addIns: AddInId[]): string {
  return `own:${baseId}:${[...new Set(addIns)].sort().join('+')}`;
}

export function parseDish(id: string): { base: DishBase; addIns: AddIn[] } | null {
  if (!isDish(id)) return null;
  const [, b, list] = id.split(':');
  const found = BASES.find((x) => x.id === b);
  if (!found) return null;
  const addIns = (list ? list.split('+') : []).map((a) => ADDINS.find((x) => x.id === a)).filter((a): a is AddIn => !!a);
  return { base: found, addIns };
}

/** Можно ли собрать такое блюдо: добавки подходят к основе и их не больше двух */
export function validDish(baseId: BaseId, addIns: AddInId[]): boolean {
  const b = BASES.find((x) => x.id === baseId);
  if (!b) return false;
  const uniq = new Set(addIns);
  return uniq.size === addIns.length && uniq.size <= MAX_ADDINS && addIns.every((a) => b.addIns.includes(a));
}

export function dishRecipe(id: string): Partial<Record<IngredientId, number>> | null {
  const d = parseDish(id);
  if (!d) return null;
  const r: Partial<Record<IngredientId, number>> = { ...d.base.recipe };
  for (const a of d.addIns) r[a.ingredient] = (r[a.ingredient] ?? 0) + a.qty;
  return r;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function dishProfile(id: string): Profile | null {
  const d = parseDish(id);
  if (!d) return null;
  const p = { ...d.base.profile };
  for (const a of d.addIns) for (const [axis, v] of Object.entries(a.delta) as [TasteAxis, number][]) p[axis] = clamp01(p[axis] + v);
  return p;
}

export function dishKind(id: string): ItemKind | null {
  return parseDish(id)?.base.kind ?? null;
}

/** Лишние минуты на приготовление: основа + каждая добавка */
export function dishPrep(id: string): number {
  const d = parseDish(id);
  return d ? d.base.prep + ADDIN_PREP * d.addIns.length : 0;
}

/** Название по умолчанию: «Тост с сыром и ветчиной» */
export function defaultDishName(id: string): string {
  const d = parseDish(id);
  if (!d) return id;
  if (!d.addIns.length) return d.base.short;
  const withs = d.addIns.map((a) => a.with);
  // «с сыром и с ветчиной» → «с сыром и ветчиной»
  const rest = withs.slice(1).map((w) => w.replace(/^со? /, ''));
  return `${d.base.short} ${[withs[0], ...rest].join(' и ')}`;
}
