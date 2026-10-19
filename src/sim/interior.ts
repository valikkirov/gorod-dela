// Зал кафе: мебель и декор (GDD 5.5). Места ограничивают, сколько гостей сидит одновременно,
// уют — сколько они заказывают ещё и как быстро становятся постоянными, а отдельные вещи
// нравятся своим жителям. Можно поставить готовую комплектацию или обставить зал самому.
import type { ResidentKind } from './residents';

/** Куда в зале что ставится */
export type SlotKind = 'table' | 'corner' | 'small' | 'window' | 'wall' | 'rug';

export type FurnitureId =
  | 'table2'
  | 'table4'
  | 'sofa'
  | 'bar'
  | 'bookshelf'
  | 'games'
  | 'monstera'
  | 'plant'
  | 'floorlamp'
  | 'picture'
  | 'clock'
  | 'rug';

export interface Furniture {
  id: FurnitureId;
  name: string;
  /** Куда можно поставить */
  slots: SlotKind[];
  seats: number;
  cozy: number;
  cost: number;
  /** Кому особенно нравится: такие гости быстрее становятся постоянными */
  likes: ResidentKind[];
}

export const FURNITURE: Furniture[] = [
  { id: 'table2', name: 'Столик на двоих', slots: ['table'], seats: 2, cozy: 0, cost: 6_000, likes: [] },
  { id: 'table4', name: 'Стол на четверых', slots: ['table'], seats: 4, cozy: 0, cost: 11_000, likes: ['office'] },
  { id: 'sofa', name: 'Мягкий диван', slots: ['table', 'corner'], seats: 2, cozy: 2, cost: 15_000, likes: ['pensioner'] },
  { id: 'bar', name: 'Стойка у окна с розетками', slots: ['window'], seats: 2, cozy: 0, cost: 12_000, likes: ['remote', 'student'] },
  { id: 'bookshelf', name: 'Книжный шкаф', slots: ['corner'], seats: 0, cozy: 2, cost: 9_000, likes: ['pensioner', 'student'] },
  { id: 'games', name: 'Полка с настолками', slots: ['corner'], seats: 0, cozy: 1, cost: 7_000, likes: ['youth'] },
  { id: 'monstera', name: 'Большая монстера', slots: ['corner', 'small'], seats: 0, cozy: 2, cost: 5_000, likes: [] },
  { id: 'plant', name: 'Цветок в горшке', slots: ['small'], seats: 0, cozy: 1, cost: 2_000, likes: [] },
  { id: 'floorlamp', name: 'Торшер', slots: ['small'], seats: 0, cozy: 1, cost: 4_000, likes: [] },
  { id: 'picture', name: 'Картина', slots: ['wall'], seats: 0, cozy: 1, cost: 3_000, likes: [] },
  { id: 'clock', name: 'Часы', slots: ['wall'], seats: 0, cozy: 1, cost: 2_000, likes: [] },
  { id: 'rug', name: 'Коврик', slots: ['rug'], seats: 0, cozy: 1, cost: 3_000, likes: [] },
];

export const furniture = (id: FurnitureId): Furniture => FURNITURE.find((f) => f.id === id)!;

/** Места в зале: четыре под столы, угол, два маленьких, окно, две стены и коврик */
export const HALL_SLOTS: { id: string; kind: SlotKind }[] = [
  { id: 'rug', kind: 'rug' },
  { id: 'corner', kind: 'corner' },
  { id: 'wall-1', kind: 'wall' },
  { id: 'wall-2', kind: 'wall' },
  { id: 'window', kind: 'window' },
  { id: 'table-1', kind: 'table' },
  { id: 'table-2', kind: 'table' },
  { id: 'table-3', kind: 'table' },
  { id: 'table-4', kind: 'table' },
  { id: 'small-1', kind: 'small' },
  { id: 'small-2', kind: 'small' },
];

export type Layout = Partial<Record<string, FurnitureId>>;

export type PresetId = 'standard' | 'cozy' | 'comfort' | 'premium';

export interface Preset {
  id: PresetId;
  name: string;
  hint: string;
  layout: Layout;
}

export const PRESETS: Preset[] = [
  {
    id: 'standard',
    name: 'Стандарт',
    hint: 'Два столика. Входит в открытие',
    layout: { 'table-1': 'table2', 'table-2': 'table2' },
  },
  {
    id: 'cozy',
    name: 'Уют',
    hint: 'Диван, картина, цветы и коврик',
    layout: { 'table-1': 'table2', 'table-2': 'table2', corner: 'sofa', 'wall-1': 'picture', 'small-1': 'plant', rug: 'rug' },
  },
  {
    id: 'comfort',
    name: 'Комфорт',
    hint: 'Больше мест, стойка с розетками для ноутбуков',
    layout: {
      'table-1': 'table2',
      'table-2': 'table4',
      corner: 'sofa',
      window: 'bar',
      'wall-1': 'picture',
      'wall-2': 'clock',
      'small-1': 'monstera',
      'small-2': 'floorlamp',
      rug: 'rug',
    },
  },
  {
    id: 'premium',
    name: 'Премиум',
    hint: 'Полный зал: книжный шкаф, диван, стол на четверых и всё для уюта',
    layout: {
      'table-1': 'table2',
      'table-2': 'table4',
      'table-3': 'table2',
      'table-4': 'sofa',
      corner: 'bookshelf',
      window: 'bar',
      'wall-1': 'picture',
      'wall-2': 'clock',
      'small-1': 'monstera',
      'small-2': 'floorlamp',
      rug: 'rug',
    },
  },
];

export const preset = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

export const INTERIOR = {
  /** Какая доля цены возвращается при продаже */
  sellShare: 0.5,
  /** Уют, при котором эффект полный */
  cozyFull: 10,
  /** Сколько прибавляет полный уют к шансу заказать ещё (×) */
  extraBoost: 0.3,
  /** Прибавка к лояльности за визит при полном уюте */
  loyalty: 0.05,
  /** Прибавка к лояльности, если в зале есть вещь, которая нравится гостю */
  liked: 0.03,
} as const;

export function canPlace(slotId: string, id: FurnitureId): boolean {
  const slot = HALL_SLOTS.find((s) => s.id === slotId);
  return !!slot && furniture(id).slots.includes(slot.kind);
}

export class Interior {
  layout: Layout = {};

  get seats(): number {
    return this.items().reduce((sum, f) => sum + f.seats, 0);
  }

  get cozy(): number {
    return this.items().reduce((sum, f) => sum + f.cozy, 0);
  }

  /** 0…1 — насколько полно работает уют */
  get cozyLevel(): number {
    return Math.min(1, this.cozy / INTERIOR.cozyFull);
  }

  likes(kind: ResidentKind): boolean {
    return this.items().some((f) => f.likes.includes(kind));
  }

  items(): Furniture[] {
    return Object.values(this.layout)
      .filter((id): id is FurnitureId => !!id)
      .map(furniture);
  }

  /** Сколько вернут за вещь при продаже */
  static refund(id: FurnitureId): number {
    return Math.round(furniture(id).cost * INTERIOR.sellShare);
  }

  /** Во что обойдётся комплектация: новое покупается, лишнее продаётся, совпавшее остаётся */
  presetCost(id: PresetId): number {
    const target = preset(id).layout;
    let cost = 0;
    for (const { id: slot } of HALL_SLOTS) {
      const now = this.layout[slot];
      const next = target[slot];
      if (now === next) continue;
      if (next) cost += furniture(next).cost;
      if (now) cost -= Interior.refund(now);
    }
    return cost;
  }

  /** Совпадает ли зал с комплектацией */
  matches(id: PresetId): boolean {
    const target = preset(id).layout;
    return HALL_SLOTS.every(({ id: slot }) => (this.layout[slot] ?? null) === (target[slot] ?? null));
  }

  toJSON(): Layout {
    return { ...this.layout };
  }

  load(layout: Layout | undefined): void {
    this.layout = {};
    for (const [slot, id] of Object.entries(layout ?? {})) if (id && canPlace(slot, id)) this.layout[slot] = id;
  }
}
