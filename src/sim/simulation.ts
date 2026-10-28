import { canPlace, furniture, type FurnitureId, Interior, INTERIOR, preset, type PresetId } from './interior';
import { Cafe, CATALOG, hours24, scheduleText, validWindow, weekHoursText, type DayHours, type StaffSchedule, MAX_QUEUE, type CafeSave, type Change, type Contract, type DayReport, type RejectReason, type MenuItem } from './cafe';
import { emptyHistory, LOAN, LOAN_LABEL, LOAN_TERMS, weeklyPayment, type Loan, type LoanHistory, type Offer as LoanOffer, type LoanSource } from './loans';
import { DISH_EFFECT, isDish, SIGNATURE_MATCH, type AddInId, type BaseId } from './dishes';
import { tasteMatch } from './character';
import { dayNumber, hm, isWeekend, MINUTES_PER_DAY, minuteOfDay, weekday } from './clock';
import { evaluate, rejectReason, rollWant, type Want } from './demand';
import { ECONOMY, EQUIPMENT, formatMoney, PREMISES, type EquipmentId, type PremisesId } from './economy';
import { rateVisit, remember, type Memory } from './character';
import { currentEntry, generateResidents, isFemale, type Resident, type ResidentKind, type ScheduleEntry } from './residents';
import { MARKETING, Marketing, type AwareSource, type HappyHours } from './marketing';
import { Rng } from './rng';
import { INGREDIENTS, ingredient, recipeCost, recipeOf, STARTER_KEEP, STARTER_KEEP_WEEKEND, type IngredientId } from './stock';
import { Rival, RIVAL, type RivalSave } from './rival';
import { addNote, LOYAL, newsLine, STATUS_WINDOW, pickRegulars, statusOf, type Regular } from './regulars';
import { MILESTONES, upgrade, UPGRADE_EFFECT, type MilestoneId, type UpgradeId } from './milestones';
import { card, EVENTS, resultLine, supplierPrice, type EventId, type PendingEvent } from './events';
import { rollWeather, windFor, type Weather } from './weather';
import {
  entrancesOf,
  nearestFront,
  place,
  snapToWalkway,
  walkLength,
  walkPath,
  withLane,
  type Entrance,
  type Place,
  type Point,
} from './world';

/** Шаг симуляции в игровых минутах. Мелкий — чтобы движение было плавным. */
const STEP = 0.2;
/** Меняется, когда сохранения старой версии больше нельзя загрузить */
export const SAVE_VERSION = 2;
const NB = '\u00a0';

/** Сколько порций новой добавки заказать и держать, когда придумано блюдо */
const DISH_STARTER = 15;
/** Совпадение вкуса, с которого житель считается поклонником позиции */
const TASTE_FAN = 0.3;
/** Версия карты: сохранения со старой картой загружаются, но жители встают на новые места */
export const MAP_VERSION = 2;

export interface SaveData {
  version: number;
  /** Нет — сохранение до Садовой (карта 1) */
  map?: number;
  seed: number;
  time: number;
  day: number;
  carry: number;
  rng: number;
  skyRng: number;
  cash: number;
  daysInRed: number;
  bankrupt: boolean;
  reports: DayReport[];
  weather: Weather;
  forecast: Weather;
  marketing: Pick<Marketing, 'sign' | 'flyers' | 'socialDaysLeft' | 'happy' | 'loyaltyCard'>;
  flyersToday: boolean;
  cafe: CafeSave;
  rival?: RivalSave | null;
  regulars?: Pick<Regular, 'residentId' | 'history' | 'status' | 'lostReason'>[];
  pendingEvent?: PendingEvent | null;
  effects?: Effect[];
  lastEvent?: Partial<Record<EventId, number>>;
  eventRng?: number;
  milestones?: Partial<Record<MilestoneId, number>>;
  loan?: Loan | null;
  loanHistory?: LoanHistory;
  residents: {
    pos: Point;
    placeId: string;
    /** [выходной ли день, номер занятия в расписании] */
    entry: [number, number];
    visit: Resident['visit'];
    rivalVisit?: Resident['rivalVisit'];
    activity: Resident['activity'];
    path: Point[];
    walking: boolean;
    visible: boolean;
    loyalty: number;
    decision: Resident['decision'];
    aware: boolean;
    noticed: boolean;
    coffeeCount: number;
    lastVisit?: number;
    memory?: Resident['memory'];
  }[];
}

/** Когда поставщик привозит заказ */
const DELIVERY_AT = hm(6);
/** Шанс дозаказа у тех, кто сидит в кафе */
export const EXTRA = { bar: 0.7, coffee: 0.4, tea: 0.35, lunch: 0.35 } as const;

/** Дольше этого житель не ждёт заказ и уходит по делам */
const PATIENCE = 30;

export type SimEvent =
  | { type: 'sale'; residentId: number; price: number; itemId: string }
  | { type: 'reject'; residentId: number; reason: RejectReason }
  | { type: 'day'; report: DayReport }
  | { type: 'delivery'; cost: number }
  | { type: 'aware'; residentId: number; source: AwareSource }
  | { type: 'bankrupt' }
  | { type: 'rival'; what: 'open' | 'promo' }
  | { type: 'milestone'; id: MilestoneId }
  | { type: 'event'; id: EventId };

/** Последствия событий, которые длятся какое-то время */
export type Effect =
  /** Сломалась кофемашина: без кофе (или медленнее, если есть вторая) до этого времени */
  | { type: 'broken'; until: number; slow: boolean }
  /** Праздник: гости охотнее заходят весь день */
  | { type: 'boost'; day: number; factor: number }
  /** Заказ офиса: в этот день и минуту забирают qty порций itemId */
  | { type: 'order'; day: number; minute: number; itemId: string; qty: number; pay: number }
  /** Блогер: на этот день выйдет обзор (или не выйдет) */
  | { type: 'blogger'; day: number; success: boolean };

/** Ядро симуляции. Не знает ничего об отрисовке — этот же код
 *  на этапе 2 переедет на сервер. */
export class Simulation {
  /** Игровое время в минутах с начала первого дня */
  time: number;
  readonly residents: Resident[];
  readonly cafe = new Cafe();
  readonly marketing = new Marketing();
  /** Конкурент в соседнем помещении — появляется после открытия игрока */
  rival: Rival | null = null;
  /** Знакомые лица — шесть жителей, за которыми видна история */
  readonly regulars: Regular[];
  private readonly regularById = new Map<number, Regular>();
  /** Достигнутые вехи: id → день */
  readonly milestones: Partial<Record<MilestoneId, number>> = {};
  /** Текущий кредит (один за раз) и кредитная история */
  loan: Loan | null = null;
  loanHistory: LoanHistory = emptyHistory();
  /** Событие, по которому ждём решения игрока */
  pendingEvent: PendingEvent | null = null;
  effects: Effect[] = [];
  /** Когда какое событие было в последний раз — чтобы не повторялись подряд */
  private lastEvent: Partial<Record<EventId, number>> = {};
  /** Свой генератор для событий: они не сдвигают жизнь жителей */
  private readonly eventRng: Rng;
  private flyersToday = false;
  cash: number = ECONOMY.startCash;
  daysInRed = 0;
  bankrupt = false;
  readonly reports: DayReport[] = [];
  private events: SimEvent[] = [];
  private readonly rng: Rng;
  private carry = 0;
  private day: number;
  /** Отдельный генератор для погоды — чтобы она не сдвигала жизнь жителей */
  private readonly skyRng: Rng;
  weather: Weather;
  forecast: Weather;

  readonly seed: number;

  constructor(seed = 1, startTime = hm(6, 0)) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.skyRng = new Rng(seed * 7919 + 13);
    this.eventRng = new Rng(seed * 104729 + 7);
    this.time = startTime;
    this.day = dayNumber(startTime);
    this.cafe.today = Cafe.emptyDay(this.day);
    // Первый день — ясно, дальше как повезёт
    this.weather = { kind: 'sunny', temp: 21, wind: 0 };
    this.forecast = this.rollForecast(this.day + 1);
    this.residents = generateResidents(this.rng, seed);
    this.regulars = pickRegulars(this.residents);
    for (const g of this.regulars) this.regularById.set(g.residentId, g);
    this.cafe.pricing = (price, minute) => this.marketing.priceAt(price, minute);
    this.applyDaySchedules();
    // Каждого ставим туда, где он должен быть в стартовую минуту
    for (const r of this.residents) {
      const entry = currentEntry(r.schedule, minuteOfDay(this.time));
      r.entry = entry;
      r.activity = entry.activity;
      this.placeAt(r, entry.placeId);
    }
  }

  // ——— Сохранение ———

  /** Всё, что меняется по ходу игры. Жители-«статика» (имена, расписания, вкусы) восстанавливаются из seed. */
  serialize(): SaveData {
    return {
      version: SAVE_VERSION,
      map: MAP_VERSION,
      seed: this.seed,
      time: this.time,
      day: this.day,
      carry: this.carry,
      rng: this.rng.snapshot,
      skyRng: this.skyRng.snapshot,
      cash: this.cash,
      daysInRed: this.daysInRed,
      bankrupt: this.bankrupt,
      reports: this.reports,
      weather: this.weather,
      forecast: this.forecast,
      marketing: { ...this.marketing },
      flyersToday: this.flyersToday,
      cafe: this.cafe.toJSON(),
      rival: this.rival?.toJSON() ?? null,
      regulars: this.regulars.map((g) => ({ residentId: g.residentId, history: g.history, status: g.status, lostReason: g.lostReason })),
      milestones: { ...this.milestones },
      pendingEvent: this.pendingEvent,
      effects: this.effects,
      lastEvent: { ...this.lastEvent },
      eventRng: this.eventRng.snapshot,
      loan: this.loan,
      loanHistory: this.loanHistory,
      residents: this.residents.map((r) => {
        const weekend = r.weekend.includes(r.entry);
        return {
          pos: r.pos,
          placeId: r.placeId,
          entry: [weekend ? 1 : 0, (weekend ? r.weekend : r.weekday).indexOf(r.entry)] as [number, number],
          visit: r.visit,
          rivalVisit: r.rivalVisit,
          activity: r.activity,
          path: r.path,
          walking: r.walking,
          visible: r.visible,
          loyalty: r.loyalty,
          decision: r.decision,
          aware: r.aware,
          noticed: r.noticed,
          coffeeCount: r.coffeeCount,
          lastVisit: r.lastVisit,
          memory: r.memory,
        };
      }),
    };
  }

  /** Восстановить игру из сохранения. null — если сохранение от старой версии игры. */
  static restore(d: SaveData): Simulation | null {
    if (d.version !== SAVE_VERSION) return null;
    const sim = new Simulation(d.seed);
    // Жителей Садовой добавили в конец списка: в старом сохранении их нет — они начнут день как в новой игре
    if (d.residents.length > sim.residents.length) return null;
    sim.time = d.time;
    sim.day = d.day;
    sim.carry = d.carry;
    sim.rng.snapshot = d.rng;
    sim.skyRng.snapshot = d.skyRng;
    sim.cash = d.cash;
    sim.daysInRed = d.daysInRed;
    sim.bankrupt = d.bankrupt;
    sim.reports.push(...d.reports);
    sim.weather = d.weather;
    sim.forecast = d.forecast;
    Object.assign(sim.marketing, d.marketing);
    sim.flyersToday = d.flyersToday;
    sim.cafe.load(d.cafe);
    // Сохранения до конкурента: он появится через несколько дней, как у новой игры
    sim.rival = d.rival ? Rival.load(d.rival) : d.cafe.opened ? new Rival(sim.cafe.premisesId, d.day + RIVAL.delayDays) : null;
    for (const s of d.regulars ?? []) {
      const g = sim.regularById.get(s.residentId);
      if (g) Object.assign(g, { history: s.history, status: s.status, lostReason: s.lostReason });
    }
    Object.assign(sim.milestones, d.milestones ?? {});
    sim.pendingEvent = d.pendingEvent ?? null;
    sim.effects = d.effects ?? [];
    sim.lastEvent = { ...(d.lastEvent ?? {}) };
    if (d.eventRng !== undefined) sim.eventRng.snapshot = d.eventRng;
    sim.loan = d.loan ?? null;
    sim.loanHistory = { ...emptyHistory(), ...(d.loanHistory ?? {}) };
    sim.applyDaySchedules();
    d.residents.forEach((s, i) => {
      const r = sim.residents[i];
      const list = s.entry[0] ? r.weekend : r.weekday;
      Object.assign(r, {
        pos: s.pos,
        placeId: s.placeId,
        entry: list[s.entry[1]] ?? r.schedule[0],
        visit: s.visit,
        rivalVisit: s.rivalVisit ?? null,
        activity: s.activity,
        path: s.path,
        walking: s.walking,
        visible: s.visible,
        loyalty: s.loyalty,
        decision: s.decision,
        aware: s.aware,
        noticed: s.noticed,
        coffeeCount: s.coffeeCount,
        lastVisit: s.lastVisit ?? 0,
        memory: s.memory ?? [],
      });
    });
    // Карта поменялась: кто был в пути — идёт дальше по новым тротуарам, кто на месте — встаёт к новой двери
    if ((d.map ?? 1) !== MAP_VERSION) {
      for (const r of sim.residents.slice(0, d.residents.length)) {
        if (r.walking) {
          r.pos = snapToWalkway(r.pos);
          r.path = sim.route(r, place(r.placeId), null);
        } else {
          const p = place(r.placeId);
          if (p.kind !== 'park' || r.pos.y < p.rect.y || r.pos.x < p.rect.x) r.pos = sim.spotIn(p);
        }
      }
    }
    return sim;
  }

  // ——— Команды игрока ———

  /** Открыть бизнес в выбранном помещении: кафе с залом или киоск у метро */
  openCafe(premisesId: PremisesId = 'cafe'): boolean {
    const pr = PREMISES[premisesId];
    if (this.cafe.opened || this.bankrupt || this.cash < pr.openingCost) return false;
    this.cash -= pr.openingCost;
    this.cafe.premisesId = premisesId;
    this.cafe.opened = true;
    // Два столика входят в открытие кафе; у киоска зала нет
    if (premisesId === 'cafe') this.cafe.interior.load(preset('standard').layout);
    // В киоске нет кухни и бара — стартовое меню без них
    for (const m of [...this.cafe.menu]) if (!this.cafe.fits(m.id)) this.cafe.removeItem(m.id);
    if (!this.cafe.hasItem('croissant')) this.cafe.addItem('croissant');
    this.note('open', `${pr.name}: открыто`, undefined, '');
    this.rival = new Rival(premisesId, this.day + RIVAL.delayDays);
    // Сразу знают соседи и продавцы напротив; у киоска — те, кто ходит через метро
    for (const r of this.residents) {
      const neighbour =
        premisesId === 'cafe' ? r.homeId === 'home-1' || r.homeId === 'home-2' : r.homeId === 'metro' && r.kind !== 'visitor';
      const p = r.kind === 'shopkeeper' ? 1 : neighbour ? (premisesId === 'cafe' ? 0.7 : 0.35) : 0.1;
      if (this.rng.chance(p)) this.learn(r, 'start');
    }
    // Стартовая закупка входит в стоимость открытия; автозаказ включён на тех же уровнях
    for (const ing of INGREDIENTS) {
      const qty = STARTER_KEEP[ing.id];
      this.cafe.stock.keep[ing.id] = qty;
      this.cafe.stock.keepWeekend[ing.id] = STARTER_KEEP_WEEKEND[ing.id];
      if (qty > 0) this.cafe.stock.addNow(ing.id, qty, this.day, ing.unitCost);
    }
    return true;
  }

  setPrice(itemId: string, price: number): void {
    const it = this.cafe.item(itemId);
    const from = it.price;
    it.price = Math.max(ECONOMY.priceStep, Math.round(price / ECONOMY.priceStep) * ECONOMY.priceStep);
    this.note(`price:${itemId}`, it.name, formatMoney(from), formatMoney(it.price));
  }

  /** closeAt может быть больше 24:00 (работа через полночь); openAt + 24 ч — круглосуточно */
  setHours(openAt: number, closeAt: number): void {
    if (closeAt <= openAt || closeAt - openAt > MINUTES_PER_DAY) return;
    this.setWeekHours(Array.from({ length: 7 }, () => ({ openAt, closeAt })));
  }

  /** Часы в один день недели (0 — понедельник); null — выходной */
  setDayHours(day: number, hours: DayHours | null): void {
    if (day < 0 || day > 6) return;
    const week = this.cafe.week.map((h) => (h ? { ...h } : null));
    week[day] = hours ? { ...hours } : null;
    this.setWeekHours(week);
  }

  /** Часы на всю неделю. Хотя бы один рабочий день; ночь не заходит на открытие следующего дня. */
  setWeekHours(week: (DayHours | null)[]): void {
    if (week.length !== 7 || week.every((h) => !h)) return;
    for (let i = 0; i < 7; i++) {
      const h = week[i];
      if (!h) continue;
      if (h.closeAt <= h.openAt || h.closeAt - h.openAt > MINUTES_PER_DAY) return;
    }
    const from = weekHoursText(this.cafe.week);
    this.cafe.week = week.map((h) => (h ? { ...h } : null));
    const to = weekHoursText(this.cafe.week);
    if (from !== to) this.note('hours', 'Часы работы', from, to);
  }

  hireBarista(contract: Contract): boolean {
    const b = this.cafe.hire(contract);
    if (b) this.note(`staff:${b.id}`, 'Нанят бариста', undefined, contract === 'shift' ? 'на смену' : 'почасово');
    return b !== null;
  }

  fireBarista(id: number): void {
    const b = this.cafe.staff.find((x) => x.id === id);
    if (!b) return;
    this.cafe.fire(id);
    const list = this.cafe.today.changes ?? [];
    const hired = list.findIndex((c) => c.key === `staff:${id}`);
    // Нанял и уволил в тот же день — в истории ничего не было
    if (hired >= 0) list.splice(hired, 1);
    else this.note(`staff:${id}`, 'Уволен бариста', undefined, b.contract === 'shift' ? 'на смене' : 'почасовой');
  }

  /** Разово вызвать или отпустить почасового бариста — только на сегодня */
  setOnDuty(id: number, onDuty: boolean): void {
    this.cafe.setOnDuty(id, onDuty);
  }

  /** График бариста: дни недели и (для почасового) часы. Действует сразу */
  setStaffSchedule(id: number, schedule: StaffSchedule): void {
    const b = this.cafe.staff.find((x) => x.id === id);
    if (!b) return;
    if (!validWindow(schedule) || schedule.windows?.some((w) => w && !validWindow(w))) return;
    const from = scheduleText(b);
    this.cafe.setSchedule(id, schedule);
    const n = this.cafe.staff.indexOf(b) + 1;
    this.note(`schedule:${id}`, `График бариста ${n}`, from, scheduleText(b));
  }

  /** Промотать до 6:00 следующего утра (если сейчас раньше 6:00 — до сегодняшних 6:00) */
  skipToMorning(): void {
    const left = (hm(6) - this.minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    this.advance(left < 1 ? MINUTES_PER_DAY : left);
  }

  addMenuItem(id: string): boolean {
    const ok = this.cafe.addItem(id);
    if (ok) this.toggle(`menu:${id}`, `Меню: ${itemName(id, this.cafe.own)}`, 'добавлен', 'убран', true);
    return ok;
  }

  /** Придумать своё блюдо: основа + добавки, своё название и цена. Сразу встаёт в меню */
  createDish(baseId: BaseId, addIns: AddInId[], name: string, price: number): boolean {
    const it = this.cafe.createDish(baseId, addIns, name, price);
    if (!it) return false;
    // Новых добавок на складе нет: ставим автозаказ и заказываем сразу — привезут утром
    const stock = this.cafe.stock;
    for (const id of Object.keys(recipeOf(it.id)) as IngredientId[]) {
      if (stock.keep[id] > 0 || stock.qty(id) > 0) continue;
      stock.keep[id] = DISH_STARTER;
      stock.keepWeekend[id] = DISH_STARTER;
      stock.order(id, DISH_STARTER - (stock.pending[id] ?? 0));
    }
    this.toggle(`menu:${it.id}`, `Своё блюдо: ${it.name}`, 'убрано', 'в меню', true);
    return true;
  }

  /** Сколько жителей улицы считают позицию «своим вкусом» и кто это — для конструктора блюд */
  tasteFans(itemId: string): { fans: number; total: number; byKind: [ResidentKind, number][] } {
    const locals = this.residents;
    const byKind = new Map<ResidentKind, number>();
    let fans = 0;
    for (const r of locals) {
      if (tasteMatch(r.character, itemId) < TASTE_FAN) continue;
      fans += 1;
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    }
    return { fans, total: locals.length, byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]) };
  }

  /** Забыть своё блюдо, чтобы придумать другое */
  deleteDish(id: string): boolean {
    const name = itemName(id, this.cafe.own);
    const ok = this.cafe.deleteDish(id);
    if (ok) this.toggle(`menu:${id}`, `Своё блюдо: ${name}`, 'в меню', 'убрано', false);
    return ok;
  }

  removeMenuItem(id: string): boolean {
    const name = itemName(id, this.cafe.own);
    const ok = this.cafe.removeItem(id);
    if (ok) this.toggle(`menu:${id}`, `Меню: ${name}`, 'добавлен', 'убран', false);
    return ok;
  }

  // ——— История изменений ———

  /** Записать изменение. Повторные правки того же за день склеиваются, возврат к исходному — стирает запись. */
  private note(key: string, text: string, from: string | undefined, to: string, when?: string): void {
    const list = (this.cafe.today.changes ??= []);
    const minute = Math.floor(this.minute);
    const prev = list.find((c) => c.key === key);
    if (prev) {
      prev.to = to;
      prev.minute = minute;
      if (prev.from !== undefined && prev.from === to) list.splice(list.indexOf(prev), 1);
      return;
    }
    if (from !== undefined && from === to) return;
    const c: Change = { minute, key, text, to };
    if (from !== undefined) c.from = from;
    if (when) c.when = when;
    list.push(c);
  }

  /** Вкл/выкл: включил и выключил в тот же день — записи нет */
  private toggle(key: string, text: string, onWord: string, offWord: string, on: boolean, when?: string): void {
    this.note(key, text, on ? offWord : onWord, on ? onWord : offWord, when);
    // Для переключателей показываем только итог: «Меню: Раф — добавлен»
    const c = this.cafe.today.changes?.find((x) => x.key === key);
    if (c) c.toggle = true;
  }

  /** Сколько стоит день и на сколько дней хватит денег */
  cashOutlook(): { daily: number; days: number; inRed: number; daysToBankrupt: number } {
    const last = this.reports.at(-1);
    const shiftWages = this.cafe.staff.filter((b) => b.contract === 'shift').length * ECONOMY.shiftWage;
    const wages = last?.opened ? Math.max(last.wages, shiftWages) : shiftWages;
    const pr = this.cafe.premises;
    const daily =
      pr.rentPerDay + this.cafe.utilitiesPerDay + wages + (this.marketing.flyers ? MARKETING.flyersPerDay : 0);
    return {
      daily,
      days: this.cash > 0 ? Math.floor(this.cash / daily) : 0,
      inRed: this.daysInRed,
      daysToBankrupt: ECONOMY.bankruptDays - this.daysInRed,
    };
  }

  // ——— Время ———

  /** Продвинуть время на dt игровых минут */
  advance(dt: number): void {
    if (this.bankrupt) return;
    this.carry += dt;
    while (this.carry >= STEP && !this.bankrupt) {
      this.carry -= STEP;
      this.step(STEP);
    }
  }

  /** Забрать накопившиеся события (для отрисовки и интерфейса) */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  get onStreet(): number {
    return this.residents.filter((r) => r.visible).length;
  }

  /** Сколько гостей сейчас внутри кафе: в очереди и за столиками */
  get guestsInside(): number {
    return this.residents.filter((r) => r.placeId === this.shopId && !r.walking).length;
  }

  /** Где на карте бизнес игрока */
  get shopId(): string {
    return this.cafe.premises.placeId;
  }

  get minute(): number {
    return minuteOfDay(this.time);
  }

  private step(dt: number): void {
    const wasOpen = this.cafe.isOpenAt(this.minute);
    const before = this.minute;
    this.time += dt;
    const minute = this.minute;

    const today = dayNumber(this.time);
    if (today !== this.day) this.closeDay(today);
    if (this.bankrupt) return;

    // Поставщик привозит заказы в 6:00
    if (before < DELIVERY_AT && minute >= DELIVERY_AT) this.receiveDelivery();

    if (wasOpen && !this.cafe.isOpenAt(minute)) {
      // Закрылись — недообслуженные уходят
      for (const id of this.cafe.flush()) this.dropVisit(this.residents[id], 'closed');
    }

    for (const r of this.residents) {
      const entry = currentEntry(r.schedule, minute);
      // Пока житель в кафе и ещё не получил заказ, следующее занятие подождёт
      const waiting = r.visit && r.visit.stage !== 'dining' && this.time - r.visit.since < PATIENCE;
      if (entry !== r.entry && !waiting) this.onTransition(r, entry);
      if (r.visit?.stage === 'dining' && this.time >= r.visit.until) this.finishVisit(r);
      if (r.rivalVisit?.until != null && this.time >= r.rivalVisit.until) {
        r.rivalVisit = null;
        this.goTo(r, r.entry.placeId);
      }
      if (r.walking) this.walk(r, dt);
    }

    this.cafe.serviceFactor = this.effects.some((e) => e.type === 'broken' && e.slow && this.time < e.until) ? 1.5 : 1;
    this.fulfilOrders(minute);
    const { sales, failed } = this.cafe.tick(dt, minute);
    for (const sale of sales) this.onSale(sale.residentId, sale.price, sale.itemId);
    for (const id of failed) this.runOut(this.residents[id]);
  }

  // ——— Жители и кафе ———

  private onTransition(r: Resident, entry: ScheduleEntry): void {
    const prev = r.entry;
    r.entry = entry;
    r.activity = entry.activity;
    if (r.visit) this.dropVisit(r, 'no-time');
    r.rivalVisit = null;

    const want = rollWant(this.rng, r, entry, prev, this.weather.kind, isWeekend(this.day));
    if (want && this.decide(r, want, entry)) {
      this.goTo(r, this.shopId);
      return;
    }
    if (r.rivalVisit && this.rival) {
      this.goTo(r, this.rival.placeId);
      return;
    }
    // В дождь в сквер идут немногие — остаются дома
    if (entry.placeId === 'park' && this.weather.kind === 'rain' && this.rng.chance(0.6) && r.homeId !== 'metro') {
      this.goTo(r, r.homeId);
      return;
    }
    this.goTo(r, entry.placeId);
  }

  /** Решение «зайти или нет». true — житель идёт в кафе. */
  private decide(r: Resident, want: Want, entry: ScheduleEntry): boolean {
    const cafe = this.cafe;
    const minute = Math.floor(this.minute);
    const base = { day: this.day, minute, want: want.kind, budget: r.budget[want.kind] };
    cafe.today.wanted += 1;

    let reason: RejectReason | null = null;
    let itemId: string | undefined;
    let price: number | undefined;
    if (!cafe.opened) reason = 'not-open';
    // Дорога до кафе занимает несколько минут — проверяем с запасом
    else if (!cafe.isOpenAt(minute) || !cafe.isOpenAt(minuteOfDay(minute + 10))) reason = 'closed';
    else if (!r.aware) reason = 'unaware';
    // Открыто, но за стойкой никого: владелец отработал свои часы, бариста нет — видно издалека
    else if (cafe.unstaffed) reason = 'no-staff';
    else {
      // Житель видит цены с учётом счастливых часов
      const menu = cafe.menu.filter((m) => !this.blocked(m.kind)).map((m) => ({ ...m, price: this.marketing.priceAt(m.price, minute) }));
      const offer = evaluate(r, want, menu, r.pos, place(this.shopId).front, nearestFront(place(entry.placeId), r.pos), this.weather.kind);
      itemId = offer.item?.id;
      price = offer.item?.price;
      const pP = offer.item ? Math.min(1, offer.p * this.boost * this.cozyPull(r, want)) : 0;
      // Фирменное блюдо по вкусу есть только здесь — конкурент переманивает вдвое реже
      const signature = offer.item && isDish(offer.item.id) && offer.match >= SIGNATURE_MATCH ? DISH_EFFECT.rivalPull : 1;
      const pR = this.rivalChance(r, want, entry, minute) * signature;
      if (!offer.item) reason = 'no-item';
      else if (pR <= 0) {
        if (!this.rng.chance(pP)) reason = rejectReason(offer, r.budget[want.kind]);
      } else if (!this.rng.chance(1 - (1 - Math.min(1, pP)) * (1 - Math.min(1, pR)))) {
        reason = rejectReason(offer, r.budget[want.kind]);
      } else if (!this.rng.chance(pP / (pP + pR))) {
        // Зашёл бы, но выбрал конкурента: дешевле, ближе или открыт, когда ты закрыт
        reason = 'rival';
        r.rivalVisit = { until: null, dwell: this.rival!.t.seats ? want.dwell : 0 };
      }
      if (reason === 'no-item') {
        const mk = cafe.today.missingKinds;
        mk[want.kind] = (mk[want.kind] ?? 0) + 1;
      }
    }
    // Не к тебе — может, к конкуренту: он открыт и у него есть нужное
    if (reason && reason !== 'rival' && reason !== 'not-open' && this.rival) {
      const pR = this.rivalChance(r, want, entry, minute);
      if (pR > 0 && this.rng.chance(pR)) r.rivalVisit = { until: null, dwell: this.rival.t.seats ? want.dwell : 0 };
    }

    if (reason) {
      r.decision = { ...base, visited: false, reason, itemId, price };
      if (reason !== 'not-open' && reason !== 'unaware') this.noteRegular(r, false, reason, itemId);
      this.miss(r, reason);
      return false;
    }
    r.decision = { ...base, visited: true, itemId, price };
    // Без зала всё навынос: купил и пошёл по своим делам
    const visitWant = cafe.premises.seats ? want : { ...want, mode: 'stopover' as const, dwell: 0 };
    r.visit = { want: visitWant, itemId: itemId!, stage: 'going', until: 0, since: this.time };
    return true;
  }

  /** Уютный зал тянет: посидеть идут охотнее, чем взять с собой; любимая вещь в зале — ещё немного */
  private cozyPull(r: Resident, want: Want): number {
    if (this.cafe.premisesId === 'kiosk') {
      // Стойка киоска: меню видно издалека, обжитый вид тоже тянет
      return 1 + (this.cafe.has('board') ? UPGRADE_EFFECT.boardPull : 0) + (this.cafe.has('shelves') ? UPGRADE_EFFECT.shelvesPull : 0);
    }
    if (this.cafe.premisesId !== 'cafe') return 1;
    const hall = this.cafe.interior;
    const sit = want.mode === 'replace';
    return 1 + hall.cozyLevel * (sit ? INTERIOR.attractSit : INTERIOR.attractGo) + (sit && hall.likes(r.kind) ? 0.05 : 0);
  }

  /** Насколько житель склонен пойти к конкуренту с этим желанием прямо сейчас (0 — никак) */
  private rivalChance(r: Resident, want: Want, entry: ScheduleEntry, minute: number): number {
    const rival = this.rival;
    if (!rival || !rival.isOpen(this.day, minute) || !rival.isOpen(this.day, minute + 10)) return 0;
    const o = evaluate(r, want, rival.menu(this.day), r.pos, place(rival.placeId).front, nearestFront(place(entry.placeId), r.pos), this.weather.kind);
    // Конкурент — сетевой, о нём знают все; лояльность к нему не растёт
    return o.item ? o.pPrice * o.pRoute * 0.8 : 0;
  }

  private onArrive(r: Resident): void {
    if (this.rival && r.rivalVisit && r.placeId === this.rival.placeId && r.rivalVisit.until === null) {
      r.rivalVisit.until = this.time + Math.max(2, r.rivalVisit.dwell);
      this.rival.servedToday += 1;
      return;
    }
    const v = r.visit;
    if (r.placeId !== this.shopId || v?.stage !== 'going') return;
    if (!this.cafe.isOpenAt(this.minute)) return this.dropVisit(r, 'closed');
    if (this.cafe.unstaffed) return this.dropVisit(r, 'no-staff');
    // Пришёл, а нужного нет: берёт замену, если есть, иначе уходит недовольным
    if (!this.cafe.stock.canMake(v.itemId) || this.blocked(this.cafe.item(v.itemId).kind)) {
      const available = this.cafe.menu.filter((m) => this.cafe.stock.canMake(m.id) && !this.blocked(m.kind));
      const alt = evaluate(r, v.want, available, r.pos, r.pos, r.pos, this.weather.kind).item;
      if (!alt) return this.runOut(r);
      v.itemId = alt.id;
      if (r.decision) r.decision = { ...r.decision, itemId: alt.id, price: alt.price };
    }
    // Торопливый, зашедший по пути, не встанет в длинную очередь
    let limit = v.want.mode === 'stopover' ? MAX_QUEUE - Math.round(2 * r.character.hurry) : MAX_QUEUE;
    // У окна киоска под дождём долго не стоят — если нет навеса
    if (this.cafe.premisesId === 'kiosk' && this.weather.kind === 'rain' && !this.cafe.has('awning')) limit -= UPGRADE_EFFECT.rainQueue;
    if (this.cafe.busy >= limit || !this.cafe.join(r.id, v.itemId)) {
      r.loyalty = Math.max(0, r.loyalty - 0.1);
      this.recall(r, v.itemId, -0.5, ['queue']);
      return this.dropVisit(r, 'queue');
    }
    v.stage = 'queued';
    v.queuedAt = this.time;
  }

  private onSale(residentId: number, price: number, itemId: string): void {
    const r = this.residents[residentId];
    this.cash += price; // продукты уже оплачены при закупке
    const card = this.marketing.loyaltyCard;
    const hall = this.cafe.premisesId === 'cafe' ? this.cafe.interior : null;
    const cozy = hall
      ? hall.cozyLevel * INTERIOR.loyalty + (hall.likes(r.kind) ? INTERIOR.liked : 0)
      : this.cafe.has('shelves')
        ? UPGRADE_EFFECT.shelvesLoyalty
        : 0;
    // Как понравилось: вкус, цена, ожидание. Хороший визит привязывает сильнее, плохой — почти нет
    const item = this.cafe.item(itemId);
    const wait = r.visit ? this.time - (r.visit.queuedAt ?? r.visit.since) : 0;
    const firstTry = !r.memory.some((m) => m.itemId === itemId);
    const fav = Object.values(r.favorites).includes(itemId);
    const rated = rateVisit(r.character, itemId, price, r.budget[item.kind], wait, firstTry, fav);
    r.memory = remember(r.memory, { day: this.day, itemId, score: rated.score, notes: rated.notes });
    // Средний визит (балл ≈0,15) даёт прежний прирост; отличный — до ×1,5, плохой — ×0,3
    const gain = (card ? 0.15 : 0.1) * Math.min(1.5, Math.max(0.3, 0.9 + 0.6 * rated.score));
    // Уютный зал привязывает сильнее: постоянные гости приходят всё чаще, потолок привязанности выше
    const cap = (card ? 0.5 : 0.4) + (hall ? INTERIOR.loyaltyCap * hall.cozyLevel : 0);
    r.loyalty = Math.max(0, Math.min(cap, r.loyalty + gain + cozy));
    r.lastVisit = this.day;
    this.noteRegular(r, true, undefined, itemId);
    // Карта лояльности: каждый N-й кофе — в подарок
    if (card && this.cafe.item(itemId).kind === 'coffee') {
      r.coffeeCount += 1;
      if (r.coffeeCount % MARKETING.loyaltyEvery === 0) {
        this.cash -= price;
        this.cafe.today.revenue -= price;
        this.cafe.today.giveaways += price;
      }
    }
    // Постоянный гость рассказывает соседу, коллеге или другу
    const cozyWord = hall ? 1 + INTERIOR.wordBoost * hall.cozyLevel : 1;
    if (r.loyalty >= 0.3 && this.rng.chance(MARKETING.wordChance * cozyWord)) {
      const friends = this.residents.filter(
        (o) => !o.aware && (o.homeId === r.homeId || (r.workId !== null && o.workId === r.workId) || o.kind === r.kind),
      );
      if (friends.length) this.learn(this.rng.pick(friends), 'word');
    }
    this.events.push({ type: 'sale', residentId, price, itemId });
    if (!r.visit) return;
    // Хотел посидеть, а все места заняты — берёт с собой и уходит
    if (r.visit.want.mode === 'replace' && hall && this.seated() >= hall.seats) {
      this.cafe.today.noSeat = (this.cafe.today.noSeat ?? 0) + 1;
      r.visit = null;
      this.goTo(r, r.entry.placeId);
      return;
    }
    r.visit.stage = 'dining';
    r.visit.until = this.time + r.visit.want.dwell;
    this.bringCompany(r, itemId);
    this.extraOrder(r, itemId);
    this.pastryImpulse(r, itemId);
  }

  /**
   * Постоянный гость сел в зале и привёл коллегу, соседа или друга. Чем уютнее зал, тем чаще.
   * Тот узнаёт о кафе, заказывает по своему вкусу и сам немного привязывается.
   */
  private bringCompany(r: Resident, itemId: string): void {
    if (this.cafe.premisesId !== 'cafe' || r.loyalty < LOYAL) return;
    const hall = this.cafe.interior;
    if (this.seated() >= hall.seats) return;
    if (!this.rng.chance(INTERIOR.companyBase + INTERIOR.companyCozy * hall.cozyLevel)) return;
    const near = (o: Resident): 'work' | 'home' | 'kind' | null =>
      r.workId !== null && o.workId === r.workId ? 'work' : o.homeId === r.homeId && r.homeId !== 'metro' ? 'home' : o.kind === r.kind ? 'kind' : null;
    const options = this.residents.filter((o) => o.id !== r.id && !o.visit && !o.rivalVisit && near(o) !== null);
    if (!options.length) return;
    const friend = this.rng.pick(options);
    const kind = this.cafe.item(itemId).kind;
    const menu = this.cafe.menu.filter((m) => m.kind === kind && this.cafe.stock.canMake(m.id) && !this.blocked(m.kind));
    const pick = evaluate(friend, { kind, mode: 'replace', dwell: 0 }, menu, r.pos, r.pos, r.pos, this.weather.kind).item;
    if (!pick) return;
    const price = this.cafe.sellExtra(pick.id, this.minute);
    if (price <= 0) return;
    const t = this.cafe.today;
    t.extras = Math.max(0, (t.extras ?? 1) - 1);
    t.guests += 1;
    t.company = (t.company ?? 0) + 1;
    this.cash += price;
    if (!friend.aware) this.learn(friend, 'word');
    friend.loyalty = Math.min(0.4, friend.loyalty + 0.05);
    friend.lastVisit = this.day;
    this.events.push({ type: 'sale', residentId: friend.id, price, itemId: pick.id });
    // Знакомое лицо — история в отчёт
    if (this.regularById.has(r.id)) {
      const f = isFemale(friend.name);
      const who = { work: 'коллегу', home: f ? 'соседку' : 'соседа', kind: f ? 'подругу' : 'друга' }[near(friend)!];
      const first = r.name.split(' ')[0];
      (t.news ??= []).push(`${first} ${isFemale(r.name) ? 'привела' : 'привёл'} ${who}${NB}— ${friend.name.split(' ')[0]} взял${f ? 'а' : ''} ${pick.name.toLowerCase()}`);
    }
  }

  /** Витринка с выпечкой на стойке киоска: к кофе или чаю иногда берут выпечку */
  private pastryImpulse(r: Resident, itemId: string): void {
    if (!this.cafe.has('pastry') || !r.visit) return;
    const kind = this.cafe.item(itemId).kind;
    if (kind !== 'coffee' && kind !== 'tea') return;
    const options = this.cafe.menu.filter((m) => m.kind === 'snack' && this.cafe.stock.canMake(m.id));
    if (!options.length || !this.rng.chance(UPGRADE_EFFECT.pastryChance)) return;
    const pick = evaluate(r, { kind: 'snack', mode: 'stopover', dwell: 0 }, options, r.pos, r.pos, r.pos, this.weather.kind).item;
    if (!pick) return;
    const price = this.cafe.sellExtra(pick.id, this.minute);
    if (price > 0) {
      this.cash += price;
      this.events.push({ type: 'sale', residentId: r.id, price, itemId: pick.id });
    }
  }

  /** Кто сидит, тот заказывает ещё: вторую кружку в баре, выпечку к кофе, напиток к обеду */
  private extraOrder(r: Resident, itemId: string): void {
    const v = r.visit!;
    if (v.want.mode !== 'replace' || v.want.dwell < 20) return;
    const menu = this.cafe.menu;
    // Что взять к заказу — как при выборе у стойки: привычка, вкус и цена
    const pick = (kinds: string[]): string | undefined => {
      const options = menu.filter((m) => kinds.includes(m.kind));
      if (!options.length) return undefined;
      return evaluate(r, { kind: options[0].kind, mode: 'replace', dwell: 0 }, options, r.pos, r.pos, r.pos, this.weather.kind).item?.id;
    };
    let extra: string | undefined;
    let chance = 0;
    if (v.want.kind === 'bar') [extra, chance] = [itemId, EXTRA.bar];
    else if (v.want.kind === 'coffee') [extra, chance] = [pick(['snack']), EXTRA.coffee];
    else if (v.want.kind === 'tea') [extra, chance] = [pick(['snack']), EXTRA.tea];
    else if (v.want.kind === 'lunch') [extra, chance] = [pick(['coffee', 'tea']), EXTRA.lunch];
    if (this.cafe.premisesId === 'cafe') chance = Math.min(0.95, chance * (1 + INTERIOR.extraBoost * this.cafe.interior.cozyLevel));
    if (!extra || !this.rng.chance(chance)) return;
    if (this.blocked(this.cafe.item(extra).kind)) return;
    const price = this.cafe.sellExtra(extra, this.minute);
    if (price > 0) {
      this.cash += price;
      this.events.push({ type: 'sale', residentId: r.id, price, itemId: extra });
    }
  }

  private finishVisit(r: Resident): void {
    const mode = r.visit?.want.mode;
    r.visit = null;
    // replace — житель провёл время в кафе вместо планов и сидит до следующего занятия
    if (mode === 'stopover') this.goTo(r, r.entry.placeId);
  }

  /** Визит сорвался: житель идёт по своим делам */
  private dropVisit(r: Resident, reason: RejectReason): void {
    const v = r.visit;
    if (!v) return;
    const served = v.stage === 'dining';
    this.cafe.leave(r.id);
    r.visit = null;
    if (!served) {
      if (r.decision) r.decision = { ...r.decision, visited: false, reason };
      this.noteRegular(r, false, reason, v.itemId);
      this.miss(r, reason);
    }
    if (r.placeId === this.shopId || r.walking) this.goTo(r, r.entry.placeId);
  }

  /** Запомнить неудачный визит: очередь или нечего купить */
  private recall(r: Resident, itemId: string, score: number, notes: Memory['notes']): void {
    r.memory = remember(r.memory, { day: this.day, itemId, score, notes });
  }

  /** Кончились продукты — гость уходит, доверие падает */
  private runOut(r: Resident): void {
    r.loyalty = Math.max(0, r.loyalty - 0.1);
    if (r.visit) this.recall(r, r.visit.itemId, -0.6, ['out-of-stock']);
    this.dropVisit(r, 'out-of-stock');
  }

  private receiveDelivery(): void {
    if (!this.cafe.opened) return;
    const d = this.cafe.stock.deliver(this.day);
    // Соцсети работают каждый день кампании
    if (this.marketing.socialDaysLeft > 0) {
      this.marketing.socialDaysLeft -= 1;
      for (const r of this.residents) {
        if (r.aware) continue;
        const young = r.kind === 'youth' || r.kind === 'student';
        if (this.rng.chance(young ? MARKETING.socialYoung : MARKETING.socialOther)) this.learn(r, 'social');
      }
    }
    if (this.marketing.flyers) this.flyersToday = true;
    if (d.cost > 0) {
      this.cash -= d.cost;
      this.cafe.today.purchases += d.cost;
      this.events.push({ type: 'delivery', cost: d.cost });
    }
    this.resolveBlogger();
    this.rollEvent();
  }

  private learn(r: Resident, source: AwareSource): void {
    if (r.aware) return;
    r.aware = true;
    const na = this.cafe.today.newAware;
    na[source] = (na[source] ?? 0) + 1;
    if (source !== 'start') this.events.push({ type: 'aware', residentId: r.id, source });
  }

  get awareCount(): number {
    return this.residents.filter((r) => r.aware).length;
  }

  // ——— Маркетинг: команды игрока ———

  buySign(): boolean {
    if (this.marketing.sign || !this.cafe.opened) return false;
    this.marketing.sign = true;
    this.note('sign', 'Повешена вывеска', undefined, formatMoney(MARKETING.signCost));
    this.cash -= MARKETING.signCost;
    this.cafe.today.marketing += MARKETING.signCost;
    return true;
  }

  setFlyers(on: boolean): void {
    if (on !== this.marketing.flyers) this.toggle('flyers', 'Листовки у\u00a0метро', 'раздаём', 'остановлены', on);
    this.marketing.flyers = on;
    if (on) this.flyersToday = true;
  }

  launchSocial(): boolean {
    if (this.marketing.socialDaysLeft > 0 || !this.cafe.opened) return false;
    this.marketing.socialDaysLeft = MARKETING.socialDays;
    this.note('social', 'Запущены соцсети', undefined, `${MARKETING.socialDays}\u00a0дней`, 'со\u00a0следующего утра');
    this.cash -= MARKETING.socialCampaign;
    this.cafe.today.marketing += MARKETING.socialCampaign;
    return true;
  }

  setHappyHours(h: HappyHours | null): void {
    const from = happyText(this.marketing.happy);
    this.marketing.happy = h && h.to > h.from && h.discount > 0 ? h : null;
    this.note('happy', 'Счастливые часы', from, happyText(this.marketing.happy));
  }

  setLoyaltyCard(on: boolean): void {
    if (on !== this.marketing.loyaltyCard) this.toggle('card', 'Карта лояльности', 'включена', 'выключена', on);
    this.marketing.loyaltyCard = on;
  }

  // ——— Склад: команды игрока ———

  orderIngredient(id: IngredientId, qty: number): void {
    this.cafe.stock.order(id, qty);
    const total = this.cafe.stock.pending[id] ?? qty;
    this.note(`order:${id}`, `Заказ: ${ingredient(id).name.toLowerCase()}`, undefined, `${total}\u00a0порц.`, 'привезут в\u00a06:00');
  }

  cancelOrder(id: IngredientId): void {
    this.cafe.stock.cancel(id);
    const list = this.cafe.today.changes ?? [];
    const i = list.findIndex((c) => c.key === `order:${id}`);
    if (i >= 0) list.splice(i, 1);
  }

  setKeep(id: IngredientId, qty: number, weekend = false): void {
    const levels = weekend ? this.cafe.stock.keepWeekend : this.cafe.stock.keep;
    const from = levels[id];
    levels[id] = Math.max(0, Math.round(qty));
    this.note(
      `keep:${id}:${weekend ? 'we' : 'wd'}`,
      `Держать ${ingredient(id).name.toLowerCase()} (${weekend ? 'выходные' : 'будни'})`,
      String(from),
      String(levels[id]),
      'автозаказ ночью',
    );
  }

  private miss(r: Resident, reason: RejectReason): void {
    const t = this.cafe.today;
    const m = t.missed;
    m[reason] = (m[reason] ?? 0) + 1;
    // Для отчёта: в какой час и кто именно ушёл
    const byHour = (t.lostHour ??= {});
    (byHour[reason] ??= hours24())[Math.floor(this.minute / 60) % 24] += 1;
    const byKind = ((t.lostKind ??= {})[r.kind] ??= {});
    byKind[reason] = (byKind[reason] ?? 0) + 1;
    this.events.push({ type: 'reject', residentId: r.id, reason });
  }

  // ——— Деньги ———

  private closeDay(nextDay: number): void {
    // Если кафе работает через полночь, гости остаются — день меняется только в отчёте
    if (!this.cafe.isOpenAt(0)) for (const id of this.cafe.flush()) this.dropVisit(this.residents[id], 'closed');
    // Конец дня: скоропорт — в списание, автозаказ — на утро
    const spoiled = this.cafe.stock.expire(this.day);
    this.cafe.today.writtenOff = spoiled.value;
    this.cafe.today.writtenOffItems = spoiled.items;
    // В выходной поставка не нужна: заказ на рабочий день уйдёт вечером выходного
    if (this.cafe.opened && this.cafe.hoursOn(weekday(nextDay))) this.cafe.stock.autoOrder(isWeekend(nextDay));
    // Листовки оплачиваются за каждый день, когда их раздавали
    if (this.flyersToday || this.marketing.flyers) {
      this.cash -= MARKETING.flyersPerDay;
      this.cafe.today.marketing += MARKETING.flyersPerDay;
    }
    this.flyersToday = this.marketing.flyers;
    this.cafe.today.awareCount = this.residents.filter((r) => r.aware).length;
    if (this.rival && this.day >= this.rival.opensDay) {
      this.cafe.today.rivalGuests = this.rival.servedToday;
      this.cafe.today.rivalPromo = this.rival.promo(this.day);
    }
    if (this.rival) this.rival.servedToday = 0;
    // Не успели решить — срабатывает вариант по умолчанию
    if (this.pendingEvent) this.applyChoice(card(this.pendingEvent).fallback, true);
    this.effects = this.effects.filter((e) => !(e.type === 'boost' && e.day <= this.day) && !(e.type === 'broken' && e.until <= nextDay * MINUTES_PER_DAY - MINUTES_PER_DAY));
    const news = this.updateRegulars();
    if (news.length) this.cafe.today.news = [...(this.cafe.today.news ?? []), ...news];
    const report = this.cafe.closeDay(nextDay);
    report.weekday = weekday(report.day);
    report.weather = this.weather;
    // Новый день: погода из прогноза, новый прогноз, будни или выходные
    this.weather = this.forecast;
    this.forecast = this.rollForecast(nextDay + 1);
    report.forecast = this.weather;
    // Выручка и закупка уже прошли через кассу — списываем постоянные расходы и налог
    this.cash -= report.rent + report.utilities + report.wages + report.tax;
    this.payLoan(report);
    report.cashAfter = this.cash;
    this.reports.push(report);
    const reached = this.checkMilestones(report.day);
    if (reached.length) report.milestones = reached;
    this.day = nextDay;
    this.applyDaySchedules();
    this.events.push({ type: 'day', report });
    for (const id of reached) this.events.push({ type: 'milestone', id });
    if (this.rival?.opensDay === nextDay) this.events.push({ type: 'rival', what: 'open' });
    else if (this.rival && this.rival.promo(nextDay) && !this.rival.promo(nextDay - 1)) this.events.push({ type: 'rival', what: 'promo' });

    if (this.cafe.opened && this.cash < 0) this.daysInRed += 1;
    else this.daysInRed = 0;
    if (this.daysInRed >= ECONOMY.bankruptDays) {
      this.bankrupt = true;
      this.events.push({ type: 'bankrupt' });
    }
  }

  // ——— Кредит ———

  /** Что предлагает банк или частник прямо сейчас: сколько максимум и почему нельзя */
  loanOffer(source: LoanSource): LoanOffer {
    const no = (refusal: string): LoanOffer => ({ source, refusal, max: 0 });
    if (!this.cafe.opened || this.bankrupt) return no('Сначала открой точку');
    if (this.loan) return no('Сначала верни текущий кредит');
    const h = this.loanHistory;
    if (h.repaidDay !== null && this.day < h.repaidDay + LOAN.cooldownDays) {
      return no(`Новый кредит${NB}— через ${h.repaidDay + LOAN.cooldownDays - this.day}${NB}дн. после погашения прошлого`);
    }
    if (source === 'private') {
      if (h.privateTaken >= LOAN.privateTimes) return no(`Частник выручал уже ${LOAN.privateTimes}${NB}раза и${NB}больше не${NB}даёт`);
      return { source, refusal: null, max: LOAN.privateMax };
    }
    const worked = this.day - this.openedDay;
    if (worked < LOAN.bankFromDay) return no(`Банк смотрит историю: приходи через ${LOAN.bankFromDay - worked}${NB}дн. работы`);
    const opened = this.reports.filter((r) => r.opened);
    const lastWeek = opened.slice(-7).reduce((s, r) => s + r.profit, 0);
    if (lastWeek < -LOAN.bankRefuseLoss) return no(`Банк не${NB}кредитует точку в${NB}убытке: за${NB}неделю ${formatMoney(lastWeek)}`);
    let goodWeeks = 0;
    for (let i = 0; i + 7 <= opened.length; i += 7) if (opened.slice(i, i + 7).reduce((s, r) => s + r.profit, 0) > 0) goodWeeks += 1;
    const milestones = Object.keys(this.milestones).length;
    // Просрочки портят историю: минус неделя в плюсе за каждую
    const credit = Math.max(0, goodWeeks - h.late);
    const max = Math.min(LOAN.bankMax, LOAN.bankBase + credit * LOAN.bankPerGoodWeek + milestones * LOAN.bankPerMilestone);
    return { source, refusal: null, max };
  }

  /** Взять кредит: деньги сразу в кассу, платежи раз в неделю с этого дня */
  takeLoan(source: LoanSource, amount: number): boolean {
    const o = this.loanOffer(source);
    const sum = Math.round(amount / LOAN.step) * LOAN.step;
    if (o.refusal || sum < LOAN_TERMS[source].min || sum > o.max) return false;
    this.loan = { source, amount: sum, left: sum, takenDay: this.day, nextDue: this.day + 7, paidWeeks: 0, late: 0 };
    if (source === 'private') this.loanHistory.privateTaken += 1;
    this.cash += sum;
    this.cafe.today.loanTaken = (this.cafe.today.loanTaken ?? 0) + sum;
    this.note('loan', `Кредит: ${LOAN_LABEL[source].toLowerCase()}`, undefined, formatMoney(sum));
    return true;
  }

  /** Погасить досрочно: остаток долга, проценты дальше не идут */
  repayLoan(): boolean {
    const l = this.loan;
    if (!l || this.cash < l.left) return false;
    this.cash -= l.left;
    this.cafe.today.loanPaid = (this.cafe.today.loanPaid ?? 0) + l.left;
    this.note('loan', 'Кредит погашен досрочно', undefined, formatMoney(l.left));
    this.loan = null;
    this.loanHistory.repaidDay = this.day;
    return true;
  }

  /** Платёж по кредиту в конце дня, когда подошёл срок. Пустая касса — просрочка и штраф */
  private payLoan(report: DayReport): void {
    const l = this.loan;
    if (!l || report.day < l.nextDue) return;
    const pay = weeklyPayment(l);
    const principal = Math.min(l.left, pay.principal);
    this.cash -= principal + pay.interest;
    l.left -= principal;
    l.paidWeeks += 1;
    l.nextDue += 7;
    // Проценты — расход дня, возврат долга в прибыль не входит
    report.interest = (report.interest ?? 0) + pay.interest;
    report.loanPaid = (report.loanPaid ?? 0) + principal;
    report.profit -= pay.interest;
    if (this.cash < 0) {
      l.late += 1;
      this.loanHistory.late += 1;
      const fine = Math.round(l.left * LOAN_TERMS[l.source].penalty);
      l.left += fine;
      report.loanFine = fine;
    } else this.loanHistory.onTime += 1;
    if (l.left <= 0) {
      this.loan = null;
      this.loanHistory.repaidDay = report.day;
    }
  }

  // ——— События ———

  /** Кофе не варится: сломалась единственная кофемашина */
  private blocked(kind: string): boolean {
    return kind === 'coffee' && this.effects.some((e) => e.type === 'broken' && !e.slow && this.time < e.until);
  }

  /** Множитель «захотели зайти» на сегодня (праздник) */
  private get boost(): number {
    const e = this.effects.find((x) => x.type === 'boost' && x.day === this.day);
    return e && e.type === 'boost' ? e.factor : 1;
  }

  /** День открытия — от него считаем, когда начинаются события */
  private get openedDay(): number {
    return this.rival ? this.rival.opensDay - RIVAL.delayDays : this.day;
  }

  private rollEvent(): void {
    if (!this.cafe.opened || this.pendingEvent || this.day < this.openedDay + EVENTS.fromDay) return;
    if (!this.eventRng.chance(EVENTS.chance)) return;
    const options = this.eligibleEvents().filter((e) => (this.lastEvent[e.id] ?? -99) <= this.day - EVENTS.cooldownDays);
    if (options.length === 0) return;
    // Взвешенный выбор: поломка реже остальных
    const weights = options.map((e) => EVENTS.weight[e.id] ?? 1);
    let roll = this.eventRng.next() * weights.reduce((a, b) => a + b, 0);
    let chosen = options[options.length - 1];
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = options[i];
        break;
      }
    }
    this.startEvent(chosen);
  }

  /** Начать событие (вызывается и из тестов, и из отладки) */
  startEvent(e: PendingEvent): void {
    this.pendingEvent = e;
    this.lastEvent[e.id] = this.day;
    // Поломка и отгул случаются сразу — от выбора зависит только, как долго и за сколько
    if (e.id === 'breakdown') this.effects.push({ type: 'broken', until: e.day * MINUTES_PER_DAY, slow: !!e.spareMachine });
    if (e.id === 'day-off') {
      const b = this.cafe.staff.find((x) => x.id === e.baristaId);
      if (b) b.override = { day: e.day, on: false };
    }
    this.events.push({ type: 'event', id: e.id });
  }

  /** Какие события возможны сегодня — с подставленными подробностями */
  eligibleEvents(): PendingEvent[] {
    const cafe = this.cafe;
    const day = this.day;
    const wd = weekday(day);
    const out: PendingEvent[] = [];
    if (cafe.menu.some((m) => m.kind === 'coffee')) out.push({ id: 'breakdown', day, spareMachine: cafe.has('machine') });
    if (wd === 5) out.push({ id: 'festival', day });
    const perishable = (['milk', 'bakery', 'kitchen'] as IngredientId[]).filter((id) =>
      cafe.menu.some((m) => Object.keys(recipeOf(m.id)).includes(id)),
    );
    if (perishable.length) out.push({ id: 'supplier', day, ingredientId: perishable[day % perishable.length] });
    const lunch = cafe.menu.find((m) => m.id === 'lunch') ?? cafe.menu.find((m) => m.kind === 'lunch');
    if (lunch && wd <= 3) {
      const pay = Math.round((lunch.price * EVENTS.order.qty * (1 - EVENTS.order.discount)) / 10) * 10;
      const ingredientCost = Math.round(recipeCost(lunch.id) * EVENTS.order.qty);
      out.push({ id: 'office-order', day, itemId: lunch.id, itemName: lunch.name, pay, ingredientCost });
    }
    if (this.awareCount < this.residents.length * 0.9) out.push({ id: 'blogger', day });
    const shift = cafe.staff.find((b) => b.contract === 'shift' && b.schedule.days[wd]);
    if (shift) out.push({ id: 'day-off', day, baristaId: shift.id });
    return out;
  }

  /** Игрок выбрал вариант. false — если события нет или вариант неизвестен */
  chooseEvent(optionId: string): boolean {
    if (!this.pendingEvent) return false;
    if (!card(this.pendingEvent).options.some((o) => o.id === optionId)) return false;
    this.applyChoice(optionId, false);
    return true;
  }

  private spend(amount: number): void {
    this.cash -= amount;
    this.cafe.today.other = (this.cafe.today.other ?? 0) + amount;
  }

  private applyChoice(optionId: string, auto: boolean): void {
    const e = this.pendingEvent!;
    this.pendingEvent = null;
    const t = this.cafe.today;
    (t.events ??= []).push(resultLine(e, optionId, auto));
    switch (`${e.id}:${optionId}`) {
      case 'breakdown:urgent':
        this.spend(EVENTS.breakdown.urgentCost);
        for (const x of this.effects) if (x.type === 'broken') x.until = Math.min(x.until, this.time + EVENTS.breakdown.urgentMinutes);
        break;
      case 'breakdown:later':
        this.spend(EVENTS.breakdown.laterCost);
        break;
      case 'festival:stall':
        this.spend(EVENTS.festival.cost);
        this.effects.push({ type: 'boost', day: e.day, factor: EVENTS.festival.boost });
        // Все, кто сегодня собирается в сквер, видят столик
        for (const r of this.residents) if (r.schedule.some((s) => s.placeId === 'park')) this.learn(r, 'walk');
        break;
      case 'supplier:take': {
        const p = supplierPrice(e.ingredientId!);
        this.cafe.stock.addNow(e.ingredientId!, EVENTS.supplier.qty, this.day, p.sale / EVENTS.supplier.qty);
        this.cash -= p.sale;
        t.purchases += p.sale;
        break;
      }
      case 'office-order:accept':
        // Продукты под заказ покупаются отдельно и в склад не попадают
        this.cash -= e.ingredientCost!;
        t.purchases += e.ingredientCost!;
        this.effects.push({ type: 'order', day: e.day + 1, minute: EVENTS.order.minute, itemId: e.itemId!, qty: EVENTS.order.qty, pay: e.pay! });
        break;
      case 'blogger:treat':
        this.spend(EVENTS.blogger.cost);
        this.effects.push({ type: 'blogger', day: e.day + 1, success: this.eventRng.chance(EVENTS.blogger.success) });
        break;
      case 'day-off:let':
        break;
      case 'day-off:ask': {
        this.spend(Math.round(ECONOMY.shiftWage * EVENTS.dayOff.extra));
        const b = this.cafe.staff.find((x) => x.id === e.baristaId);
        if (b) b.override = null;
        break;
      }
    }
  }

  /** Заказ офиса: в назначенное время стойка готовит весь заказ — новых гостей в это время не обслуживают */
  private fulfilOrders(minute: number): void {
    for (const e of [...this.effects]) {
      if (e.type !== 'order' || e.day !== this.day || minute < e.minute) continue;
      this.effects.splice(this.effects.indexOf(e), 1);
      const cafe = this.cafe;
      // Обеды для заказа готовят партией — вдвое быстрее, чем по одному
      const prep = Math.ceil((e.qty * cafe.serviceMinutes * 0.5) / cafe.counters);
      cafe.prepUntil = Math.floor(minute) + prep;
      const t = cafe.today;
      const name = itemName(e.itemId, cafe.own);
      this.cash += e.pay;
      t.revenue += e.pay;
      t.sold[e.itemId] = (t.sold[e.itemId] ?? 0) + e.qty;
      cafe.countItem(e.itemId, e.pay, 0);
      (t.events ??= []).push(`🏢 Заказ офиса: ${e.qty}\u00a0× ${name}, +${formatMoney(e.pay)}. Стойка была занята ${prep}\u00a0мин`);
    }
  }

  /** Утром выходит (или не выходит) обзор блогера */
  private resolveBlogger(): void {
    for (const e of [...this.effects]) {
      if (e.type !== 'blogger' || e.day > this.day) continue;
      this.effects.splice(this.effects.indexOf(e), 1);
      const t = this.cafe.today;
      if (!e.success) {
        (t.events ??= []).push('📱 Обзор блогера так и\u00a0не\u00a0вышел');
        continue;
      }
      const fans = this.residents.filter((r) => !r.aware && (r.kind === 'youth' || r.kind === 'student' || r.kind === 'visitor'));
      let n = 0;
      for (const r of fans) {
        if (n >= EVENTS.blogger.reach) break;
        this.learn(r, 'social');
        n += 1;
      }
      (t.events ??= []).push(`📱 Вышел обзор блогера: о\u00a0вас узнали ${n}\u00a0человек`);
    }
  }

  // ——— Знакомые лица и вехи ———

  /** Запись в историю знакомого лица (остальных жителей не касается) */
  private noteRegular(r: Resident, ok: boolean, reason?: RejectReason, itemId?: string): void {
    const g = this.regularById.get(r.id);
    // Кто не знает о кафе, тот к нему и не собирался — в историю не пишем
    if (!g || !r.aware) return;
    const note: Parameters<typeof addNote>[1] = { day: this.day, minute: Math.floor(this.minute), ok };
    if (reason) note.reason = reason;
    if (itemId) note.itemId = itemId;
    addNote(g, note);
  }

  /** Конец дня: новые статусы знакомых лиц и строки для отчёта */
  private updateRegulars(): string[] {
    const news: string[] = [];
    for (const g of this.regulars) {
      const r = this.residents[g.residentId];
      const { status, reason } = statusOf(g, r, this.day);
      const line = status !== g.status ? newsLine(r.name, g.status, status, reason) : null;
      if (line) news.push(line);
      g.status = status;
      g.lostReason = reason;
    }
    return news;
  }

  regularOf(residentId: number): Regular | undefined {
    return this.regularById.get(residentId);
  }

  /** Сколько жителей уже «свои»: привыкли к вам и были на этой неделе */
  get loyalCount(): number {
    return this.residents.filter((r) => r.loyalty >= LOYAL - 1e-9 && r.lastVisit > this.day - STATUS_WINDOW).length;
  }

  /** Прогресс вехи сейчас */
  milestoneProgress(id: MilestoneId): [number, number] {
    const m = MILESTONES.find((x) => x.id === id)!;
    return m.progress({
      reports: this.reports,
      loyal: this.loyalCount,
      aware: this.awareCount,
      population: this.residents.length,
      cash: this.cash,
      startCash: ECONOMY.startCash,
    });
  }

  private checkMilestones(day: number): MilestoneId[] {
    if (!this.cafe.opened) return [];
    const out: MilestoneId[] = [];
    for (const m of MILESTONES) {
      if (this.milestones[m.id] !== undefined) continue;
      const [done, target] = this.milestoneProgress(m.id);
      if (done >= target) {
        this.milestones[m.id] = day;
        out.push(m.id);
      }
    }
    return out;
  }

  /** Можно ли купить улучшение и почему нет */
  upgradeState(id: UpgradeId): 'owned' | 'locked' | 'premises' | 'money' | 'ok' {
    const u = upgrade(id);
    if (this.cafe.has(id)) return 'owned';
    if (!u.premises.includes(this.cafe.premisesId)) return 'premises';
    if (u.unlock && this.milestones[u.unlock] === undefined) return 'locked';
    if (this.cash < u.cost) return 'money';
    return 'ok';
  }

  buyUpgrade(id: UpgradeId): boolean {
    if (!this.cafe.opened || this.upgradeState(id) !== 'ok') return false;
    const u = upgrade(id);
    this.cash -= u.cost;
    this.cafe.upgrades.push(id);
    if (id === 'showcase') this.cafe.stock.extendShelf(UPGRADE_EFFECT.showcaseShelfDays);
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + u.cost;
    this.note(`upgrade:${id}`, u.name, undefined, `куплено за ${formatMoney(u.cost)}`);
    return true;
  }

  /** Купить оборудование под категорию меню (плита — обеды, кран — пиво и сидр) */
  buyEquipment(id: EquipmentId): boolean {
    const e = EQUIPMENT[id];
    if (!this.cafe.opened || this.cafe.equipment.includes(id) || this.cash < e.cost) return false;
    if (!e.kinds.some((k) => (this.cafe.premises.kinds as readonly string[]).includes(k))) return false;
    this.cash -= e.cost;
    this.cafe.equipment.push(id);
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + e.cost;
    this.note(`equipment:${id}`, e.name, undefined, `куплено за ${formatMoney(e.cost)}`);
    return true;
  }

  /** Сколько гостей сейчас сидит в зале */
  seated(): number {
    return this.residents.filter((r) => r.visit?.stage === 'dining' && r.visit.want.mode === 'replace').length;
  }

  /** Зал есть только у кафе; киоск — навынос */
  get hasHall(): boolean {
    return this.cafe.opened && this.cafe.premisesId === 'cafe';
  }

  /** Поставить вещь на место; если там что-то стоит — оно продаётся */
  placeFurniture(slot: string, id: FurnitureId): boolean {
    if (!this.hasHall || !canPlace(slot, id)) return false;
    const old = this.cafe.interior.layout[slot];
    if (old === id) return false;
    const cost = furniture(id).cost - (old ? Interior.refund(old) : 0);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.cafe.interior.layout[slot] = id;
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + cost;
    this.note(`hall:${slot}`, 'Зал', old ? furniture(old).name : undefined, furniture(id).name);
    return true;
  }

  /** Продать вещь: возвращается половина цены */
  sellFurniture(slot: string): boolean {
    if (!this.hasHall) return false;
    const old = this.cafe.interior.layout[slot];
    if (!old) return false;
    const refund = Interior.refund(old);
    this.cash += refund;
    delete this.cafe.interior.layout[slot];
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) - refund;
    this.note(`hall:${slot}`, 'Зал', furniture(old).name, 'продано');
    return true;
  }

  /** Готовая комплектация: новое покупается, лишнее продаётся */
  applyPreset(id: PresetId): boolean {
    if (!this.hasHall || this.cafe.interior.matches(id)) return false;
    const cost = this.cafe.interior.presetCost(id);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.cafe.interior.load(preset(id).layout);
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + cost;
    this.note('hall', 'Зал', undefined, `комплектация «${preset(id).name}»`);
    return true;
  }

  /** Погода на день: вид и температура — из генератора погоды, ветер — из seed и дня */
  private rollForecast(day: number): Weather {
    const w = rollWeather(this.skyRng, this.weather);
    return { ...w, wind: windFor(this.seed, day, w.kind) };
  }

  /** Будни или выходные: каждому жителю — расписание на сегодня */
  private applyDaySchedules(): void {
    this.cafe.day = this.day;
    this.cafe.weekday = weekday(this.day);
    const weekend = isWeekend(this.day);
    for (const r of this.residents) r.schedule = weekend ? r.weekend : r.weekday;
  }

  get weekday(): number {
    return weekday(this.day);
  }

  /** Текущий игровой день (1 — первый) */
  get today(): number {
    return this.day;
  }

  // ——— Движение ———

  private goTo(r: Resident, placeId: string): void {
    // Листовки раздают у метро в часы пик
    const m = this.minute;
    const peak = (m >= hm(7) && m < hm(10)) || (m >= hm(17) && m < hm(20));
    if (
      this.marketing.flyers &&
      this.cafe.opened &&
      !r.aware &&
      peak &&
      (placeId === 'metro' || r.placeId === 'metro') &&
      this.rng.chance(MARKETING.flyerChance)
    ) {
      this.learn(r, 'flyers');
    }
    r.noticed = false;
    // Откуда выходит: из здания или сквера — через один из его входов; на ходу — с того места, где идёт
    const from = r.walking ? null : place(r.placeId);
    r.placeId = placeId;
    r.path = this.route(r, place(placeId), from);
    r.walking = true;
    r.visible = true;
  }

  private walk(r: Resident, dt: number): void {
    let budget = r.speed * dt;
    while (budget > 0 && r.path.length > 0) {
      const target = r.path[0];
      const dx = target.x - r.pos.x;
      const dy = target.y - r.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) {
        r.pos = { ...target };
        r.path.shift();
        budget -= dist;
      } else {
        r.pos = { x: r.pos.x + (dx / dist) * budget, y: r.pos.y + (dy / dist) * budget };
        budget = 0;
      }
    }
    // Проходя мимо открытого кафе, можно его заметить — вывеска помогает
    if (this.cafe.opened && !r.aware && !r.noticed) {
      const front = place(this.shopId).front;
      if (Math.abs(r.pos.x - front.x) < 45 && Math.abs(r.pos.y - front.y) < 60) {
        r.noticed = true;
        // Любопытный замечает новое место чаще, торопливый — реже
        const look = 1 + 0.8 * (r.character.curiosity - 0.5) - 0.3 * (r.character.hurry - 0.5);
        // Доска с подсветкой у киоска: замечают чаще, особенно вечером
        const board = this.cafe.has('board') ? (this.minute >= hm(17) ? UPGRADE_EFFECT.boardNoticeEvening : UPGRADE_EFFECT.boardNotice) : 1;
        const p = (this.marketing.sign ? MARKETING.noticeWithSign : MARKETING.noticeBase) * look * board;
        if (this.rng.chance(Math.min(1, p))) this.learn(r, 'walk');
      }
    }
    if (r.path.length === 0) {
      r.walking = false;
      r.visible = !place(r.placeId).indoor;
      this.onArrive(r);
    }
  }

  /**
   * Маршрут по тротуарам: из здания через ближайший удобный вход → по тротуарам и переходам → к двери.
   * У метро два выхода, у сквера два входа: берём пару, при которой идти меньше всего.
   */
  private route(r: Resident, to: Place, from: Place | null): Point[] {
    const outdoor = from ? !from.indoor : false;
    const starts: { door: Point | null; front: Point; via?: Point[] }[] = from
      ? entrancesOf(from).map((e) => ({ door: e.door, front: e.front, via: e.via }))
      : [{ door: null, front: snapToWalkway(r.pos) }];
    let best: { s: (typeof starts)[number]; t: Entrance; len: number } | null = null;
    for (const s of starts) {
      for (const t of entrancesOf(to)) {
        const len = walkLength(s.front, t.front) + (outdoor && s.door ? Math.hypot(r.pos.x - s.door.x, r.pos.y - s.door.y) : 0);
        if (!best || len < best.len) best = { s, t, len };
      }
    }
    const { s, t } = best!;
    const path: Point[] = [];
    // Из здания с несколькими выходами житель появляется у выбранного, из сквера — идёт к его краю
    if (s.door && from && entrancesOf(from).length > 1) {
      if (outdoor) path.push({ ...s.door });
      else r.pos = { ...s.door };
    }
    // Дверь во дворе: сначала по проходу к тротуару
    if (from && s.via) for (const p of [...s.via].reverse()) path.push({ ...p });
    for (const p of walkPath(s.front, t.front)) path.push(withLane(p, r.lane));
    if (t.via) for (const p of t.via) path.push({ ...p });
    path.push(this.spotIn(to, t));
    return path;
  }

  /** Куда именно встать в месте назначения */
  private spotIn(p: Place, entrance: Entrance = entrancesOf(p)[0]): Point {
    if (p.kind === 'park') {
      // В сквере — где-нибудь на дорожках, не у самой остановки
      return {
        x: this.rng.range(p.rect.x + 50, p.rect.x + p.rect.w - 40),
        y: this.rng.range(p.rect.y + 40, p.rect.y + p.rect.h - 90),
      };
    }
    return { ...entrance.door };
  }

  private placeAt(r: Resident, placeId: string): void {
    const p = place(placeId);
    r.placeId = placeId;
    r.pos = this.spotIn(p);
    r.path = [];
    r.walking = false;
    r.visible = !p.indoor;
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');
const clockText = (m: number): string => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function happyText(h: HappyHours | null): string {
  return h ? `${clockText(h.from)}–${clockText(h.to)}, −${Math.round(h.discount * 100)}\u00a0%` : 'выкл.';
}

function itemName(id: string, own: MenuItem[] = []): string {
  return CATALOG.find((c) => c.id === id)?.name ?? own.find((m) => m.id === id)?.name ?? id;
}
