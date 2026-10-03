import { Cafe, CATALOG, hours24, scheduleText, type StaffSchedule, MAX_QUEUE, type CafeSave, type Change, type Contract, type DayReport, type RejectReason } from './cafe';
import { dayNumber, hm, isWeekend, MINUTES_PER_DAY, minuteOfDay, weekday } from './clock';
import { evaluate, rejectReason, rollWant, type Want } from './demand';
import { ECONOMY, formatMoney, PREMISES, type PremisesId } from './economy';
import { currentEntry, generateResidents, type Resident, type ScheduleEntry } from './residents';
import { MARKETING, Marketing, type AwareSource, type HappyHours } from './marketing';
import { Rng } from './rng';
import { INGREDIENTS, ingredient, STARTER_KEEP, STARTER_KEEP_WEEKEND, type IngredientId } from './stock';
import { rollWeather, type Weather } from './weather';
import {
  clampSidewalkY,
  place,
  ROAD_CENTER_X,
  sidewalkX,
  type Place,
  type Point,
} from './world';

/** Шаг симуляции в игровых минутах. Мелкий — чтобы движение было плавным. */
const STEP = 0.2;
/** Меняется, когда сохранения старой версии больше нельзя загрузить */
export const SAVE_VERSION = 2;

export interface SaveData {
  version: number;
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
  residents: {
    pos: Point;
    placeId: string;
    /** [выходной ли день, номер занятия в расписании] */
    entry: [number, number];
    visit: Resident['visit'];
    activity: Resident['activity'];
    path: Point[];
    walking: boolean;
    visible: boolean;
    loyalty: number;
    decision: Resident['decision'];
    aware: boolean;
    noticed: boolean;
    coffeeCount: number;
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
  | { type: 'bankrupt' };

/** Ядро симуляции. Не знает ничего об отрисовке — этот же код
 *  на этапе 2 переедет на сервер. */
export class Simulation {
  /** Игровое время в минутах с начала первого дня */
  time: number;
  readonly residents: Resident[];
  readonly cafe = new Cafe();
  readonly marketing = new Marketing();
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
    this.time = startTime;
    this.day = dayNumber(startTime);
    this.cafe.today = Cafe.emptyDay(this.day);
    // Первый день — ясно, дальше как повезёт
    this.weather = { kind: 'sunny', temp: 21 };
    this.forecast = rollWeather(this.skyRng, this.weather);
    this.residents = generateResidents(this.rng);
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
      residents: this.residents.map((r) => {
        const weekend = r.weekend.includes(r.entry);
        return {
          pos: r.pos,
          placeId: r.placeId,
          entry: [weekend ? 1 : 0, (weekend ? r.weekend : r.weekday).indexOf(r.entry)] as [number, number],
          visit: r.visit,
          activity: r.activity,
          path: r.path,
          walking: r.walking,
          visible: r.visible,
          loyalty: r.loyalty,
          decision: r.decision,
          aware: r.aware,
          noticed: r.noticed,
          coffeeCount: r.coffeeCount,
        };
      }),
    };
  }

  /** Восстановить игру из сохранения. null — если сохранение от старой версии игры. */
  static restore(d: SaveData): Simulation | null {
    if (d.version !== SAVE_VERSION) return null;
    const sim = new Simulation(d.seed);
    if (sim.residents.length !== d.residents.length) return null;
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
    sim.applyDaySchedules();
    d.residents.forEach((s, i) => {
      const r = sim.residents[i];
      const list = s.entry[0] ? r.weekend : r.weekday;
      Object.assign(r, {
        pos: s.pos,
        placeId: s.placeId,
        entry: list[s.entry[1]] ?? r.schedule[0],
        visit: s.visit,
        activity: s.activity,
        path: s.path,
        walking: s.walking,
        visible: s.visible,
        loyalty: s.loyalty,
        decision: s.decision,
        aware: s.aware,
        noticed: s.noticed,
        coffeeCount: s.coffeeCount,
      });
    });
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
    // В киоске нет кухни и бара — стартовое меню без них
    for (const m of [...this.cafe.menu]) if (!this.cafe.fits(m.id)) this.cafe.removeItem(m.id);
    if (!this.cafe.hasItem('croissant')) this.cafe.addItem('croissant');
    this.note('open', `${pr.name}: открыто`, undefined, '');
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
    const from = hoursText(this.cafe.openAt, this.cafe.closeAt);
    this.cafe.openAt = openAt;
    this.cafe.closeAt = closeAt;
    this.note('hours', 'Часы работы', from, hoursText(openAt, closeAt));
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
    if (schedule.to <= schedule.from || schedule.to - schedule.from > MINUTES_PER_DAY) return;
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
    if (ok) this.toggle(`menu:${id}`, `Меню: ${itemName(id)}`, 'добавлен', 'убран', true);
    return ok;
  }

  removeMenuItem(id: string): boolean {
    const name = itemName(id);
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
      if (r.walking) this.walk(r, dt);
    }

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

    const want = rollWant(this.rng, r, entry, prev, this.weather.kind, isWeekend(this.day));
    if (want && this.decide(r, want, entry)) {
      this.goTo(r, this.shopId);
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
    else {
      // Житель видит цены с учётом счастливых часов
      const menu = cafe.menu.map((m) => ({ ...m, price: this.marketing.priceAt(m.price, minute) }));
      const offer = evaluate(r, want, menu, r.pos, place(this.shopId).front, place(entry.placeId).front, this.weather.kind);
      itemId = offer.item?.id;
      price = offer.item?.price;
      if (!offer.item || !this.rng.chance(offer.p)) reason = rejectReason(offer, r.budget[want.kind]);
      if (reason === 'no-item') {
        const mk = cafe.today.missingKinds;
        mk[want.kind] = (mk[want.kind] ?? 0) + 1;
      }
    }

    if (reason) {
      r.decision = { ...base, visited: false, reason, itemId, price };
      this.miss(r, reason);
      return false;
    }
    r.decision = { ...base, visited: true, itemId, price };
    // Без зала всё навынос: купил и пошёл по своим делам
    const visitWant = cafe.premises.seats ? want : { ...want, mode: 'stopover' as const, dwell: 0 };
    r.visit = { want: visitWant, itemId: itemId!, stage: 'going', until: 0, since: this.time };
    return true;
  }

  private onArrive(r: Resident): void {
    const v = r.visit;
    if (r.placeId !== this.shopId || v?.stage !== 'going') return;
    if (!this.cafe.isOpenAt(this.minute)) return this.dropVisit(r, 'closed');
    // Пришёл, а нужного нет: берёт замену, если есть, иначе уходит недовольным
    if (!this.cafe.stock.canMake(v.itemId)) {
      const available = this.cafe.menu.filter((m) => this.cafe.stock.canMake(m.id));
      const alt = evaluate(r, v.want, available, r.pos, r.pos, r.pos, this.weather.kind).item;
      if (!alt) return this.runOut(r);
      v.itemId = alt.id;
      if (r.decision) r.decision = { ...r.decision, itemId: alt.id, price: alt.price };
    }
    if (this.cafe.busy >= MAX_QUEUE || !this.cafe.join(r.id, v.itemId)) {
      r.loyalty = Math.max(0, r.loyalty - 0.1);
      return this.dropVisit(r, 'queue');
    }
    v.stage = 'queued';
  }

  private onSale(residentId: number, price: number, itemId: string): void {
    const r = this.residents[residentId];
    this.cash += price; // продукты уже оплачены при закупке
    const card = this.marketing.loyaltyCard;
    r.loyalty = Math.min(card ? 0.5 : 0.4, r.loyalty + (card ? 0.15 : 0.1));
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
    if (r.loyalty >= 0.3 && this.rng.chance(MARKETING.wordChance)) {
      const friends = this.residents.filter(
        (o) => !o.aware && (o.homeId === r.homeId || (r.workId !== null && o.workId === r.workId) || o.kind === r.kind),
      );
      if (friends.length) this.learn(this.rng.pick(friends), 'word');
    }
    if (r.visit) {
      r.visit.stage = 'dining';
      r.visit.until = this.time + r.visit.want.dwell;
    }
    this.events.push({ type: 'sale', residentId, price, itemId });
    if (r.visit) this.extraOrder(r, itemId);
  }

  /** Кто сидит, тот заказывает ещё: вторую кружку в баре, выпечку к кофе, напиток к обеду */
  private extraOrder(r: Resident, itemId: string): void {
    const v = r.visit!;
    if (v.want.mode !== 'replace' || v.want.dwell < 20) return;
    const menu = this.cafe.menu;
    const pick = (kinds: string[]): string | undefined => {
      const fav = kinds.map((k) => r.favorites[k as keyof Resident['favorites']]).find((id) => this.cafe.hasItem(id));
      return fav ?? menu.find((m) => kinds.includes(m.kind))?.id;
    };
    let extra: string | undefined;
    let chance = 0;
    if (v.want.kind === 'bar') [extra, chance] = [itemId, EXTRA.bar];
    else if (v.want.kind === 'coffee') [extra, chance] = [pick(['snack']), EXTRA.coffee];
    else if (v.want.kind === 'tea') [extra, chance] = [pick(['snack']), EXTRA.tea];
    else if (v.want.kind === 'lunch') [extra, chance] = [pick(['coffee', 'tea']), EXTRA.lunch];
    if (!extra || !this.rng.chance(chance)) return;
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
      this.miss(r, reason);
    }
    if (r.placeId === this.shopId || r.walking) this.goTo(r, r.entry.placeId);
  }

  /** Кончились продукты — гость уходит, доверие падает */
  private runOut(r: Resident): void {
    r.loyalty = Math.max(0, r.loyalty - 0.1);
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
    if (d.cost === 0) return;
    this.cash -= d.cost;
    this.cafe.today.purchases += d.cost;
    this.events.push({ type: 'delivery', cost: d.cost });
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
    if (this.cafe.opened) this.cafe.stock.autoOrder(isWeekend(nextDay));
    // Листовки оплачиваются за каждый день, когда их раздавали
    if (this.flyersToday || this.marketing.flyers) {
      this.cash -= MARKETING.flyersPerDay;
      this.cafe.today.marketing += MARKETING.flyersPerDay;
    }
    this.flyersToday = this.marketing.flyers;
    this.cafe.today.awareCount = this.residents.filter((r) => r.aware).length;
    const report = this.cafe.closeDay(nextDay);
    report.weekday = weekday(report.day);
    report.weather = this.weather;
    // Новый день: погода из прогноза, новый прогноз, будни или выходные
    this.weather = this.forecast;
    this.forecast = rollWeather(this.skyRng, this.weather);
    report.forecast = this.weather;
    // Выручка и закупка уже прошли через кассу — списываем постоянные расходы и налог
    this.cash -= report.rent + report.utilities + report.wages + report.tax;
    report.cashAfter = this.cash;
    this.reports.push(report);
    this.day = nextDay;
    this.applyDaySchedules();
    this.events.push({ type: 'day', report });

    if (this.cafe.opened && this.cash < 0) this.daysInRed += 1;
    else this.daysInRed = 0;
    if (this.daysInRed >= ECONOMY.bankruptDays) {
      this.bankrupt = true;
      this.events.push({ type: 'bankrupt' });
    }
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
    r.placeId = placeId;
    r.path = this.route(r, place(placeId));
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
        const p = this.marketing.sign ? MARKETING.noticeWithSign : MARKETING.noticeBase;
        if (this.rng.chance(p)) this.learn(r, 'walk');
      }
    }
    if (r.path.length === 0) {
      r.walking = false;
      r.visible = !place(r.placeId).indoor;
      this.onArrive(r);
    }
  }

  /** Маршрут: к тротуару → вдоль улицы → переход → ко входу */
  private route(r: Resident, to: Place): Point[] {
    // Из метро и сквера (они посередине) кто-то идёт по левому тротуару, кто-то по правому
    const side = r.pos.x === ROAD_CENTER_X ? (r.lane < 0 ? 'left' : 'right') : r.pos.x < ROAD_CENTER_X ? 'left' : 'right';
    const lane = (s: 'left' | 'right') => sidewalkX(s) + r.lane;
    const path: Point[] = [{ x: lane(side), y: clampSidewalkY(r.pos.y) }];

    const targetSide = to.side === 'center' ? side : to.side;
    const targetY = clampSidewalkY(to.door.y);
    path.push({ x: lane(side), y: targetY });
    if (targetSide !== side) path.push({ x: lane(targetSide), y: targetY });

    path.push(this.spotIn(to));
    return path;
  }

  /** Куда именно встать в месте назначения */
  private spotIn(p: Place): Point {
    if (p.kind === 'park') {
      return {
        x: this.rng.range(p.rect.x + 40, p.rect.x + p.rect.w - 40),
        y: this.rng.range(p.rect.y + 50, p.rect.y + p.rect.h - 30),
      };
    }
    return { ...p.door };
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

function hoursText(openAt: number, closeAt: number): string {
  if (closeAt - openAt >= MINUTES_PER_DAY) return 'круглосуточно';
  return `${clockText(openAt)}–${clockText(closeAt)}`;
}

function happyText(h: HappyHours | null): string {
  return h ? `${clockText(h.from)}–${clockText(h.to)}, −${Math.round(h.discount * 100)}\u00a0%` : 'выкл.';
}

function itemName(id: string): string {
  return CATALOG.find((c) => c.id === id)?.name ?? id;
}
