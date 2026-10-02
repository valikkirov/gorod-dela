// Склад: ингредиенты, сроки годности, закупка с доставкой утром, оптовые скидки.
export type IngredientId = 'beans' | 'milk' | 'bakery' | 'kitchen' | 'drinks' | 'bar';

export interface Ingredient {
  id: IngredientId;
  name: string;
  /** Цена порции у поставщика без скидки, ₽ */
  unitCost: number;
  /** Сколько дней хранится (включая день доставки); null — не портится */
  shelfDays: number | null;
}

export const INGREDIENTS: readonly Ingredient[] = [
  { id: 'beans', name: 'Кофейное зерно', unitCost: 30, shelfDays: null },
  { id: 'milk', name: 'Молоко', unitCost: 20, shelfDays: 3 },
  { id: 'bakery', name: 'Выпечка', unitCost: 60, shelfDays: 1 },
  { id: 'kitchen', name: 'Продукты для кухни', unitCost: 80, shelfDays: 2 },
  { id: 'drinks', name: 'Чай и лимонад', unitCost: 20, shelfDays: null },
  { id: 'bar', name: 'Пиво и сидр', unitCost: 110, shelfDays: null },
];

export const ingredient = (id: IngredientId): Ingredient => INGREDIENTS.find((i) => i.id === id)!;

/** Сколько порций каждого ингредиента уходит на позицию меню */
export const RECIPES: Record<string, Partial<Record<IngredientId, number>>> = {
  americano: { beans: 1 },
  cappuccino: { beans: 1, milk: 1 },
  latte: { beans: 1, milk: 1.25 },
  raf: { beans: 1, milk: 2 },
  croissant: { bakery: 1 },
  sandwich: { bakery: 1, kitchen: 0.5 },
  syrniki: { kitchen: 1, milk: 0.5 },
  soup: { kitchen: 1 },
  lunch: { kitchen: 2 },
  tea: { drinks: 1, bakery: 0.5 },
  lemonade: { drinks: 2 },
  beer: { bar: 1 },
  cider: { bar: 1.1 },
};

/** Себестоимость позиции по базовым ценам поставщика */
export function recipeCost(itemId: string): number {
  const r = RECIPES[itemId] ?? {};
  return Math.round(
    (Object.entries(r) as [IngredientId, number][]).reduce((s, [id, q]) => s + ingredient(id).unitCost * q, 0),
  );
}

/** Опт: от 100 порций −10 %, от 300 — −20 % */
export function wholesaleDiscount(qty: number): number {
  if (qty >= 300) return 0.2;
  if (qty >= 100) return 0.1;
  return 0;
}

export function orderPrice(id: IngredientId, qty: number): number {
  return Math.round(ingredient(id).unitCost * qty * (1 - wholesaleDiscount(qty)));
}

interface Batch {
  qty: number;
  /** Последний день, когда партию ещё можно продавать */
  lastDay: number;
  /** Сколько заплатили за порцию — чтобы честно посчитать списание */
  unitPaid: number;
}

export interface Delivery {
  cost: number;
  items: Partial<Record<IngredientId, number>>;
}

export interface WriteOff {
  value: number;
  items: Partial<Record<IngredientId, number>>;
}

/** Стартовый запас и автозаказ при открытии — чтобы первый день не провалился из-за склада */
export const STARTER_KEEP_WEEKEND: Record<IngredientId, number> = {
  beans: 40,
  milk: 15,
  bakery: 8,
  kitchen: 10,
  drinks: 15,
  bar: 0,
};

export const STARTER_KEEP: Record<IngredientId, number> = {
  beans: 60,
  milk: 15,
  bakery: 8,
  kitchen: 40,
  drinks: 15,
  bar: 0,
};

export interface StockSave {
  batches: Partial<Record<IngredientId, { qty: number; lastDay: number | null; unitPaid: number }[]>>;
  pending: Partial<Record<IngredientId, number>>;
  keep: Record<IngredientId, number>;
  keepWeekend: Record<IngredientId, number>;
}

export class Stock {
  private batches = new Map<IngredientId, Batch[]>();
  /** Заказы, которые привезут в 6:00 */
  pending: Partial<Record<IngredientId, number>> = {};
  /** Автозаказ: держать столько порций (0 — выключен) */
  keep: Record<IngredientId, number> = { beans: 0, milk: 0, bakery: 0, kitchen: 0, drinks: 0, bar: 0 };
  /** Отдельный уровень на выходные: в субботу ланчей не будет */
  keepWeekend: Record<IngredientId, number> = { beans: 0, milk: 0, bakery: 0, kitchen: 0, drinks: 0, bar: 0 };

  toJSON(): StockSave {
    const batches: StockSave['batches'] = {};
    for (const [id, list] of this.batches) {
      // Infinity в JSON не живёт — «не портится» храним как null
      batches[id] = list.map((b) => ({ ...b, lastDay: Number.isFinite(b.lastDay) ? b.lastDay : null }));
    }
    return { batches, pending: { ...this.pending }, keep: { ...this.keep }, keepWeekend: { ...this.keepWeekend } };
  }

  load(d: StockSave): void {
    this.batches = new Map();
    for (const [id, list] of Object.entries(d.batches) as [IngredientId, StockSave['batches'][IngredientId]][]) {
      this.batches.set(
        id,
        (list ?? []).map((b) => ({ ...b, lastDay: b.lastDay ?? Number.POSITIVE_INFINITY })),
      );
    }
    this.pending = { ...d.pending };
    this.keep = { ...this.keep, ...d.keep };
    this.keepWeekend = { ...this.keepWeekend, ...d.keepWeekend };
  }

  qty(id: IngredientId): number {
    return (this.batches.get(id) ?? []).reduce((s, b) => s + b.qty, 0);
  }

  /** Сколько порций испортится в конце сегодняшнего дня */
  expiringToday(id: IngredientId, day: number): number {
    return (this.batches.get(id) ?? []).filter((b) => b.lastDay <= day).reduce((s, b) => s + b.qty, 0);
  }

  canMake(itemId: string): boolean {
    const r = RECIPES[itemId] ?? {};
    return (Object.entries(r) as [IngredientId, number][]).every(([id, q]) => this.qty(id) >= q - 1e-9);
  }

  /** Списать ингредиенты на одну порцию (сначала самые старые партии) */
  use(itemId: string): void {
    const r = RECIPES[itemId] ?? {};
    for (const [id, need] of Object.entries(r) as [IngredientId, number][]) {
      let left = need;
      const list = this.batches.get(id) ?? [];
      for (const b of list) {
        const take = Math.min(b.qty, left);
        b.qty -= take;
        left -= take;
        if (left <= 1e-9) break;
      }
      this.batches.set(
        id,
        list.filter((b) => b.qty > 1e-9),
      );
    }
  }

  order(id: IngredientId, qty: number): void {
    if (qty <= 0) return;
    this.pending[id] = (this.pending[id] ?? 0) + Math.round(qty);
  }

  cancel(id: IngredientId): void {
    delete this.pending[id];
  }

  /** Привезти заказы. Цена — с оптовой скидкой на объём каждой позиции. */
  deliver(day: number): Delivery {
    const out: Delivery = { cost: 0, items: {} };
    for (const [id, qty] of Object.entries(this.pending) as [IngredientId, number][]) {
      if (!qty) continue;
      const ing = ingredient(id);
      const cost = orderPrice(id, qty);
      const list = this.batches.get(id) ?? [];
      list.push({
        qty,
        lastDay: ing.shelfDays === null ? Number.POSITIVE_INFINITY : day + ing.shelfDays - 1,
        unitPaid: cost / qty,
      });
      this.batches.set(id, list);
      out.cost += cost;
      out.items[id] = qty;
    }
    this.pending = {};
    return out;
  }

  /** Конец дня: испорченное — в списание */
  expire(day: number): WriteOff {
    const out: WriteOff = { value: 0, items: {} };
    for (const [id, list] of this.batches) {
      const spoiled = list.filter((b) => b.lastDay <= day);
      if (spoiled.length === 0) continue;
      const qty = spoiled.reduce((s, b) => s + b.qty, 0);
      if (qty > 1e-9) {
        out.items[id] = Math.round(qty * 10) / 10;
        out.value += spoiled.reduce((s, b) => s + b.qty * b.unitPaid, 0);
      }
      this.batches.set(
        id,
        list.filter((b) => b.lastDay > day),
      );
    }
    out.value = Math.round(out.value);
    return out;
  }

  /** Автозаказ: добрать до уровня «держать N» с учётом того, что уже едет. Уровень — по типу завтрашнего дня. */
  autoOrder(weekend: boolean): void {
    const levels = weekend ? this.keepWeekend : this.keep;
    for (const ing of INGREDIENTS) {
      const want = levels[ing.id] - this.qty(ing.id) - (this.pending[ing.id] ?? 0);
      if (want > 0) this.order(ing.id, Math.ceil(want));
    }
  }

  /** Положить на склад сразу (стартовый запас при открытии) */
  addNow(id: IngredientId, qty: number, day: number, unitPaid: number): void {
    const ing = ingredient(id);
    const list = this.batches.get(id) ?? [];
    list.push({ qty, lastDay: ing.shelfDays === null ? Number.POSITIVE_INFINITY : day + ing.shelfDays - 1, unitPaid });
    this.batches.set(id, list);
  }
}
