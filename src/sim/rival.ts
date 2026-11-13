// Конкурент-NPC: открывается в соседнем свободном помещении через несколько дней после игрока.
// Стратегия понятная: своё меню, цены, часы и акция по расписанию. Плюс ответные ходы: в конце каждой недели
// он сравнивает своих гостей с прошлой неделей. Теряет гостей — отвечает (дольше работает или скидка),
// дела идут хорошо — поднимает цены. Ход длится неделю и виден в отчёте.
import { CATALOG, type MenuItem } from './cafe';
import { formatClock, hm, MINUTES_PER_DAY } from './clock';
import type { PremisesId } from './economy';

import { L, tr } from './i18n';
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
  /** Ответные ходы: недельные гости упали на hoursDrop — работает дольше (если ты открыт позже него), на promoDrop — скидка;
   *  выросли на raiseRise — поднимает цены на raise */
  hoursDrop: 0.15,
  promoDrop: 0.3,
  raiseRise: 0.15,
  extraHours: 2 * 60,
  raise: 0.1,
} as const;

export type RivalMoveKind = 'promo' | 'hours' | 'raise';

export interface RivalMove {
  kind: RivalMoveKind;
  from: number;
  to: number;
}

/** Ключ — помещение игрока; конкурент занимает другое */
export const RIVALS: Record<PremisesId, RivalTemplate> = {
  cafe: {
    name: L('«Кофе на бегу»'),
    pitch: L('Сетевой киоск у метро: дешёвый кофе с собой, только утро и день'),
    premises: 'kiosk',
    placeId: 'kiosk',
    prices: { americano: 120, cappuccino: 170, latte: 180, croissant: 120 },
    openAt: hm(7),
    closeAt: hm(15),
    seats: false,
  },
  kiosk: {
    name: L('Столовая «Ложка»'),
    pitch: L('Недорогие обеды и кофе, работает днём, с залом'),
    premises: 'cafe',
    placeId: 'cafe',
    prices: { americano: 130, soup: 200, lunch: 330, sandwich: 220, tea: 150 },
    openAt: hm(8),
    closeAt: hm(19),
    seats: true,
  },
  bistro: {
    name: L('«Зерно и\u00a0пар»'),
    pitch: L('Киоск у\u00a0метро «Деловая»: быстрый кофе и\u00a0сэндвичи для офисных, утро и\u00a0день'),
    premises: 'kiosk',
    placeId: 'kiosk',
    prices: { americano: 120, cappuccino: 170, latte: 180, croissant: 120, sandwich: 210 },
    openAt: hm(7),
    closeAt: hm(16),
    seats: false,
  },
  // Пекарня — гостевая точка: своего конкурента у неё нет (в районе он один, у главной); шаблон для полноты
  get bakery(): RivalTemplate {
    return RIVALS.cafe;
  },
};

export interface RivalSave {
  playerPremises: PremisesId;
  opensDay: number;
  servedToday: number;
  /** Ответные ходы (нет в старых сохранениях) */
  week?: number[];
  lastWeek?: number | null;
  move?: RivalMove | null;
}

export class Rival {
  servedToday = 0;
  /** Гости по дням текущей недели работы и итог прошлой */
  week: number[] = [];
  lastWeek: number | null = null;
  move: RivalMove | null = null;

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

  /** Ход, который действует в этот день */
  moveOn(day: number): RivalMoveKind | null {
    const m = this.move;
    return m && day >= m.from && day <= m.to ? m.kind : null;
  }

  /** Закрытие в этот день: в ответ на твои вечера работает дольше */
  closeAt(day: number): number {
    return this.moveOn(day) === 'hours' ? Math.min(MINUTES_PER_DAY, this.t.closeAt + RIVAL.extraHours) : this.t.closeAt;
  }

  isOpen(day: number, minute: number): boolean {
    if (day < this.opensDay) return false;
    const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return m >= this.t.openAt && m < this.closeAt(day);
  }

  /**
   * Конец дня: записать гостей; в конце недели работы решить, отвечать ли.
   * playerOpenLate — точка игрока работает позже его закрытия. Возвращает строку в отчёт, если начинается ход.
   */
  endDay(day: number, playerOpenLate: boolean): string | null {
    if (day < this.opensDay) return null;
    this.week.push(this.servedToday);
    this.servedToday = 0;
    if (this.week.length < 7) return null;
    const total = this.week.reduce((a, b) => a + b, 0);
    const before = this.lastWeek;
    this.lastWeek = total;
    this.week = [];
    if (before === null || before <= 0 || this.moveOn(day + 1)) return null;
    const change = total / before - 1;
    const next = { from: day + 1, to: day + 7 };
    const name = this.t.name;
    if (change <= -RIVAL.promoDrop || (change <= -RIVAL.hoursDrop && !playerOpenLate)) {
      // Обычная акция и так на следующей неделе — второй не будет
      if (this.promo(day + 1)) return null;
      this.move = { kind: 'promo', ...next };
      return tr`🏷️ ${name} теряет гостей и\u00a0отвечает: скидка ${Math.round(RIVAL.promoDiscount * 100)}\u00a0% всю следующую неделю`;
    }
    if (change <= -RIVAL.hoursDrop) {
      this.move = { kind: 'hours', ...next };
      return tr`🕖 ${name} теряет гостей и\u00a0отвечает: следующую неделю работает до\u00a0${formatClock(Math.min(MINUTES_PER_DAY - 1, this.t.closeAt + RIVAL.extraHours))}`;
    }
    if (change >= RIVAL.raiseRise && !this.promo(day + 1)) {
      this.move = { kind: 'raise', ...next };
      return tr`📈 У\u00a0${name} дела идут хорошо: на следующей неделе цены выше на\u00a0${Math.round(RIVAL.raise * 100)}\u00a0%`;
    }
    return null;
  }

  /** Акция: каждая третья неделя после открытия, весь понедельник–воскресенье этой недели работы */
  promo(day: number): boolean {
    if (day < this.opensDay) return false;
    if (this.moveOn(day) === 'promo') return true;
    return Math.floor((day - this.opensDay) / 7) % RIVAL.promoEveryWeeks === RIVAL.promoEveryWeeks - 1;
  }

  /** Сколько дней до начала следующей акции (0 — идёт сейчас) */
  daysToPromo(day: number): number {
    for (let d = 0; d < 7 * RIVAL.promoEveryWeeks + 7; d++) if (this.promo(day + d)) return d;
    return -1;
  }

  menu(day: number): MenuItem[] {
    const k = this.promo(day) ? 1 - RIVAL.promoDiscount : this.moveOn(day) === 'raise' ? 1 + RIVAL.raise : 1;
    return Object.entries(this.t.prices).map(([id, price]) => {
      const it = CATALOG.find((c) => c.id === id)!;
      return { ...it, price: Math.round((price * k) / 10) * 10 };
    });
  }

  toJSON(): RivalSave {
    return {
      playerPremises: this.playerPremises,
      opensDay: this.opensDay,
      servedToday: this.servedToday,
      week: this.week,
      lastWeek: this.lastWeek,
      move: this.move,
    };
  }

  static load(d: RivalSave): Rival {
    const r = new Rival(d.playerPremises, d.opensDay);
    r.servedToday = d.servedToday;
    r.week = [...(d.week ?? [])];
    r.lastWeek = d.lastWeek ?? null;
    r.move = d.move ?? null;
    return r;
  }
}
