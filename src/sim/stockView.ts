// Склад с двух сторон (GDD §13.4, блок 4): на сколько дней хватит ингредиента и сколько порций
// можно приготовить. Ингредиенты общие, поэтому порции разных позиций не складываются:
// «латте — 15» значит «если готовить только латте».
import type { DayReport } from './cafe';
import { INGREDIENTS, recipeOf, type IngredientId, type Stock } from './stock';

/** По скольким последним рабочим дням считаем расход */
export const USE_DAYS = 3;

/** Средний расход ингредиентов за рабочий день по последним дням (выходные и дни до открытия не считаем) */
export function dailyUse(reports: DayReport[], days = USE_DAYS): Partial<Record<IngredientId, number>> | null {
  const worked = reports.filter((r) => r.opened && !r.dayOff).slice(-days);
  if (worked.length === 0) return null;
  const total: Partial<Record<IngredientId, number>> = {};
  for (const r of worked) {
    for (const [itemId, n] of Object.entries(r.sold)) {
      for (const [id, q] of Object.entries(recipeOf(itemId)) as [IngredientId, number][]) total[id] = (total[id] ?? 0) + q * n;
    }
  }
  for (const id of Object.keys(total) as IngredientId[]) total[id] = total[id]! / worked.length;
  return total;
}

/** На сколько рабочих дней хватит: что лежит плюс что едет. null — не расходуется или расход неизвестен. */
export function daysLeft(stock: Stock, id: IngredientId, use: Partial<Record<IngredientId, number>> | null): number | null {
  const perDay = use?.[id] ?? 0;
  if (perDay <= 1e-9) return null;
  return (stock.qty(id) + (stock.pending[id] ?? 0)) / perDay;
}

export interface Cookable {
  itemId: string;
  /** Сколько порций, если готовить только эту позицию */
  portions: number;
  /** Во что упирается; null — позиции не нужны ингредиенты */
  limit: IngredientId | null;
  /** Сколько порций будет после утренней поставки */
  afterDelivery: number;
}

/** Сколько порций позиции можно сделать из того, что есть, и что кончится первым */
export function cookable(stock: Stock, itemId: string): Cookable {
  const recipe = Object.entries(recipeOf(itemId)) as [IngredientId, number][];
  let portions = Number.POSITIVE_INFINITY;
  let after = Number.POSITIVE_INFINITY;
  let limit: IngredientId | null = null;
  for (const [id, need] of recipe) {
    if (need <= 0) continue;
    const now = Math.floor((stock.qty(id) + 1e-9) / need);
    const later = Math.floor((stock.qty(id) + (stock.pending[id] ?? 0) + 1e-9) / need);
    if (now < portions) {
      portions = now;
      limit = id;
    }
    after = Math.min(after, later);
  }
  if (!Number.isFinite(portions)) return { itemId, portions: 0, limit: null, afterDelivery: 0 };
  return { itemId, portions, limit, afterDelivery: after };
}

/** В какие позиции меню идёт ингредиент */
export function usedIn(menuIds: string[], id: IngredientId): string[] {
  return menuIds.filter((m) => (recipeOf(m)[id] ?? 0) > 0);
}

/** Ингредиенты в порядке показа: сначала нужные меню, потом остальные */
export function ingredientOrder(menuIds: string[]): IngredientId[] {
  const need = INGREDIENTS.filter((i) => usedIn(menuIds, i.id).length > 0).map((i) => i.id);
  const rest = INGREDIENTS.filter((i) => !need.includes(i.id)).map((i) => i.id);
  return [...need, ...rest];
}
