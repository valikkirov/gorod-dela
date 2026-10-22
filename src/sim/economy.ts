// Экономика: все суммы — целые рубли с кодом валюты (GDD: валюта у каждой суммы).
export type Currency = 'RUB';

export const CURRENCY: Currency = 'RUB';

export const ECONOMY = {
  startCash: 500_000,
  cafeOpeningCost: 300_000,
  /** 90 000 ₽ в месяц → списывается каждый игровой день */
  rentPerDay: 3_000,
  utilitiesPerDay: 500,
  /** Бариста почасово. Ночью (22:00–6:00) — с надбавкой, как по ТК */
  baristaWagePerHour: 300,
  /** Бариста на смене: фикс за смену до 12 часов с открытия кафе */
  shiftWage: 2_500,
  shiftHours: 12,
  nightBonus: 0.2,
  maxBaristas: 2,
  /** УСН «доходы» */
  taxRate: 0.06,
  /** Столько дней подряд в минусе — банкротство */
  bankruptDays: 3,
  priceStep: 10,
} as const;

export function formatMoney(amount: number, currency: Currency = CURRENCY): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${abs} ${currency === 'RUB' ? '₽' : currency}`;
}

export type PremisesId = 'cafe' | 'kiosk';

/** Помещения под бизнес: формат начинается с места */
export interface Premises {
  id: PremisesId;
  /** Место на карте */
  placeId: string;
  name: string;
  /** «Твоё кафе», «Твой киоск» */
  mine: string;
  about: string;
  rentPerDay: number;
  /** Коммуналка: база в день плюс за каждый час работы — свет, отопление, вода */
  utilitiesPerDay: number;
  utilitiesPerHour: number;
  openingCost: number;
  /** Можно ли сидеть: без мест всё навынос, дозаказов нет */
  seats: boolean;
  /** Какие категории меню помещаются */
  kinds: readonly ('coffee' | 'snack' | 'lunch' | 'tea' | 'bar')[];
  maxBaristas: number;
}

export const PREMISES: Record<PremisesId, Premises> = {
  cafe: {
    id: 'cafe',
    placeId: 'cafe',
    name: 'Кафе',
    mine: 'Твоё кафе',
    about: '30\u00a0м² с\u00a0залом на\u00a0первой линии. Любое меню, гости сидят и\u00a0дозаказывают',
    rentPerDay: ECONOMY.rentPerDay,
    utilitiesPerDay: 200,
    utilitiesPerHour: 30,
    openingCost: ECONOMY.cafeOpeningCost,
    seats: true,
    kinds: ['coffee', 'snack', 'lunch', 'tea', 'bar'],
    maxBaristas: ECONOMY.maxBaristas,
  },
  kiosk: {
    id: 'kiosk',
    placeId: 'kiosk',
    name: 'Киоск у\u00a0метро',
    mine: 'Твой киоск',
    about: '8\u00a0м² прямо у\u00a0выхода из\u00a0метро. Только навынос: кофе, выпечка, чай, без\u00a0кухни и\u00a0бара',
    rentPerDay: 1_500,
    utilitiesPerDay: 100,
    utilitiesPerHour: 15,
    openingCost: 150_000,
    seats: false,
    kinds: ['coffee', 'snack', 'tea'],
    maxBaristas: 1,
  },
};

export type EquipmentId = 'stove' | 'tap';

/** Оборудование под категорию меню: без плиты нет обедов, без крана — пива и сидра.
 *  Кофемашина, витрина и чайник входят в открытие. Покупается один раз, дальше — свет и вода за часы работы. */
export interface Equipment {
  id: EquipmentId;
  name: string;
  /** Какие категории меню открывает */
  kinds: readonly ('lunch' | 'bar')[];
  cost: number;
  /** Сколько прибавляет к коммуналке за час работы */
  utilitiesPerHour: number;
}

export const EQUIPMENT: Record<EquipmentId, Equipment> = {
  stove: { id: 'stove', name: 'Плита и\u00a0вытяжка', kinds: ['lunch'], cost: 45_000, utilitiesPerHour: 12 },
  tap: { id: 'tap', name: 'Пивной кран и\u00a0холодильник', kinds: ['bar'], cost: 30_000, utilitiesPerHour: 6 },
};

/** Какое оборудование нужно для категории (null — входит в открытие) */
export function equipmentFor(kind: string): EquipmentId | null {
  const e = Object.values(EQUIPMENT).find((x) => (x.kinds as readonly string[]).includes(kind));
  return e ? e.id : null;
}
