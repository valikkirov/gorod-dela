// Зал кафе: мебель и декор (GDD 5.5). Места ограничивают, сколько гостей сидит одновременно,
// уют — сколько они заказывают ещё и как быстро становятся постоянными, а отдельные вещи
// нравятся своим жителям. Можно поставить готовую комплектацию или обставить зал самому.
import type { ResidentKind } from './residents';

import { L } from './i18n';
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
  | 'rug'
  | 'walls-home'
  | 'walls-loft'
  | 'walls-scandi'
  | 'walls-classic'
  | 'floor-home'
  | 'floor-loft'
  | 'floor-scandi'
  | 'floor-classic'
  | 'neon'
  | 'pendants'
  | 'rack'
  | 'paperlamp'
  | 'mirror'
  | 'chandelier'
  | 'samovar'
  | 'cat'
  | 'tree'
  | 'garland'
  // Зал бистро
  | 'stools'
  | 'ficus'
  | 'commune'
  | 'pair4'
  | 'booth'
  | 'cooler'
  | 'palm'
  | 'coatstand'
  | 'herbs'
  | 'poster'
  | 'menuboard'
  | 'tv';

/** Какой зал: у кафе — уютная кофейня, у бистро — обеденный зал с раздачей. Места, мебель и комплектации свои */
export type HallKind = 'cafe' | 'bistro';

/** Стиль зала (этап 2 зала): отделка и фирменные вещи одного стиля нравятся своей аудитории */
export type StyleId = 'home' | 'loft' | 'scandi' | 'classic';

export interface HallStyle {
  id: StyleId;
  name: string;
  /** Кому нравится; у «Как дома» — всем, но вдвое слабее */
  audience: ResidentKind[] | 'all';
}

export const STYLES: HallStyle[] = [
  { id: 'home', name: L('Как дома'), audience: 'all' },
  { id: 'loft', name: L('Лофт'), audience: ['youth', 'remote', 'student'] },
  { id: 'scandi', name: L('Скандинавский'), audience: ['office', 'remote'] },
  { id: 'classic', name: L('Классика'), audience: ['pensioner', 'visitor'] },
];

export const hallStyle = (id: StyleId): HallStyle => STYLES.find((s) => s.id === id)!;

/** Насколько стиль близок жителю: 1 — своя аудитория, homeShare — «Как дома», 0 — не его */
function audienceShare(s: HallStyle, kind: ResidentKind): number {
  if (s.audience === 'all') return INTERIOR.homeShare;
  return s.audience.includes(kind) ? 1 : 0;
}

export interface Furniture {
  id: FurnitureId;
  name: string;
  seats: number;
  cozy: number;
  cost: number;
  /** Кому особенно нравится: такие гости быстрее становятся постоянными */
  likes: ResidentKind[];
  /** Метка стиля: отделка и фирменные вещи */
  style?: StyleId;
}

export const FURNITURE: Furniture[] = [
  { id: 'table2', name: L('Столик на двоих'), seats: 2, cozy: 0, cost: 1_500, likes: [] },
  { id: 'table4', name: L('Стол на четверых'), seats: 4, cozy: 0, cost: 2_500, likes: ['office'] },
  { id: 'sofa', name: L('Мягкий диван'), seats: 2, cozy: 2, cost: 4_000, likes: ['pensioner'] },
  { id: 'bar', name: L('Стойка у окна с розетками'), seats: 3, cozy: 0, cost: 3_000, likes: ['remote', 'student'] },
  { id: 'bookshelf', name: L('Книжный шкаф'), seats: 0, cozy: 2, cost: 2_500, likes: ['pensioner', 'student'] },
  { id: 'games', name: L('Полка с настолками'), seats: 0, cozy: 1, cost: 2_000, likes: ['youth'] },
  { id: 'monstera', name: L('Большая монстера'), seats: 0, cozy: 2, cost: 1_200, likes: [] },
  { id: 'plant', name: L('Цветок в горшке'), seats: 0, cozy: 1, cost: 500, likes: [] },
  { id: 'floorlamp', name: L('Торшер'), seats: 0, cozy: 1, cost: 1_000, likes: [] },
  { id: 'picture', name: L('Картина'), seats: 0, cozy: 1, cost: 800, likes: [] },
  { id: 'clock', name: L('Часы'), seats: 0, cozy: 1, cost: 600, likes: [] },
  { id: 'rug', name: L('Коврик'), seats: 0, cozy: 1, cost: 800, likes: [] },
  // Отделка: стены и пол есть всегда, их можно только заменить
  { id: 'walls-home', name: L('Обои в\u00a0мелкий цветок'), seats: 0, cozy: 0, cost: 6_000, likes: [], style: 'home' },
  { id: 'walls-loft', name: L('Красный кирпич'), seats: 0, cozy: 0, cost: 6_000, likes: [], style: 'loft' },
  { id: 'walls-scandi', name: L('Белая штукатурка'), seats: 0, cozy: 0, cost: 5_500, likes: [], style: 'scandi' },
  { id: 'walls-classic', name: L('Зелёные панели с\u00a0молдингами'), seats: 0, cozy: 0, cost: 7_000, likes: [], style: 'classic' },
  { id: 'floor-home', name: L('Тёплый паркет'), seats: 0, cozy: 0, cost: 5_000, likes: [], style: 'home' },
  { id: 'floor-loft', name: L('Бетонный пол'), seats: 0, cozy: 0, cost: 5_000, likes: [], style: 'loft' },
  { id: 'floor-scandi', name: L('Светлый дуб'), seats: 0, cozy: 0, cost: 5_500, likes: [], style: 'scandi' },
  { id: 'floor-classic', name: L('Шахматная плитка'), seats: 0, cozy: 0, cost: 6_000, likes: [], style: 'classic' },
  // Фирменные вещи стилей
  { id: 'neon', name: L('Неоновая надпись'), seats: 0, cozy: 1, cost: 3_000, likes: [], style: 'loft' },
  { id: 'pendants', name: L('Лампы-лампочки над столами'), seats: 0, cozy: 1, cost: 2_500, likes: [], style: 'loft' },
  { id: 'rack', name: L('Белый стеллаж с\u00a0посудой'), seats: 0, cozy: 1, cost: 3_000, likes: [], style: 'scandi' },
  { id: 'paperlamp', name: L('Бумажный абажур'), seats: 0, cozy: 1, cost: 2_000, likes: [], style: 'scandi' },
  { id: 'mirror', name: L('Зеркало в\u00a0раме'), seats: 0, cozy: 1, cost: 3_000, likes: [], style: 'classic' },
  { id: 'chandelier', name: L('Люстра'), seats: 0, cozy: 1, cost: 3_500, likes: [], style: 'classic' },
  { id: 'samovar', name: L('Полка с\u00a0самоваром'), seats: 0, cozy: 1, cost: 4_000, likes: [], style: 'home' },
  { id: 'tree', name: L('Ёлка с\u00a0игрушками'), seats: 0, cozy: 2, cost: 4_000, likes: [] },
  { id: 'garland', name: L('Гирлянда на\u00a0окне'), seats: 0, cozy: 1, cost: 1_500, likes: [] },
  { id: 'cat', name: L('Кот на\u00a0подоконнике'), seats: 0, cozy: 1, cost: 4_000, likes: [], style: 'home' },
  // Бистро: зал для обеда офисных — больше мест, уют скромнее
  { id: 'stools', name: L('Стойка у\u00a0окна с\u00a0табуретами'), seats: 3, cozy: 0, cost: 3_000, likes: ['office', 'remote'] },
  { id: 'ficus', name: L('Фикусы в\u00a0кадках'), seats: 0, cozy: 2, cost: 2_000, likes: [] },
  { id: 'commune', name: L('Общий стол с\u00a0лавками'), seats: 6, cozy: 0, cost: 5_000, likes: ['office', 'student'] },
  { id: 'pair4', name: L('Два стола на\u00a0четверых'), seats: 8, cozy: 0, cost: 6_500, likes: ['office'] },
  { id: 'booth', name: L('Кабинка с\u00a0диванами'), seats: 4, cozy: 2, cost: 6_000, likes: ['pensioner', 'visitor'] },
  { id: 'cooler', name: L('Кулер с\u00a0водой и\u00a0цветы'), seats: 0, cozy: 1, cost: 2_500, likes: ['office'] },
  { id: 'palm', name: L('Пальма в\u00a0кадке'), seats: 0, cozy: 2, cost: 1_800, likes: [] },
  { id: 'coatstand', name: L('Вешалка у\u00a0двери'), seats: 0, cozy: 1, cost: 1_200, likes: ['office', 'pensioner'] },
  { id: 'herbs', name: L('Полка с\u00a0цветами'), seats: 0, cozy: 1, cost: 1_000, likes: [] },
  { id: 'poster', name: L('Постер с\u00a0едой'), seats: 0, cozy: 1, cost: 800, likes: ['youth', 'student'] },
  { id: 'menuboard', name: L('Доска бизнес-ланча'), seats: 0, cozy: 1, cost: 1_500, likes: ['office'] },
  { id: 'tv', name: L('Телевизор с\u00a0новостями'), seats: 0, cozy: 1, cost: 4_000, likes: ['pensioner', 'shopkeeper'] },
];

export const furniture = (id: FurnitureId): Furniture => FURNITURE.find((f) => f.id === id)!;

/** Места в зале — как на картинке: что куда встаёт, решает место */
export const HALL_SLOTS: { id: string; accepts: FurnitureId[] }[] = [
  { id: 'rug', accepts: ['rug'] },
  { id: 'wall-1', accepts: ['picture'] },
  { id: 'wall-2', accepts: ['clock'] },
  { id: 'corner', accepts: ['sofa', 'bookshelf', 'games'] },
  { id: 'shelf', accepts: ['bookshelf', 'games', 'monstera'] },
  { id: 'nook', accepts: ['monstera', 'floorlamp', 'plant'] },
  { id: 'window', accepts: ['bar'] },
  { id: 'table-1', accepts: ['table2', 'table4'] },
  { id: 'small-1', accepts: ['floorlamp', 'plant', 'monstera'] },
  { id: 'table-2', accepts: ['table2', 'table4'] },
  { id: 'table-3', accepts: ['table2', 'table4'] },
  { id: 'table-4', accepts: ['table2', 'table4'] },
  { id: 'walls', accepts: ['walls-home', 'walls-loft', 'walls-scandi', 'walls-classic'] },
  { id: 'floor', accepts: ['floor-home', 'floor-loft', 'floor-scandi', 'floor-classic'] },
  { id: 'feature', accepts: ['neon', 'rack', 'mirror', 'samovar'] },
  { id: 'touch', accepts: ['pendants', 'paperlamp', 'chandelier', 'cat'] },
  // Новогодний декор: в сезон зал тянет посидеть, после — просто уют
  { id: 'tree', accepts: ['tree'] },
  { id: 'garland', accepts: ['garland'] },
];

/** Места зала бистро: раздача и касса стоят всегда, остальное выбирает игрок */
export const BISTRO_SLOTS: { id: string; accepts: FurnitureId[] }[] = [
  { id: 'b-wall-l', accepts: ['herbs', 'poster'] },
  { id: 'b-wall-c', accepts: ['clock'] },
  { id: 'b-wall-r', accepts: ['menuboard', 'tv'] },
  { id: 'b-corner', accepts: ['cooler', 'palm'] },
  { id: 'b-window', accepts: ['stools', 'ficus'] },
  { id: 'b-center', accepts: ['commune', 'pair4'] },
  { id: 'b-side', accepts: ['booth', 'table4'] },
  { id: 'b-door', accepts: ['coatstand', 'plant'] },
  { id: 'b-front-1', accepts: ['table2'] },
  { id: 'b-front-2', accepts: ['table2'] },
];

export const hallSlots = (kind: HallKind) => (kind === 'bistro' ? BISTRO_SLOTS : HALL_SLOTS);

/** Места сезонного декора: их показываем и продаём только в сезон */
export const SEASON_SLOTS = ['tree', 'garland'];

/** Стены и пол: есть всегда, продать нельзя — только заменить */
export const FINISH_SLOTS = ['walls', 'floor'];
/** Места стиля: отделка и фирменные вещи — их не трогают готовые комплектации */
export const STYLE_SLOTS = ['walls', 'floor', 'feature', 'touch'];
/** Места, которые не трогают готовые комплектации */
const KEEP_SLOTS = [...STYLE_SLOTS, 'tree', 'garland'];
/** Полный набор стиля: стены, пол и две фирменные вещи */
export function styleSet(id: StyleId): Layout {
  const set: Layout = {};
  for (const slot of STYLE_SLOTS) {
    const f = HALL_SLOTS.find((s) => s.id === slot)!.accepts.find((a) => furniture(a).style === id);
    if (f) set[slot] = f;
  }
  return set;
}

/** Отделка по умолчанию — входит в открытие */
export const DEFAULT_FINISH: Layout = { walls: 'walls-home', floor: 'floor-home' };

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
    name: L('Стандарт'),
    hint: L('Два столика. Входит в открытие'),
    layout: { 'table-1': 'table2', 'table-2': 'table2' },
  },
  {
    id: 'cozy',
    name: L('Уют'),
    hint: L('Диван, картина, цветы и коврик'),
    layout: { 'table-1': 'table2', 'table-2': 'table2', corner: 'sofa', 'wall-1': 'picture', nook: 'plant', rug: 'rug' },
  },
  {
    id: 'comfort',
    name: L('Комфорт'),
    hint: L('Больше мест, стойка с розетками для ноутбуков'),
    layout: {
      'table-1': 'table2',
      'table-2': 'table4',
      corner: 'sofa',
      window: 'bar',
      'wall-1': 'picture',
      'wall-2': 'clock',
      nook: 'monstera',
      'small-1': 'floorlamp',
      rug: 'rug',
    },
  },
  {
    id: 'premium',
    name: L('Премиум'),
    hint: L('Полный зал: книжный шкаф, диван, стойка и все столы'),
    layout: {
      'table-1': 'table2',
      'table-2': 'table4',
      'table-3': 'table2',
      'table-4': 'table2',
      corner: 'sofa',
      shelf: 'bookshelf',
      window: 'bar',
      'wall-1': 'picture',
      'wall-2': 'clock',
      nook: 'monstera',
      'small-1': 'floorlamp',
      rug: 'rug',
    },
  },
];

export const BISTRO_PRESETS: Preset[] = [
  {
    id: 'standard',
    name: L('Стандарт'),
    hint: L('Два столика у\u00a0раздачи. Входит в\u00a0открытие'),
    layout: { 'b-front-1': 'table2', 'b-front-2': 'table2' },
  },
  {
    id: 'cozy',
    name: L('Обед'),
    hint: L('Общий стол на\u00a0шестерых, доска бизнес-ланча и\u00a0кулер'),
    layout: { 'b-front-1': 'table2', 'b-front-2': 'table2', 'b-center': 'commune', 'b-wall-r': 'menuboard', 'b-corner': 'cooler' },
  },
  {
    id: 'comfort',
    name: L('Комфорт'),
    hint: L('Стойка у\u00a0окна, кабинка с\u00a0диванами, вешалка и\u00a0часы'),
    layout: {
      'b-front-1': 'table2',
      'b-front-2': 'table2',
      'b-center': 'commune',
      'b-window': 'stools',
      'b-side': 'booth',
      'b-corner': 'cooler',
      'b-door': 'coatstand',
      'b-wall-r': 'menuboard',
      'b-wall-c': 'clock',
    },
  },
  {
    id: 'premium',
    name: L('Премиум'),
    hint: L('Полный зал: два стола на\u00a0четверых, кабинка, телевизор и\u00a0цветы'),
    layout: {
      'b-front-1': 'table2',
      'b-front-2': 'table2',
      'b-center': 'pair4',
      'b-window': 'stools',
      'b-side': 'booth',
      'b-corner': 'cooler',
      'b-door': 'coatstand',
      'b-wall-l': 'herbs',
      'b-wall-c': 'clock',
      'b-wall-r': 'tv',
    },
  },
];

export const presetsOf = (kind: HallKind): Preset[] => (kind === 'bistro' ? BISTRO_PRESETS : PRESETS);
export const preset = (id: PresetId, kind: HallKind = 'cafe'): Preset => presetsOf(kind).find((p) => p.id === id)!;

export const INTERIOR = {
  /** Какая доля цены возвращается при продаже */
  sellShare: 0.5,
  /** Уют, при котором эффект полный */
  cozyFull: 10,
  /** Сколько прибавляет полный уют к шансу заказать ещё (×) */
  extraBoost: 0.3,
  /** Прибавка к лояльности за визит при полном уюте */
  loyalty: 0.05,
  /** Постоянный гость, который сел в зале, приводит коллегу, соседа или друга: шанс без уюта и прибавка при полном уюте */
  companyBase: 0.03,
  companyCozy: 0.35,
  /** Насколько полный уют поднимает потолок привязанности постоянного гостя */
  loyaltyCap: 0.3,
  /** Прибавка к лояльности, если в зале есть вещь, которая нравится гостю */
  liked: 0.03,
  /** Насколько полный уют прибавляет к желанию зайти: посидеть (×), взять с собой (×) */
  attractSit: 0.8,
  attractGo: 0.25,
  /** Во сколько раз чаще постоянные гости уютного зала советуют кафе знакомым */
  wordBoost: 1,
  /** Сколько элементов стиля (из стен, пола и двух фирменных вещей) нужно, чтобы он засчитался */
  styleNeed: 3,
  /** Своя аудитория в зале своего стиля: прибавка к желанию зайти посидеть и взять с собой (×), к лояльности за визит */
  styleSit: 0.8,
  styleGo: 0.2,
  styleLoyalty: 0.05,
  /** Своя аудитория чаще замечает зал в окне, проходя мимо, и чаще советует его знакомым (×) */
  styleNotice: 1,
  styleWord: 1.5,
  /** «Как дома» нравится всем, но впятеро слабее */
  homeShare: 0.2,
  /** Смешанный зал: каждая вещь своего стиля даёт четверть от этой доли (все четыре своих — как 0,4 цельного стиля) */
  partial: 0.4,
} as const;

export function canPlace(slotId: string, id: FurnitureId, kind: HallKind = 'cafe'): boolean {
  return !!hallSlots(kind).find((s) => s.id === slotId)?.accepts.includes(id);
}

export class Interior {
  layout: Layout = {};

  /** kindOf — какой это зал: решает помещение кафе */
  constructor(private readonly kindOf: () => HallKind = () => 'cafe') {}

  get kind(): HallKind {
    return this.kindOf();
  }

  /** Есть ли у зала стиль (стены, пол, фирменные вещи): пока только у кафе */
  get styled(): boolean {
    return this.kind === 'cafe';
  }

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

  /** Сколько элементов зала в этом стиле */
  styleCount(id: StyleId): number {
    if (!this.styled) return 0;
    return STYLE_SLOTS.filter((slot) => {
      const f = this.layout[slot];
      return f && furniture(f).style === id;
    }).length;
  }

  /** Стиль зала: у кого больше элементов, при минимуме INTERIOR.styleNeed; иначе зал без стиля */
  get style(): StyleId | null {
    let best: StyleId | null = null;
    let most = INTERIOR.styleNeed - 1;
    for (const s of STYLES) {
      const n = this.styleCount(s.id);
      if (n > most) [best, most] = [s.id, n];
    }
    return best;
  }

  /**
   * Насколько зал по душе жителю этого типа, 0…1. Цельный стиль своей аудитории — 1 («Как дома» — homeShare).
   * Смешанный зал тоже кому-то нравится: каждая вещь в стиле, близком жителю, даёт четверть от INTERIOR.partial
   * (кроме «Как дома»).
   * Берётся большее: цельность выигрывает, но смешивать стили — не ноль.
   */
  styleFit(kind: ResidentKind): number {
    let partial = 0;
    // «Как дома» — общий фон, а не вкус: в смешанном зале его вещи не считаются
    for (const s of STYLES) if (s.audience !== 'all') partial += (this.styleCount(s.id) / STYLE_SLOTS.length) * audienceShare(s, kind);
    return Math.max(this.wholeFit(kind), partial * INTERIOR.partial);
  }

  /** Только цельный стиль: 1 — своя аудитория, homeShare — «Как дома», 0 — не его или стиля нет */
  wholeFit(kind: ResidentKind): number {
    const id = this.style;
    return id ? audienceShare(hallStyle(id), kind) : 0;
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
    const target = preset(id, this.kind).layout;
    let cost = 0;
    for (const { id: slot } of hallSlots(this.kind)) {
      if (KEEP_SLOTS.includes(slot)) continue;
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
    const target = preset(id, this.kind).layout;
    return hallSlots(this.kind).every(({ id: slot }) => KEEP_SLOTS.includes(slot) || (this.layout[slot] ?? null) === (target[slot] ?? null));
  }

  /** Во что обойдётся довести зал до полного стиля: недостающее покупается, заменённое продаётся */
  styleCost(id: StyleId): number {
    let cost = 0;
    for (const [slot, f] of Object.entries(styleSet(id))) {
      const now = this.layout[slot];
      if (!f || now === f) continue;
      cost += furniture(f).cost - (now ? Interior.refund(now) : 0);
    }
    return cost;
  }

  /** Поставить комплектацию: мебель меняется, отделка и фирменные вещи остаются */
  applyPreset(id: PresetId): void {
    const keep: Layout = {};
    for (const slot of KEEP_SLOTS) if (this.layout[slot]) keep[slot] = this.layout[slot];
    this.load({ ...preset(id, this.kind).layout, ...keep });
  }

  toJSON(): Layout {
    return { ...this.layout };
  }

  load(layout: Layout | undefined): void {
    this.layout = {};
    for (const [slot, id] of Object.entries(layout ?? {})) if (id && canPlace(slot, id, this.kind)) this.layout[slot] = id;
    // Старые сохранения и комплектации без отделки: стены и пол «Как дома»
    if (this.styled) for (const [slot, id] of Object.entries(DEFAULT_FINISH)) if (!this.layout[slot]) this.layout[slot] = id;
  }
}
