import { hm, MINUTES_PER_DAY } from './clock';
import { CURRENCY, ECONOMY, type Currency } from './economy';
import { recipeCost, Stock, type IngredientId } from './stock';
import type { Weather } from './weather';

export type ItemKind = 'coffee' | 'snack' | 'lunch' | 'tea' | 'bar';

export const KIND_TITLE: Record<ItemKind, string> = {
  coffee: 'Кофе',
  snack: 'Выпечка и перекус',
  lunch: 'Обеды',
  tea: 'Чай и напитки',
  bar: 'Бар',
};

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
  | 'mood'
  | 'out-of-stock';

export const REJECT_LABEL: Record<RejectReason, string> = {
  'not-open': 'Кафе ещё не открыто',
  closed: 'Закрыто',
  expensive: 'Дорого',
  'off-route': 'Не по пути',
  'no-item': 'Нет нужного в меню',
  queue: 'Очередь',
  'no-time': 'Не дождался',
  mood: 'Не сегодня',
  'out-of-stock': 'Нет в наличии',
};

export interface DayReport {
  day: number;
  opened: boolean;
  guests: number;
  revenue: number;
  /** Себестоимость проданного — для справки */
  cogs: number;
  /** Сколько заплатили поставщику за привезённое сегодня */
  purchases: number;
  /** Испортилось и выброшено, ₽ (уже оплачено при закупке) */
  writtenOff: number;
  writtenOffItems: Partial<Record<IngredientId, number>>;
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
  /** Чего не нашли в меню: категория → сколько раз */
  missingKinds: Partial<Record<ItemKind, number>>;
  sold: Record<string, number>;
  weekday?: number;
  weather?: Weather;
  /** Прогноз на завтра */
  forecast?: Weather;
}

/** Всё, что кафе может продавать. Цена — стартовая, игрок меняет её сам.
 *  Для ИП из алкоголя доступны только пиво и сидр; вино и крепкое — с лицензией ООО (позже). */
export const CATALOG: readonly MenuItem[] = [
  { id: 'americano', name: 'Американо', kind: 'coffee', price: 150, cost: 30 },
  { id: 'cappuccino', name: 'Капучино', kind: 'coffee', price: 220, cost: 50 },
  { id: 'latte', name: 'Латте', kind: 'coffee', price: 230, cost: 55 },
  { id: 'raf', name: 'Раф', kind: 'coffee', price: 280, cost: 70 },
  { id: 'croissant', name: 'Круассан', kind: 'snack', price: 160, cost: 60 },
  { id: 'sandwich', name: 'Сэндвич', kind: 'snack', price: 250, cost: 100 },
  { id: 'syrniki', name: 'Сырники', kind: 'snack', price: 280, cost: 90 },
  { id: 'soup', name: 'Суп дня', kind: 'lunch', price: 250, cost: 80 },
  { id: 'lunch', name: 'Бизнес-ланч', kind: 'lunch', price: 390, cost: 160 },
  { id: 'tea', name: 'Чай с пирогом', kind: 'tea', price: 180, cost: 50 },
  { id: 'lemonade', name: 'Лимонад', kind: 'tea', price: 200, cost: 40 },
  { id: 'beer', name: 'Пиво', kind: 'bar', price: 300, cost: 110 },
  { id: 'cider', name: 'Сидр', kind: 'bar', price: 320, cost: 120 },
];

export const DEFAULT_MENU_IDS = ['americano', 'cappuccino', 'croissant', 'lunch', 'tea'];
export const MAX_MENU = 8;
export const MAX_QUEUE = 6;

const catalogItem = (id: string): MenuItem => {
  const it = CATALOG.find((m) => m.id === id);
  if (!it) throw new Error(`Нет позиции ${id} в каталоге`);
  return { ...it, cost: recipeCost(id) };
};

/** Ночные часы для надбавки +20 % */
export const isNightMinute = (m: number): boolean => m >= hm(22) || m < hm(6);

export type Contract = 'shift' | 'hourly';

/** Бариста: на смене (фикс за до 12 часов) или почасово (вызываешь и отпускаешь сам) */
export interface Barista {
  id: number;
  contract: Contract;
  /** Почасовой: сейчас на работе или отпущен */
  onDuty: boolean;
  /** Сменный: сколько минут отработано в текущей смене */
  shiftMinutes: number;
  /** Сменный: оплачена ли текущая смена */
  shiftPaid: boolean;
}

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

export interface TickResult {
  sales: Sale[];
  /** Заказ не из чего приготовить — гость уходит */
  failed: number[];
}

/** Состояние кафе игрока */
export class Cafe {
  opened = false;
  menu: MenuItem[] = DEFAULT_MENU_IDS.map(catalogItem);
  openAt = hm(8);
  /** Может быть больше 24:00 — работа через полночь. openAt + 1440 = круглосуточно. */
  closeAt = hm(20);
  staff: Barista[] = [];
  readonly stock = new Stock();
  private nextStaffId = 1;
  readonly queue: { residentId: number; itemId: string }[] = [];
  private slots: Slot[] = [];
  /** Цены позиций, убранных из меню, — чтобы дообслужить уже сделанные заказы */
  private retired = new Map<string, MenuItem>();

  // Счётчики текущего дня
  today = Cafe.emptyDay(1);
  private wagesToday = 0;
  private lastPaidMinute = -1;

  static emptyDay(day: number): DayReport {
    return {
      day,
      opened: false,
      guests: 0,
      revenue: 0,
      cogs: 0,
      purchases: 0,
      writtenOff: 0,
      writtenOffItems: {},
      rent: 0,
      utilities: 0,
      wages: 0,
      tax: 0,
      profit: 0,
      cashAfter: 0,
      currency: CURRENCY,
      wanted: 0,
      missed: {},
      missingKinds: {},
      sold: {},
    };
  }

  get allDay(): boolean {
    return this.closeAt - this.openAt >= MINUTES_PER_DAY;
  }

  isOpenAt(minute: number): boolean {
    if (!this.opened) return false;
    if (this.allDay) return true;
    const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (this.closeAt <= MINUTES_PER_DAY) return m >= this.openAt && m < this.closeAt;
    return m >= this.openAt || m < this.closeAt - MINUTES_PER_DAY;
  }

  item(id: string): MenuItem {
    const it = this.menu.find((m) => m.id === id) ?? this.retired.get(id);
    if (!it) throw new Error(`Нет позиции ${id}`);
    return it;
  }

  hasItem(id: string): boolean {
    return this.menu.some((m) => m.id === id);
  }

  addItem(id: string): boolean {
    if (this.hasItem(id) || this.menu.length >= MAX_MENU) return false;
    const it = this.retired.get(id) ?? catalogItem(id);
    this.retired.delete(id);
    // Держим порядок каталога — так меню читается по категориям
    this.menu.push(it);
    const order = CATALOG.map((c) => c.id);
    this.menu.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return true;
  }

  removeItem(id: string): boolean {
    if (this.menu.length <= 1) return false;
    const i = this.menu.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.retired.set(id, this.menu[i]);
    this.menu.splice(i, 1);
    return true;
  }

  hire(contract: Contract): Barista | null {
    if (this.staff.length >= ECONOMY.maxBaristas) return null;
    const b: Barista = { id: this.nextStaffId++, contract, onDuty: true, shiftMinutes: 0, shiftPaid: false };
    this.staff.push(b);
    return b;
  }

  fire(id: number): void {
    this.staff = this.staff.filter((b) => b.id !== id);
  }

  setOnDuty(id: number, onDuty: boolean): void {
    const b = this.staff.find((s) => s.id === id);
    if (b?.contract === 'hourly') b.onDuty = onDuty;
  }

  /** Работает ли бариста прямо сейчас (при открытом кафе) */
  isWorking(b: Barista): boolean {
    return b.contract === 'hourly' ? b.onDuty : b.shiftMinutes < ECONOMY.shiftHours * 60;
  }

  /** Сколько бариста сейчас за стойкой */
  get baristas(): number {
    return this.staff.filter((b) => this.isWorking(b)).length;
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

  /** Обслуживание и зарплата за dt минут. Возвращает продажи и сорванные заказы. */
  tick(dt: number, minute: number): TickResult {
    const result: TickResult = { sales: [], failed: [] };
    if (!this.isOpenAt(minute)) return result;
    this.payStaff(minute);

    while (this.slots.length < this.counters && this.queue.length > 0) {
      const q = this.queue.shift()!;
      this.slots.push({ ...q, left: this.serviceMinutes });
    }
    for (const s of this.slots) s.left -= dt;
    const done = this.slots.filter((s) => s.left <= 0);
    this.slots = this.slots.filter((s) => s.left > 0);
    for (const s of done) {
      const it = this.item(s.itemId);
      if (!this.stock.canMake(it.id)) {
        result.failed.push(s.residentId);
        continue;
      }
      this.stock.use(it.id);
      this.today.guests += 1;
      this.today.revenue += it.price;
      this.today.cogs += it.cost;
      this.today.sold[it.id] = (this.today.sold[it.id] ?? 0) + 1;
      result.sales.push({ residentId: s.residentId, itemId: it.id, price: it.price });
    }
    return result;
  }

  /** Зарплата за прошедшую минуту. Смена оплачивается целиком в первую минуту, ночью — надбавка. */
  private payStaff(minute: number): void {
    const whole = Math.floor(minute);
    if (whole === this.lastPaidMinute) return;
    this.lastPaidMinute = whole;
    // Новая смена начинается с открытием кафе
    if (whole === this.openAt % MINUTES_PER_DAY) {
      for (const b of this.staff) {
        b.shiftMinutes = 0;
        b.shiftPaid = false;
      }
    }
    const night = isNightMinute(whole) ? ECONOMY.nightBonus : 0;
    const shiftHourly = ECONOMY.shiftWage / (ECONOMY.shiftHours * 60);
    for (const b of this.staff) {
      if (!this.isWorking(b)) continue;
      if (b.contract === 'hourly') {
        this.wagesToday += (ECONOMY.baristaWagePerHour * (1 + night)) / 60;
      } else {
        if (!b.shiftPaid) {
          this.wagesToday += ECONOMY.shiftWage;
          b.shiftPaid = true;
        }
        this.wagesToday += shiftHourly * night;
        b.shiftMinutes += 1;
      }
    }
  }

  /** Сколько уже начислено бариста сегодня */
  get wagesSoFar(): number {
    return Math.round(this.wagesToday);
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
      r.wages = Math.round(this.wagesToday);
      r.tax = Math.round(r.revenue * ECONOMY.taxRate);
    }
    r.profit = r.revenue - r.purchases - r.rent - r.utilities - r.wages - r.tax;
    this.today = Cafe.emptyDay(nextDay);
    this.wagesToday = 0;
    return r;
  }
}
