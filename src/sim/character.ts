// Характер и вкус жителя (этап B, GDD §4.1): оси вкуса, спешка, экономность, любопытство, память визитов.
// Характер выводится из seed и номера жителя своим генератором: основной поток случайностей не меняется,
// а в сохранении хранить нечего — у того же seed тот же житель. Хранится только память визитов.
import type { ItemKind } from './cafe';
import type { ResidentKind } from './residents';
import { dishProfile } from './dishes';
import { Rng } from './rng';

export type TasteAxis = 'sweet' | 'strong' | 'hearty' | 'novel';
export const AXES: TasteAxis[] = ['sweet', 'strong', 'hearty', 'novel'];

export const AXIS_LABEL: Record<TasteAxis, string> = {
  sweet: 'сладкое',
  strong: 'крепкое',
  hearty: 'сытное',
  novel: 'необычное',
};

/** Профиль позиции: насколько она сладкая, крепкая, сытная, необычная (0…1) */
export type Profile = Record<TasteAxis, number>;

const P = (sweet: number, strong: number, hearty: number, novel: number): Profile => ({ sweet, strong, hearty, novel });

export const ITEM_PROFILE: Record<string, Profile> = {
  americano: P(0, 0.9, 0.1, 0.1),
  cappuccino: P(0.3, 0.6, 0.3, 0.2),
  latte: P(0.5, 0.35, 0.35, 0.25),
  raf: P(0.9, 0.25, 0.4, 0.6),
  croissant: P(0.6, 0, 0.4, 0.2),
  sandwich: P(0.1, 0.2, 0.8, 0.3),
  syrniki: P(0.7, 0, 0.6, 0.3),
  soup: P(0.1, 0.2, 0.7, 0.2),
  lunch: P(0.15, 0.2, 1, 0.3),
  tea: P(0.6, 0.2, 0.4, 0.1),
  lemonade: P(0.8, 0, 0, 0.6),
  beer: P(0.1, 0.7, 0.3, 0.2),
  cider: P(0.7, 0.4, 0.1, 0.5),
};

export function profileOf(itemId: string): Profile {
  return ITEM_PROFILE[itemId] ?? dishProfile(itemId) ?? P(0.5, 0.5, 0.5, 0.5);
}

export interface Character {
  /** 0…1: торопится — не любит крюк и очередь */
  hurry: number;
  /** 0…1: экономный — острее реагирует на цену */
  thrift: number;
  /** 0…1: любопытный — замечает новое, пробует незнакомое; нелюбопытный держится любимого */
  curiosity: number;
  /** −1…1 по каждой оси: любит (>0), всё равно (≈0), не любит (<0) */
  taste: Record<TasteAxis, number>;
}

/** Склонности по типу жителя: [спешка, экономность, любопытство] и сдвиги вкуса */
const KIND_CHARACTER: Record<ResidentKind, { hurry: number; thrift: number; curiosity: number; taste: Partial<Record<TasteAxis, number>> }> = {
  office: { hurry: 0.7, thrift: 0.35, curiosity: 0.35, taste: { strong: 0.3, hearty: 0.2 } },
  student: { hurry: 0.45, thrift: 0.75, curiosity: 0.65, taste: { sweet: 0.3, novel: 0.2 } },
  pensioner: { hurry: 0.15, thrift: 0.8, curiosity: 0.2, taste: { novel: -0.4, hearty: 0.2 } },
  shopkeeper: { hurry: 0.5, thrift: 0.6, curiosity: 0.3, taste: { hearty: 0.2 } },
  remote: { hurry: 0.2, thrift: 0.35, curiosity: 0.6, taste: { novel: 0.2 } },
  youth: { hurry: 0.35, thrift: 0.5, curiosity: 0.8, taste: { sweet: 0.3, novel: 0.4 } },
  nightworker: { hurry: 0.5, thrift: 0.55, curiosity: 0.3, taste: { strong: 0.3, hearty: 0.3 } },
  passenger: { hurry: 0.85, thrift: 0.45, curiosity: 0.3, taste: {} },
  visitor: { hurry: 0.25, thrift: 0.3, curiosity: 0.75, taste: { novel: 0.3, sweet: 0.1 } },
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Характер жителя. Вкус собирается из любимых позиций (любит латте — значит, любит и чуть сладкое),
 * склонности его типа и личного шума.
 */
export function makeCharacter(seed: number, id: number, kind: ResidentKind, favorites: Record<ItemKind, string>): Character {
  const rng = new Rng(((seed * 2654435761) ^ (id * 40503 + 0x9e3779b9)) >>> 0);
  const k = KIND_CHARACTER[kind];
  const trait = (base: number) => clamp(base + rng.range(-0.3, 0.3), 0, 1);
  const favs = [favorites.coffee, favorites.snack, favorites.lunch, favorites.tea, favorites.bar].map(profileOf);
  const taste = {} as Record<TasteAxis, number>;
  for (const a of AXES) {
    const fromFavs = favs.reduce((s, p) => s + p[a], 0) / favs.length; // 0…1
    taste[a] = clamp((fromFavs - 0.4) * 1.4 + (k.taste[a] ?? 0) + rng.range(-0.45, 0.45), -1, 1);
  }
  return { hurry: trait(k.hurry), thrift: trait(k.thrift), curiosity: trait(k.curiosity), taste };
}

/** Насколько позиция во вкусе жителя: −1 (совсем не его) … 1 (точно его) */
export function tasteMatch(c: Character, itemId: string): number {
  const p = profileOf(itemId);
  let s = 0;
  let w = 0;
  for (const a of AXES) {
    const pref = c.taste[a];
    // Ось, к которой житель равнодушен, почти не влияет
    s += pref * (p[a] - 0.4) * 2;
    w += Math.abs(pref);
  }
  return w < 0.05 ? 0 : clamp(s / Math.max(1, w), -1, 1);
}

/** Совпадение вкуса, которое даёт любимая позиция */
export const FAVORITE_MATCH = 0.35;

export const TASTE = {
  /** Готовность платить: ×(1 + budget · совпадение вкуса) */
  budget: 0.15,
  /** Охота зайти: ×(1 + weight · совпадение вкуса) */
  weight: 0.3,
  /** Ниже этого совпадения житель говорит «не мой вкус» */
  dislike: -0.3,
};

// ——— Память визитов ———

export type MemoryNote = 'tasty' | 'not-my-taste' | 'pricey' | 'good-price' | 'long-wait' | 'quick' | 'queue' | 'out-of-stock' | 'new';

export const NOTE_LABEL: Record<MemoryNote, string> = {
  tasty: 'вкусно',
  'not-my-taste': 'не по вкусу',
  pricey: 'дороговато',
  'good-price': 'недорого',
  'long-wait': 'долго ждать',
  quick: 'быстро',
  queue: 'очередь',
  'out-of-stock': 'не было',
  new: 'новое для себя',
};

export interface Memory {
  day: number;
  itemId: string;
  /** −1…1: насколько понравилось */
  score: number;
  notes: MemoryNote[];
}

export const MEMORY_SIZE = 5;

/** Оценка визита: вкус, цена относительно ожиданий, ожидание. Возвращает балл и заметки */
export function rateVisit(
  c: Character,
  itemId: string,
  price: number,
  budget: number,
  waitMinutes: number,
  firstTry: boolean,
  favorite = false,
): { score: number; notes: MemoryNote[] } {
  const notes: MemoryNote[] = [];
  // Любимая позиция всегда по вкусу, даже если в остальном он сладкоежка
  const match = favorite ? Math.max(FAVORITE_MATCH, tasteMatch(c, itemId)) : tasteMatch(c, itemId);
  if (match >= 0.3) notes.push('tasty');
  else if (match <= TASTE.dislike) notes.push('not-my-taste');
  // Цена: экономный замечает переплату острее
  const fair = clamp((budget - price) / budget, -0.5, 0.5) * (1 + c.thrift);
  if (fair < -0.1) notes.push('pricey');
  else if (fair > 0.25) notes.push('good-price');
  // Ожидание: торопливый замечает острее
  const slow = Math.max(0, waitMinutes - 6) / 10;
  const waitScore = -clamp(slow * (0.5 + c.hurry), 0, 1);
  if (waitScore <= -0.3) notes.push('long-wait');
  else if (waitMinutes <= 3) notes.push('quick');
  if (firstTry && c.curiosity >= 0.6) notes.push('new');
  const score = clamp(0.55 * match + 0.35 * fair + 0.5 * waitScore + (firstTry ? 0.1 * c.curiosity : 0) + 0.15, -1, 1);
  return { score, notes };
}

export function remember(memory: Memory[], m: Memory): Memory[] {
  return [m, ...memory].slice(0, MEMORY_SIZE);
}

/** Черты для карточки: только заметные */
export function traitWords(c: Character): string[] {
  const w: string[] = [];
  if (c.hurry >= 0.6) w.push('торопится');
  else if (c.hurry <= 0.25) w.push('не спешит');
  if (c.thrift >= 0.65) w.push('экономный');
  else if (c.thrift <= 0.25) w.push('не считает деньги');
  if (c.curiosity >= 0.65) w.push('любит новое');
  else if (c.curiosity <= 0.25) w.push('верен привычкам');
  return w;
}

/** Вкус для карточки: «любит сладкое и необычное · не любит крепкое» */
export function tasteWords(c: Character): { likes: TasteAxis[]; dislikes: TasteAxis[] } {
  const likes = AXES.filter((a) => c.taste[a] >= 0.35).sort((a, b) => c.taste[b] - c.taste[a]);
  const dislikes = AXES.filter((a) => c.taste[a] <= -0.35).sort((a, b) => c.taste[a] - c.taste[b]);
  return { likes, dislikes };
}
