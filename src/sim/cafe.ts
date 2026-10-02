import { hm } from './clock';
import { CURRENCY, ECONOMY, type Currency } from './economy';

export type ItemKind = 'coffee' | 'lunch' | 'tea' | 'snack';

export interface MenuItem {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  cost: number;
}

export type RejectReason =
  | 'not-open'
  | 'closed'
  | 'expensive'
  | 'off-route'
  | 'no-item'
  | 'queue'
  | 'no-time'
  | 'mood';

export const REJECT_LABEL: Record<RejectReason, string> = {
  'not-open': 'Кафе ещё не открыто',
  closed: 'Закрыто',
  expensive: 'Дорого',
  'off-route': 'Не по пути',
  'no-item': 'Нет нужного в меню',
  queue: 'Очередь',
  'no-time': 'Не дождался',
  mood: 'Не сегодня',
};

export interface DayReport {
  day: number;
  opened: boolean;
  guests: number;
  revenue: number;
  cogs: number;
  rent: number;
  utilities: number;
  wages: number;
  tax: number;
  profit: number;
  cashAfter: number;
  currency: Currency;
  /** Сколько раз жители хотели зайти (включая отказы) */
  wanted: number;
  missed: Partial<Record<RejectReason, number>>;
  sold: Record<string, number>;
}

export const DEFAULT_MENU: MenuItem[] = [
  { id: 'americano', name: 'Американо', kind: 'coffee', price: 150, cost: 30 },
  { id: 'cappuccino', name: 'Капучино', kind: 'coffee', price: 220, cost: 50 },
  { id: 'croissant', name: 'Круассан', kind: 'snack', price: 160, cost: 60 },
  { id: 'lunch', name: 'Бизнес-ланч', kind: 'lunch', price: 390, cost: 160 },
  { id: 'tea', name: 'Чай с пирогом', kind: 'tea', price: 180, cost: 50 },
];

export const MAX_QUEUE = 6;

interface Slot {
  residentId: number;
  itemId: string;
  left: number;
}

export interface Sale {
  residentId: number;
  itemId: string;
  price: number;
}

/** Состояние кафе игрока */
export class Cafe {
  opened = false;
  menu: MenuItem[] = DEFAULT_MENU.map((m) => ({ ...m }));
  openAt = hm(8);
  closeAt = hm(20);
  baristas = 0;
  readonly queue: { residentId: number; itemId: string }[] = [];
  private slots: Slot[] = [];

  // Счётчики текущего дня
  today = Cafe.emptyDay(1);
  private maxBaristasToday = 0;

  static emptyDay(day: number): DayReport {
    return {
      day,
      opened: false,
      guests: 0,
      revenue: 0,
      cogs: 0,
      rent: 0,
      utilities: 0,
      wages: 0,
      tax: 0,
      profit: 0,
      cashAfter: 0,
      currency: CURRENCY,
      wanted: 0,
      missed: {},
      sold: {},
    };
  }

  isOpenAt(minute: number): boolean {
    return this.opened && minute >= this.openAt && minute < this.closeAt;
  }

  item(id: string): MenuItem {
    const it = this.menu.find((m) => m.id === id);
    if (!it) throw new Error(`Нет позиции ${id}`);
    return it;
  }

  setBaristas(n: number, minute: number): void {
    this.baristas = Math.max(0, Math.min(ECONOMY.maxBaristas, n));
    if (this.isOpenAt(minute)) this.maxBaristasToday = Math.max(this.maxBaristasToday, this.baristas);
  }

  /** Минут на одного гостя у одного «места за стойкой» */
  get serviceMinutes(): number {
    return this.baristas > 0 ? 2 : 4;
  }

  get counters(): number {
    return Math.max(1, this.baristas);
  }

  get busy(): number {
    return this.slots.length + this.queue.length;
  }

  join(residentId: number, itemId: string): boolean {
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push({ residentId, itemId });
    return true;
  }

  /** Убрать гостя из очереди (ушёл по своим делам). true — если был в очереди и не обслужен. */
  leave(residentId: number): boolean {
    const qi = this.queue.findIndex((q) => q.residentId === residentId);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      return true;
    }
    const si = this.slots.findIndex((s) => s.residentId === residentId);
    if (si >= 0) {
      this.slots.splice(si, 1);
      return true;
    }
    return false;
  }

  /** Обслуживание за dt минут. Возвращает продажи. */
  tick(dt: number, minute: number): Sale[] {
    if (!this.isOpenAt(minute)) return [];
    this.maxBaristasToday = Math.max(this.maxBaristasToday, this.baristas);
    const sales: Sale[] = [];
    while (this.slots.length < this.counters && this.queue.length > 0) {
      const q = this.queue.shift()!;
      this.slots.push({ ...q, left: this.serviceMinutes });
    }
    for (const s of this.slots) s.left -= dt;
    const done = this.slots.filter((s) => s.left <= 0);
    this.slots = this.slots.filter((s) => s.left > 0);
    for (const s of done) {
      const it = this.item(s.itemId);
      this.today.guests += 1;
      this.today.revenue += it.price;
      this.today.cogs += it.cost;
      this.today.sold[it.id] = (this.today.sold[it.id] ?? 0) + 1;
      sales.push({ residentId: s.residentId, itemId: it.id, price: it.price });
    }
    return sales;
  }

  /** Все, кто не обслужен к закрытию */
  flush(): number[] {
    const ids = [...this.slots.map((s) => s.residentId), ...this.queue.map((q) => q.residentId)];
    this.slots = [];
    this.queue.length = 0;
    return ids;
  }

  /** Итог дня: расходы, налог. Возвращает отчёт; счётчики начинаются заново. */
  closeDay(nextDay: number): DayReport {
    const r = this.today;
    if (this.opened) {
      r.opened = true;
      r.rent = ECONOMY.rentPerDay;
      r.utilities = ECONOMY.utilitiesPerDay;
      r.wages = this.maxBaristasToday * ECONOMY.baristaWagePerShift;
      r.tax = Math.round(r.revenue * ECONOMY.taxRate);
    }
    r.profit = r.revenue - r.cogs - r.rent - r.utilities - r.wages - r.tax;
    this.today = Cafe.emptyDay(nextDay);
    this.maxBaristasToday = 0;
    return r;
  }
}
