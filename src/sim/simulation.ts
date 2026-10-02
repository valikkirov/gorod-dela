import { Cafe, MAX_QUEUE, type Contract, type DayReport, type RejectReason } from './cafe';
import { dayNumber, hm, isWeekend, MINUTES_PER_DAY, minuteOfDay, weekday } from './clock';
import { evaluate, rejectReason, rollWant, type Want } from './demand';
import { ECONOMY } from './economy';
import { currentEntry, generateResidents, type Resident, type ScheduleEntry } from './residents';
import { Rng } from './rng';
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
/** Дольше этого житель не ждёт заказ и уходит по делам */
const PATIENCE = 30;

export type SimEvent =
  | { type: 'sale'; residentId: number; price: number; itemId: string }
  | { type: 'reject'; residentId: number; reason: RejectReason }
  | { type: 'day'; report: DayReport }
  | { type: 'bankrupt' };

/** Ядро симуляции. Не знает ничего об отрисовке — этот же код
 *  на этапе 2 переедет на сервер. */
export class Simulation {
  /** Игровое время в минутах с начала первого дня */
  time: number;
  readonly residents: Resident[];
  readonly cafe = new Cafe();
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

  constructor(seed = 1, startTime = hm(6, 0)) {
    this.rng = new Rng(seed);
    this.skyRng = new Rng(seed * 7919 + 13);
    this.time = startTime;
    this.day = dayNumber(startTime);
    this.cafe.today = Cafe.emptyDay(this.day);
    // Первый день — ясно, дальше как повезёт
    this.weather = { kind: 'sunny', temp: 21 };
    this.forecast = rollWeather(this.skyRng, this.weather);
    this.residents = generateResidents(this.rng);
    this.applyDaySchedules();
    // Каждого ставим туда, где он должен быть в стартовую минуту
    for (const r of this.residents) {
      const entry = currentEntry(r.schedule, minuteOfDay(this.time));
      r.entry = entry;
      r.activity = entry.activity;
      this.placeAt(r, entry.placeId);
    }
  }

  // ——— Команды игрока ———

  openCafe(): boolean {
    if (this.cafe.opened || this.bankrupt || this.cash < ECONOMY.cafeOpeningCost) return false;
    this.cash -= ECONOMY.cafeOpeningCost;
    this.cafe.opened = true;
    return true;
  }

  setPrice(itemId: string, price: number): void {
    this.cafe.item(itemId).price = Math.max(ECONOMY.priceStep, Math.round(price / ECONOMY.priceStep) * ECONOMY.priceStep);
  }

  /** closeAt может быть больше 24:00 (работа через полночь); openAt + 24 ч — круглосуточно */
  setHours(openAt: number, closeAt: number): void {
    if (closeAt <= openAt || closeAt - openAt > MINUTES_PER_DAY) return;
    this.cafe.openAt = openAt;
    this.cafe.closeAt = closeAt;
  }

  hireBarista(contract: Contract): boolean {
    return this.cafe.hire(contract) !== null;
  }

  fireBarista(id: number): void {
    this.cafe.fire(id);
  }

  setOnDuty(id: number, onDuty: boolean): void {
    this.cafe.setOnDuty(id, onDuty);
  }

  addMenuItem(id: string): boolean {
    return this.cafe.addItem(id);
  }

  removeMenuItem(id: string): boolean {
    return this.cafe.removeItem(id);
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
    return this.residents.filter((r) => r.placeId === 'cafe' && !r.walking).length;
  }

  get minute(): number {
    return minuteOfDay(this.time);
  }

  private step(dt: number): void {
    const wasOpen = this.cafe.isOpenAt(this.minute);
    this.time += dt;
    const minute = this.minute;

    const today = dayNumber(this.time);
    if (today !== this.day) this.closeDay(today);
    if (this.bankrupt) return;

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

    for (const sale of this.cafe.tick(dt, minute)) this.onSale(sale.residentId, sale.price, sale.itemId);
  }

  // ——— Жители и кафе ———

  private onTransition(r: Resident, entry: ScheduleEntry): void {
    const prev = r.entry;
    r.entry = entry;
    r.activity = entry.activity;
    if (r.visit) this.dropVisit(r, 'no-time');

    const want = rollWant(this.rng, r, entry, prev, this.weather.kind);
    if (want && this.decide(r, want, entry)) {
      this.goTo(r, 'cafe');
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
    else {
      const offer = evaluate(r, want, cafe.menu, r.pos, place('cafe').door, place(entry.placeId).door, this.weather.kind);
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
    r.visit = { want, itemId: itemId!, stage: 'going', until: 0, since: this.time };
    return true;
  }

  private onArrive(r: Resident): void {
    const v = r.visit;
    if (r.placeId !== 'cafe' || v?.stage !== 'going') return;
    if (!this.cafe.isOpenAt(this.minute)) return this.dropVisit(r, 'closed');
    if (this.cafe.busy >= MAX_QUEUE || !this.cafe.join(r.id, v.itemId)) {
      r.loyalty = Math.max(0, r.loyalty - 0.1);
      return this.dropVisit(r, 'queue');
    }
    v.stage = 'queued';
  }

  private onSale(residentId: number, price: number, itemId: string): void {
    const r = this.residents[residentId];
    const cost = this.cafe.item(itemId).cost;
    this.cash += price - cost; // выручка минус закупка продуктов
    r.loyalty = Math.min(0.4, r.loyalty + 0.1);
    if (r.visit) {
      r.visit.stage = 'dining';
      r.visit.until = this.time + r.visit.want.dwell;
    }
    this.events.push({ type: 'sale', residentId, price, itemId });
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
    if (r.placeId === 'cafe' || r.walking) this.goTo(r, r.entry.placeId);
  }

  private miss(r: Resident, reason: RejectReason): void {
    const m = this.cafe.today.missed;
    m[reason] = (m[reason] ?? 0) + 1;
    this.events.push({ type: 'reject', residentId: r.id, reason });
  }

  // ——— Деньги ———

  private closeDay(nextDay: number): void {
    // Если кафе работает через полночь, гости остаются — день меняется только в отчёте
    if (!this.cafe.isOpenAt(0)) for (const id of this.cafe.flush()) this.dropVisit(this.residents[id], 'closed');
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
    const weekend = isWeekend(this.day);
    for (const r of this.residents) r.schedule = weekend ? r.weekend : r.weekday;
  }

  get weekday(): number {
    return weekday(this.day);
  }

  // ——— Движение ———

  private goTo(r: Resident, placeId: string): void {
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
    if (r.path.length === 0) {
      r.walking = false;
      r.visible = !place(r.placeId).indoor;
      this.onArrive(r);
    }
  }

  /** Маршрут: к тротуару → вдоль улицы → переход → ко входу */
  private route(r: Resident, to: Place): Point[] {
    const side = r.pos.x < ROAD_CENTER_X ? 'left' : 'right';
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
