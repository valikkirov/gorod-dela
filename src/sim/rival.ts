// Конкурент-NPC: открывается в соседнем свободном помещении через несколько дней после игрока.
// Стратегия фиксированная и понятная: своё меню, цены, часы и акция по расписанию. Действия игрока он не копирует.
import { CATALOG, type MenuItem } from './cafe';
import { hm, MINUTES_PER_DAY } from './clock';
import type { PremisesId } from './economy';

export interface RivalTemplate {
  name: string;
  /** Чем берёт — одной строкой для карточки */
  pitch: string;
  /** Где открывается: всегда то помещение, которое не занял игрок */
  premises: PremisesId;
  placeId: string;
  prices: Record<string, number>;
  openAt: number;
  closeAt: number;
  /** Можно ли у него сидеть */
  seats: boolean;
}

export const RIVAL = {
  /** Через сколько дней после открытия игрока появляется конкурент */
  delayDays: 4,
  /** Каждая третья неделя работы — акция */
  promoEveryWeeks: 3,
  promoDiscount: 0.15,
} as const;

/** Ключ — помещение игрока; конкурент занимает другое */
export const RIVALS: Record<PremisesId, RivalTemplate> = {
  cafe: {
    name: '«Кофе на бегу»',
    pitch: 'Сетевой киоск у метро: дешёвый кофе с собой, только утро и день',
    premises: 'kiosk',
    placeId: 'kiosk',
    prices: { americano: 120, cappuccino: 170, latte: 180, croissant: 120 },
    openAt: hm(7),
    closeAt: hm(15),
    seats: false,
  },
  kiosk: {
    name: 'Столовая «Ложка»',
    pitch: 'Недорогие обеды и кофе, работает днём, с залом',
    premises: 'cafe',
    placeId: 'cafe',
    prices: { americano: 130, soup: 200, lunch: 330, sandwich: 220, tea: 150 },
    openAt: hm(8),
    closeAt: hm(19),
    seats: true,
  },
};

export interface RivalSave {
  playerPremises: PremisesId;
  opensDay: number;
  servedToday: number;
}

export class Rival {
  servedToday = 0;

  constructor(
    readonly playerPremises: PremisesId,
    readonly opensDay: number,
  ) {}

  get t(): RivalTemplate {
    return RIVALS[this.playerPremises];
  }

  get placeId(): string {
    return this.t.placeId;
  }

  isOpen(day: number, minute: number): boolean {
    if (day < this.opensDay) return false;
    const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return m >= this.t.openAt && m < this.t.closeAt;
  }

  /** Акция: каждая третья неделя после открытия, весь понедельник–воскресенье этой недели работы */
  promo(day: number): boolean {
    if (day < this.opensDay) return false;
    return Math.floor((day - this.opensDay) / 7) % RIVAL.promoEveryWeeks === RIVAL.promoEveryWeeks - 1;
  }

  /** Сколько дней до начала следующей акции (0 — идёт сейчас) */
  daysToPromo(day: number): number {
    for (let d = 0; d < 7 * RIVAL.promoEveryWeeks + 7; d++) if (this.promo(day + d)) return d;
    return -1;
  }

  menu(day: number): MenuItem[] {
    const k = this.promo(day) ? 1 - RIVAL.promoDiscount : 1;
    return Object.entries(this.t.prices).map(([id, price]) => {
      const it = CATALOG.find((c) => c.id === id)!;
      return { ...it, price: Math.round((price * k) / 10) * 10 };
    });
  }

  toJSON(): RivalSave {
    return { playerPremises: this.playerPremises, opensDay: this.opensDay, servedToday: this.servedToday };
  }

  static load(d: RivalSave): Rival {
    const r = new Rival(d.playerPremises, d.opensDay);
    r.servedToday = d.servedToday;
    return r;
  }
}
