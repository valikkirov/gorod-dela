import { Interior, type Layout, preset } from './interior';
import { hm, MINUTES_PER_DAY } from './clock';
import { CURRENCY, ECONOMY, EQUIPMENT, equipmentFor, PREMISES, type Currency, type EquipmentId, type Premises, type PremisesId } from './economy';
import type { AwareSource } from './marketing';
import { UPGRADE_EFFECT, type MilestoneId, type UpgradeId } from './milestones';
import { recipeCost, Stock, type IngredientId, type StockSave } from './stock';
import type { ResidentKind } from './residents';
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
  | 'out-of-stock'
  | 'unaware'
  | 'rival'
  | 'taste';

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
  unaware: 'Не знает о кафе',
  rival: 'Ушёл к конкуренту',
  taste: 'Не\u00a0его вкус',
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
  /** Вывеска, листовки, соцсети */
  marketing: number;
  /** Бесплатный кофе по карте лояльности, ₽ по меню */
  giveaways: number;
  newAware: Partial<Record<AwareSource, number>>;
  /** Сколько жителей знают о кафе к концу дня */
  awareCount: number;
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
  /** Сели бы, но мест не было — взяли с собой */
  noSeat?: number;
  /** Чего не нашли в меню: категория → сколько раз */
  missingKinds: Partial<Record<ItemKind, number>>;
  sold: Record<string, number>;
  weekday?: number;
  weather?: Weather;
  /** Прогноз на завтра */
  forecast?: Weather;
  // По часам 0–23. Необязательные — в старых сохранениях их нет.
  /** Обслужено гостей */
  servedHour?: number[];
  /** Минут «мест за стойкой» и сколько из них было занято — загрузка */
  capHour?: number[];
  usedHour?: number[];
  /** Минут работы бариста (без владельца) */
  staffHour?: number[];
  /** Ушедшие по причинам и часам */
  lostHour?: Partial<Record<RejectReason, number[]>>;
  /** Ушедшие по типам жителей и причинам */
  lostKind?: Partial<Record<ResidentKind, Partial<Record<RejectReason, number>>>>;
  /** Что игрок менял за этот день */
  changes?: Change[];
  /** Дозаказы сидящих гостей */
  extras?: number;
  /** Сколько гостей было у конкурента и шла ли у него акция */
  rivalGuests?: number;
  rivalPromo?: boolean;
  /** Новости о знакомых лицах: «Анна теперь в постоянных гостях» */
  news?: string[];
  /** Вехи, достигнутые в этот день */
  milestones?: MilestoneId[];
  /** Потрачено на улучшения — вложение, в прибыль дня не входит */
  invested?: number;
  /** Расходы на события: мастер, столик на празднике, угощение блогеру, доплата бариста */
  other?: number;
  /** Что случилось за день и что выбрали */
  events?: string[];
}

/** Запись в истории изменений: «Капучино: 220 ₽ → 200 ₽» */
export interface Change {
  /** Минута дня, когда изменение сделано (последнее, если меняли несколько раз) */
  minute: number;
  /** По ключу повторные правки за день склеиваются: 220 → 210 → 200 становится 220 → 200 */
  key: string;
  text: string;
  from?: string;
  to: string;
  /** Когда вступит в силу, если не сразу */
  when?: string;
  /** Переключатель: показывать только итог, без «было → стало» */
  toggle?: boolean;
}

export const hours24 = (): number[] => new Array<number>(24).fill(0);

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

/** Стартовое меню — то, что можно продавать без доп. оборудования */
export const DEFAULT_MENU_IDS = ['americano', 'cappuccino', 'latte', 'croissant', 'tea'];
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

/** График бариста: дни недели (0 — понедельник) и, для почасового, окно в течение дня */
export interface StaffSchedule {
  days: boolean[];
  /** Минута дня начала и конца окна. to может быть больше 24:00 — работа через полночь */
  from: number;
  to: number;
}

/** Бариста: на смене (фикс за до 12 часов с открытия) или почасово (платим за часы в окне графика) */
export interface Barista {
  id: number;
  contract: Contract;
  schedule: StaffSchedule;
  /** Разовое «вызвать/отпустить» — только на один календарный день */
  override: { day: number; on: boolean } | null;
  /** Сменный: выходит ли он в текущую смену (по графику на день её начала) */
  shiftActive: boolean;
  /** Сменный: сколько минут отработано в текущей смене */
  shiftMinutes: number;
  /** Сменный: оплачена ли текущая смена */
  shiftPaid: boolean;
}

export const ALL_DAYS = (): boolean[] => new Array<boolean>(7).fill(true);

const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const clock = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** «каждый день», «Пн–Пт», «Сб–Вс», «Пн, Ср, Пт», «не выходит» */
export function daysText(days: boolean[]): string {
  const on = days.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (on.length === 7) return 'каждый день';
  if (on.length === 0) return 'не выходит';
  const run = on.every((d, i) => i === 0 || d === on[i - 1] + 1);
  if (run && on.length >= 3) return `${DAY_SHORT[on[0]]}–${DAY_SHORT[on.at(-1)!]}`;
  return on.map((i) => DAY_SHORT[i]).join(', ');
}

export function scheduleText(b: Barista): string {
  const days = daysText(b.schedule.days);
  if (b.contract === 'shift') return days;
  return `${days}, ${clock(b.schedule.from)}–${clock(b.schedule.to)}`;
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

export interface CafeSave {
  opened: boolean;
  premisesId?: PremisesId;
  menu: MenuItem[];
  openAt: number;
  closeAt: number;
  staff: Barista[];
  nextStaffId: number;
  queue: { residentId: number; itemId: string }[];
  slots: Slot[];
  retired: MenuItem[];
  today: DayReport;
  wagesToday: number;
  lastPaidMinute: number;
  stock: StockSave;
  upgrades?: UpgradeId[];
  equipment?: EquipmentId[];
  /** Зал: что стоит на каких местах */
  interior?: Layout;
  prepUntil?: number;
  /** Название, которое дал игрок */
  name?: string | null;
}

/** Самое длинное название заведения — чтобы влезало в шапку и подпись на карте */
export const CAFE_NAME_MAX = 24;

/** Состояние кафе игрока */
export class Cafe {
  opened = false;
  /** Где игрок открылся: формат начинается с помещения */
  premisesId: PremisesId = 'cafe';
  menu: MenuItem[] = DEFAULT_MENU_IDS.map(catalogItem);
  openAt = hm(8);
  /** Может быть больше 24:00 — работа через полночь. openAt + 1440 = круглосуточно. */
  closeAt = hm(20);
  staff: Barista[] = [];
  readonly stock = new Stock();
  /** Купленные улучшения */
  upgrades: UpgradeId[] = [];
  /** Купленное оборудование под категории меню */
  equipment: EquipmentId[] = [];
  /** Мебель и декор в зале */
  readonly interior = new Interior();
  /** Своё название; null — «Твоё кафе» / «Твой киоск» по помещению */
  customName: string | null = null;
  /** Временное замедление (сломалась одна из двух кофемашин) — выставляет симуляция */
  serviceFactor = 1;
  /** До этой минуты дня стойка занята большим заказом и новых гостей не берёт */
  prepUntil = -1;
  /** Цена в момент продажи (счастливые часы) — подставляет симуляция */
  pricing: (price: number, minute: number) => number = (p) => p;
  private nextStaffId = 1;
  /** Календарный день и день недели — их выставляет симуляция */
  day = 1;
  weekday = 0;
  /** Текущая минута дня — для «кто сейчас за стойкой» */
  private nowMinute = 0;
  readonly queue: { residentId: number; itemId: string }[] = [];
  private slots: Slot[] = [];
  /** Цены позиций, убранных из меню, — чтобы дообслужить уже сделанные заказы */
  private retired = new Map<string, MenuItem>();

  // Счётчики текущего дня
  today = Cafe.emptyDay(1);
  private wagesToday = 0;
  private lastPaidMinute = -1;

  toJSON(): CafeSave {
    return {
      opened: this.opened,
      premisesId: this.premisesId,
      menu: this.menu,
      openAt: this.openAt,
      closeAt: this.closeAt,
      staff: this.staff,
      nextStaffId: this.nextStaffId,
      queue: this.queue,
      slots: this.slots,
      retired: [...this.retired.values()],
      today: this.today,
      wagesToday: this.wagesToday,
      lastPaidMinute: this.lastPaidMinute,
      stock: this.stock.toJSON(),
      upgrades: this.upgrades,
      equipment: this.equipment,
      interior: this.interior.toJSON(),
      prepUntil: this.prepUntil,
      name: this.customName,
    };
  }

  load(d: CafeSave): void {
    this.opened = d.opened;
    this.premisesId = d.premisesId ?? 'cafe';
    this.menu = d.menu;
    this.openAt = d.openAt;
    this.closeAt = d.closeAt;
    // Сохранения до графиков: почасовой работал, пока его не отпустят
    this.staff = d.staff.map((raw) => {
      const b = raw as Barista & { onDuty?: boolean };
      if (!b.schedule) {
        const on = b.onDuty !== false;
        b.schedule = { days: new Array<boolean>(7).fill(b.contract === 'shift' || on), from: d.openAt, to: d.closeAt };
        b.override = null;
        b.shiftActive = true;
      }
      delete b.onDuty;
      return b;
    });
    this.nextStaffId = d.nextStaffId;
    this.queue.splice(0, this.queue.length, ...d.queue);
    this.slots = d.slots;
    this.retired = new Map(d.retired.map((m) => [m.id, m]));
    this.today = d.today;
    this.wagesToday = d.wagesToday;
    this.lastPaidMinute = d.lastPaidMinute;
    this.stock.load(d.stock);
    this.upgrades = [...(d.upgrades ?? [])];
    // Сохранения до оборудования: что уже продаётся — то оборудование и стоит
    this.equipment = d.equipment
      ? [...d.equipment]
      : [...new Set(this.menu.map((m) => equipmentFor(m.kind)).filter((e): e is EquipmentId => !!e))];
    this.interior.load(d.interior);
    // Сохранения до зала: открытое кафе получает «Стандарт», купленный «Уютный интерьер» — комплектацию «Уют»
    if (d.interior === undefined && this.opened && this.premisesId === 'cafe') {
      this.interior.load(preset(this.upgrades.includes('interior') ? 'cozy' : 'standard').layout);
    }
    this.prepUntil = d.prepUntil ?? -1;
    this.customName = d.name ?? null;
    this.stock.shelfBonus = this.has('showcase') ? UPGRADE_EFFECT.showcaseShelfDays : 0;
  }

  /** Как заведение подписано в интерфейсе и на карте */
  get title(): string {
    return this.customName ?? this.premises.mine;
  }

  /** Переименовать: лишние пробелы убираются, пустое название возвращает стандартное */
  rename(name: string): void {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, CAFE_NAME_MAX);
    this.customName = clean || null;
  }

  has(id: UpgradeId): boolean {
    return this.upgrades.includes(id);
  }

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
      marketing: 0,
      giveaways: 0,
      newAware: {},
      awareCount: 0,
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
      servedHour: hours24(),
      capHour: hours24(),
      usedHour: hours24(),
      staffHour: hours24(),
      lostHour: {},
      lostKind: {},
      changes: [],
      extras: 0,
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

  /** Дозаказ гостя, который уже сидит: вторая кружка, выпечка к кофе. Гостем второй раз не считается. */
  sellExtra(itemId: string, minute: number): number {
    if (!this.hasItem(itemId) || !this.stock.canMake(itemId)) return 0;
    const it = this.item(itemId);
    this.stock.use(it.id);
    const price = this.pricing(it.price, minute);
    this.today.revenue += price;
    this.today.cogs += it.cost;
    this.today.sold[it.id] = (this.today.sold[it.id] ?? 0) + 1;
    this.today.extras = (this.today.extras ?? 0) + 1;
    return price;
  }

  /** Коммуналка за день при текущих часах работы */
  get utilitiesPerDay(): number {
    const hours = Math.min(MINUTES_PER_DAY, this.closeAt - this.openAt) / 60;
    const perHour = this.premises.utilitiesPerHour + this.equipment.reduce((sum, e) => sum + EQUIPMENT[e].utilitiesPerHour, 0);
    return Math.round(this.premises.utilitiesPerDay + perHour * hours);
  }

  get premises(): Premises {
    return PREMISES[this.premisesId];
  }

  /** Помещается ли позиция в это помещение (в киоске нет кухни и бара) */
  fits(id: string): boolean {
    return this.premises.kinds.includes(catalogItem(id).kind);
  }

  hasItem(id: string): boolean {
    return this.menu.some((m) => m.id === id);
  }

  /** Какого оборудования не хватает для позиции (null — всё есть) */
  missingEquipment(id: string): EquipmentId | null {
    const need = equipmentFor(catalogItem(id).kind);
    return need && !this.equipment.includes(need) ? need : null;
  }

  addItem(id: string): boolean {
    if (this.hasItem(id) || this.menu.length >= MAX_MENU || !this.fits(id) || this.missingEquipment(id)) return false;
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
    if (this.staff.length >= this.premises.maxBaristas) return null;
    // По умолчанию — каждый день; почасовой — на все часы работы кафе, игрок сужает окно до пиков
    const b: Barista = {
      id: this.nextStaffId++,
      contract,
      schedule: { days: ALL_DAYS(), from: this.openAt, to: this.closeAt },
      override: null,
      shiftActive: true,
      shiftMinutes: 0,
      shiftPaid: false,
    };
    this.staff.push(b);
    return b;
  }

  setSchedule(id: number, schedule: StaffSchedule): void {
    const b = this.staff.find((s) => s.id === id);
    if (!b) return;
    b.schedule = { days: [...schedule.days], from: schedule.from, to: schedule.to };
    // Сменный, которому сегодня выходной по новому графику, на смену не выходит (если ещё не начал)
    if (b.contract === 'shift' && !b.shiftPaid) b.shiftActive = b.schedule.days[this.weekday];
  }

  /** По графику ли бариста сейчас (без учёта разового вызова) */
  scheduledNow(b: Barista, minute = this.nowMinute): boolean {
    const { days, from, to } = b.schedule;
    const m = Math.floor(minute);
    if (days[this.weekday] && m >= from && m < Math.min(to, MINUTES_PER_DAY)) return true;
    // Хвост окна после полуночи — по графику вчерашнего дня
    const yesterday = (this.weekday + 6) % 7;
    return to > MINUTES_PER_DAY && days[yesterday] && m < to - MINUTES_PER_DAY;
  }

  fire(id: number): void {
    this.staff = this.staff.filter((b) => b.id !== id);
  }

  /** Разово вызвать или отпустить почасового — до конца календарного дня, график не меняется */
  setOnDuty(id: number, onDuty: boolean): void {
    const b = this.staff.find((s) => s.id === id);
    if (b?.contract !== 'hourly') return;
    b.override = onDuty === this.scheduledNow(b) ? null : { day: this.day, on: onDuty };
  }

  /** Работает ли бариста прямо сейчас (при открытом кафе) */
  isWorking(b: Barista): boolean {
    // Разовое решение на сегодня — вызвать почасового или отпустить любого (отгул)
    if (b.override && b.override.day === this.day && !b.override.on) return false;
    if (b.contract === 'shift') return b.shiftActive && b.shiftMinutes < ECONOMY.shiftHours * 60;
    if (b.override && b.override.day === this.day) return b.override.on;
    return this.scheduledNow(b);
  }

  /** Сколько бариста сейчас за стойкой */
  get baristas(): number {
    return this.staff.filter((b) => this.isWorking(b)).length;
  }

  /** Минут на одного гостя у одного «места за стойкой» */
  get serviceMinutes(): number {
    const base = this.baristas > 0 ? 2 : 4;
    return (this.has('machine') ? base * UPGRADE_EFFECT.machineService : base) * this.serviceFactor;
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
    this.nowMinute = minute;
    if (!this.isOpenAt(minute)) return result;
    this.payStaff(minute);

    while (minute >= this.prepUntil && this.slots.length < this.counters && this.queue.length > 0) {
      const q = this.queue.shift()!;
      this.slots.push({ ...q, left: this.serviceMinutes });
    }
    // Загрузка стойки по часам — для отчёта «когда было тесно, а когда пусто»
    const t = this.today;
    const h = Math.floor(minute / 60) % 24;
    (t.capHour ??= hours24())[h] += this.counters * dt;
    (t.usedHour ??= hours24())[h] += Math.min(this.slots.length, this.counters) * dt;
    (t.staffHour ??= hours24())[h] += this.baristas * dt;
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
      const price = this.pricing(it.price, minute);
      this.today.revenue += price;
      this.today.cogs += it.cost;
      this.today.sold[it.id] = (this.today.sold[it.id] ?? 0) + 1;
      (this.today.servedHour ??= hours24())[h] += 1;
      result.sales.push({ residentId: s.residentId, itemId: it.id, price });
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
        b.shiftActive = b.schedule.days[this.weekday];
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
      r.rent = this.premises.rentPerDay;
      r.utilities = this.utilitiesPerDay;
      r.wages = Math.round(this.wagesToday);
      r.tax = Math.round(r.revenue * ECONOMY.taxRate);
    }
    r.profit = r.revenue - r.purchases - r.rent - r.utilities - r.wages - r.tax - r.marketing - (r.other ?? 0);
    this.today = Cafe.emptyDay(nextDay);
    this.wagesToday = 0;
    this.prepUntil = -1;
    return r;
  }
}
