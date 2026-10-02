// Маркетинг: о кафе сначала надо узнать. Каналы, сарафан и акции.

export type AwareSource = 'start' | 'walk' | 'flyers' | 'social' | 'word';

export const AWARE_LABEL: Record<AwareSource, string> = {
  start: 'Соседи с открытия',
  walk: 'Заметили, проходя мимо',
  flyers: 'Листовки у метро',
  social: 'Соцсети',
  word: 'Сарафан — рассказали знакомые',
};

export const MARKETING = {
  signCost: 20_000,
  flyersPerDay: 1_500,
  socialCampaign: 10_000,
  socialDays: 7,
  /** Шанс заметить кафе, проходя мимо: без вывески и с ней */
  noticeBase: 0.12,
  noticeWithSign: 0.35,
  /** Шанс взять листовку у метро */
  flyerChance: 0.25,
  /** В день соцсетей узнаёт молодёжь и студенты / остальные */
  socialYoung: 0.3,
  socialOther: 0.08,
  /** Постоянный гость рассказывает знакомому */
  wordChance: 0.15,
  /** Каждый N-й кофе по карте — бесплатно */
  loyaltyEvery: 6,
} as const;

export interface HappyHours {
  from: number;
  to: number;
  /** 0.1 = −10 % */
  discount: number;
}

export class Marketing {
  sign = false;
  flyers = false;
  socialDaysLeft = 0;
  happy: HappyHours | null = null;
  loyaltyCard = false;

  isHappy(minute: number): boolean {
    const h = this.happy;
    return !!h && minute >= h.from && minute < h.to;
  }

  /** Цена с учётом счастливых часов */
  priceAt(price: number, minute: number): number {
    return this.isHappy(minute) ? Math.round(price * (1 - this.happy!.discount)) : price;
  }
}
