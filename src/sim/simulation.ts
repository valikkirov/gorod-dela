import { canPlace, FINISH_SLOTS, SEASON_SLOTS, furniture, type FurnitureId, hallStyle, Interior, INTERIOR, preset, type PresetId, STYLE_SLOTS, styleSet, type StyleId } from './interior';
import { Cafe, CATALOG, hours24, ownerShiftText, scheduleText, validWindow, weekHoursText, type DayHours, type StaffSchedule, MAX_QUEUE, MARKDOWN_DEFAULT, SPECIALTY, type CafeSave, type Change, type Markdown, type Contract, type DayReport, type RejectReason, type MenuItem } from './cafe';
import { emptyHistory, LOAN, LOAN_LABEL, LOAN_TERMS, weeklyPayment, type Loan, type LoanHistory, type Offer as LoanOffer, type LoanSource } from './loans';
import { DISH_EFFECT, isDish, SIGNATURE_MATCH, type AddInId, type BaseId } from './dishes';
import { tasteMatch } from './character';
import { dayNumber, formatClock, hm, isWeekend, MINUTES_PER_DAY, minuteOfDay, weekday } from './clock';
import { evaluate, rejectReason, rollWant, type Offer, type Want } from './demand';
import { ECONOMY, EQUIPMENT, formatMoney, PREMISES, type EquipmentId, type PremisesId } from './economy';
import { rateVisit, remember, type Memory } from './character';
import { currentEntry, generateResidents, isFemale, SADOVAYA_HOMES, type Resident, type ResidentKind, type ScheduleEntry } from './residents';
import { MARKETING, Marketing, type AwareSource, type HappyHours } from './marketing';
import { Rng } from './rng';
import { INGREDIENTS, ingredient, orderPrice, recipeCost, recipeOf, STARTER_KEEP, STARTER_KEEP_WEEKEND, type IngredientId, type WriteOff } from './stock';
import { Rival, RIVAL, type RivalSave } from './rival';
import { formFriends, formGroups, FRIENDS, GROUP, meetAt, votesNeeded, type Group, type GroupDay } from './groups';
import { addNote, LOYAL, newsLine, STATUS_WINDOW, pickRegulars, statusOf, type Regular } from './regulars';
import { FIRST_STEPS, STEP_GUESTS, STEP_REVENUE, type StepId } from './firstSteps';
import { MILESTONES, upgrade, UPGRADE_EFFECT, type MilestoneId, type UpgradeId } from './milestones';
import { card, EVENTS, resultLine, supplierPrice, type EventId, type PendingEvent } from './events';
import { PARK_SKIP, rollWeather, toSummer, toWinter, windFor, type Weather } from './weather';
import { HOLIDAY, type HolidayDay } from './holiday';
import {
  entrancesOf,
  nearestFront,
  place,
  type DistrictId,
  loopPath,
  nearestLoop,
  PARK_LOOP,
  snapToWalkway,
  walkLength,
  walkPath,
  withLane,
  type Entrance,
  type Place,
  type Point,
} from './world';

import { L, tr } from './i18n';
/** Шаг симуляции в игровых минутах. Мелкий — чтобы движение было плавным. */
export const STEP = 0.2;
/** Меняется, когда сохранения старой версии больше нельзя загрузить */
export const SAVE_VERSION = 2;

/** Сколько порций новой добавки заказать и держать, когда придумано блюдо */
const DISH_STARTER = 15;
/** Совпадение вкуса, с которого житель считается поклонником позиции */
const TASTE_FAN = 0.3;
/** Версия карты: сохранения со старой картой загружаются, но жители встают на новые места */
export const MAP_VERSION = 2;

export interface SaveData {
  version: number;
  /** Район точки; нет — Кленовая */
  district?: DistrictId;
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
  /** Договор с офисом и счётчики для него (нет в старых сохранениях — значит, договора не было) */
  contract?: OfficeContract | null;
  /** Договор с фермой (нет — не подписывали) */
  farm?: FarmDeal | null;
  /** Компании коллег: итог сегодняшнего дня и ходили ли к вам в прошлый раз (для новостей) */
  groupDay?: Record<number, GroupDay>;
  groupWas?: Record<number, boolean>;
  officeOrders?: number;
  contractBan?: number;
  eventRng?: number;
  /** Прогулки по большому скверу — свой генератор, чтобы не сдвигать остальную жизнь */
  parkRng?: number;
  milestones?: Partial<Record<MilestoneId, number>>;
  /** «Первые шаги» — день, когда выполнен шаг */
  steps?: Partial<Record<StepId, number>>;
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

/** Большой сквер: какая доля гуляющих идёт туда днём и вечером; раз во сколько минут гуляющий идёт дальше */
const PARK_SHARE = { day: 0.6, night: 0.3, strollEvery: 12 } as const;

/** Дольше этого житель не ждёт заказ и уходит по делам */
const PATIENCE = 30;

/** Пекарня: домой берут ещё одно изделие — к хлебу (хлеб домой) и к кофе или чаю */
export const BAKERY = {
  takeHomeBread: 0.8,
  takeHomeOther: 0.35,
  /** Своя выпечка в свои точки: почём пекарня отдаёт порцию (поставщик берёт 60) и во что ей обходится */
  supplyPrice: 40,
  supplyCost: 25,
  /** Хлеб в «Продукты»: оптовая цена, сколько можно возить; магазин платит за проданное, остаток возвращает */
  wholesalePrice: 60,
  wholesaleMax: 40,
  /** Доля проданного в магазине: от min до min+spread (бросок), в выходные ×weekend */
  wholesaleMin: 0.65,
  wholesaleSpread: 0.35,
  wholesaleWeekend: 0.8,
} as const;

export type SimEvent =
  | { type: 'sale'; residentId: number; price: number; itemId: string }
  | { type: 'reject'; residentId: number; reason: RejectReason }
  | { type: 'day'; report: DayReport }
  | { type: 'delivery'; cost: number }
  | { type: 'aware'; residentId: number; source: AwareSource }
  | { type: 'bankrupt' }
  | { type: 'rival'; what: 'open' | 'promo' }
  | { type: 'milestone'; id: MilestoneId }
  | { type: 'step'; id: StepId }
  | { type: 'event'; id: EventId };

/** Последствия событий, которые длятся какое-то время */
export type Effect =
  /** Сломалась кофемашина: без кофе (или медленнее, если есть вторая) до этого времени */
  | { type: 'broken'; until: number; slow: boolean }
  /** Праздник: гости охотнее заходят весь день */
  | { type: 'boost'; day: number; factor: number }
  /** Заказ офиса: в этот день и минуту забирают qty порций itemId */
  | { type: 'order'; day: number; minute: number; itemId: string; qty: number; pay: number; corporate?: boolean; contract?: boolean }
  /** Блогер: на этот день выйдет обзор (или не выйдет) */
  | { type: 'blogger'; day: number; success: boolean }
  /** Жалоба: в этот день гость расскажет соседям, как с ним обошлись */
  | { type: 'word'; day: number; residentId: number; good: boolean }
  /** Подлатанный холодильник встанет в ночь перед этим днём */
  | { type: 'relapse'; day: number }
  /** Санитарная проверка придёт в этот день и минуту; fail — найдут нарушения (если не готовились) */
  | { type: 'inspection'; day: number; minute: number; ready: boolean; fail: boolean };

/** Договор с фермой: продукт дешевле до until, в дни bad партия приезжает испорченной */
export interface FarmDeal {
  ingredientId: IngredientId;
  /** Цена порции по договору */
  price: number;
  until: number;
  bad: number[];
  /** Сколько сэкономили против обычного поставщика и сколько потеряли на испорченных партиях */
  saved: number;
  lost: number;
}

/** Что пропадает, когда встаёт холодильник */
const CHILLED: IngredientId[] = ['milk', 'kitchen', 'berries', 'cheese', 'ham'];

/** Общее для всех точек игрока */
interface Wallet {
  cash: number;
  daysInRed: number;
  bankrupt: boolean;
  loan: Loan | null;
  loanHistory: LoanHistory;
}

/** Договор с офисом: заказ каждый будний день к 11:00 по фиксированной цене */
export interface OfficeContract {
  itemId: string;
  qty: number;
  /** Платят за день */
  pay: number;
  /** Продукты под заказ на день */
  ingredientCost: number;
  /** С какого дня действует */
  from: number;
  /** Сколько будних заказов осталось */
  left: number;
  /** Сорвано заказов */
  strikes: number;
  done: number;
  earned: number;
}

/** Ядро симуляции. Не знает ничего об отрисовке — этот же код
 *  на этапе 2 переедет на сервер. */
export class Simulation {
  /** Игровое время в минутах с начала первого дня */
  time: number;
  /** Жители района. У гостевой точки — те же, что у главной в районе (attachTo) */
  residents: Resident[];
  readonly cafe = new Cafe();
  readonly marketing = new Marketing();
  /** Конкурент в соседнем помещении — появляется после открытия игрока */
  rival: Rival | null = null;
  /** Знакомые лица — шесть жителей, за которыми видна история */
  regulars: Regular[];
  private readonly regularById = new Map<number, Regular>();
  /** Достигнутые вехи: id → день */
  readonly milestones: Partial<Record<MilestoneId, number>> = {};
  /** «Первые шаги» новичка: какой шаг в какой день выполнен */
  readonly steps: Partial<Record<StepId, number>> = {};
  /** Касса, кредит и банкротство — общие для всех точек игрока (см. link) */
  private wallet: Wallet = { cash: ECONOMY.startCash, daysInRed: 0, bankrupt: false, loan: null, loanHistory: emptyHistory() };
  /** Главная точка, если эта — вторая: погода, кредит и банкротство считаются там */
  private main: Simulation | null = null;
  /** Район, где стоит точка */
  readonly district: DistrictId;
  /** Событие, по которому ждём решения игрока */
  pendingEvent: PendingEvent | null = null;
  effects: Effect[] = [];
  /** Когда какое событие было в последний раз — чтобы не повторялись подряд */
  private lastEvent: Partial<Record<EventId, number>> = {};
  /** Компании коллег: обедают вместе (sim/groups.ts) */
  groups: Group[];
  private readonly groupOf = new Map<number, Group>();
  private groupDay: Record<number, GroupDay> = {};
  /**
   * Несколько точек в одном районе: главная (хозяин) ведёт жителей — их день, маршруты, желания —
   * и решает, к какой из точек игрока идти. Гостевая точка (пекарня на Садовой) — своя касса дня, склад, меню
   * и очередь, но жители общие: она их не двигает, а принимает визиты, которые ей отдала главная.
   */
  private host: Simulation | null = null;
  readonly guests: Simulation[] = [];
  private groupWas: Record<number, boolean> = {};
  /** Договор с офисом «Север»: обеды каждый будний день */
  contract: OfficeContract | null = null;
  /** Договор с фермой: продукт дешевле, но иногда партия испорчена */
  farm: FarmDeal | null = null;
  /** Сколько разовых заказов офиса выполнено — после первого офис предлагает договор */
  private officeOrders = 0;
  /** До какого дня офис не предлагает договор после расторжения */
  private contractBan = 0;
  /** Свой генератор для событий: они не сдвигают жизнь жителей */
  private readonly eventRng: Rng;
  private readonly parkRng: Rng;
  private flyersToday = false;
  get cash(): number {
    return this.wallet.cash;
  }
  set cash(v: number) {
    this.wallet.cash = v;
  }
  get daysInRed(): number {
    return this.wallet.daysInRed;
  }
  set daysInRed(v: number) {
    this.wallet.daysInRed = v;
  }
  get bankrupt(): boolean {
    return this.wallet.bankrupt;
  }
  set bankrupt(v: boolean) {
    this.wallet.bankrupt = v;
  }
  /** Текущий кредит (один за раз) и кредитная история — общие на всех */
  get loan(): Loan | null {
    return this.wallet.loan;
  }
  set loan(v: Loan | null) {
    this.wallet.loan = v;
  }
  get loanHistory(): LoanHistory {
    return this.wallet.loanHistory;
  }
  set loanHistory(v: LoanHistory) {
    this.wallet.loanHistory = v;
  }
  readonly reports: DayReport[] = [];
  private events: SimEvent[] = [];
  private readonly rng: Rng;
  private carry = 0;
  private day: number;
  /** Отдельный генератор для погоды — чтобы она не сдвигала жизнь жителей */
  private readonly skyRng: Rng;
  private ownWeather: Weather;
  private ownForecast: Weather;
  get weather(): Weather {
    return this.main ? this.main.weather : this.ownWeather;
  }
  set weather(w: Weather) {
    this.ownWeather = w;
  }
  get forecast(): Weather {
    return this.main ? this.main.forecast : this.ownForecast;
  }

  /** Новогодний сезон: зимняя погода, сезонное меню и праздничное настроение. Ставит игра по календарю */
  get holiday(): boolean {
    return this.main ? this.main.holiday : this.ownHoliday;
  }
  private ownHoliday = false;

  /**
   * Включить или выключить сезон. Погода сегодня и завтра сразу становится зимней (или обратно) без броска
   * кубика — смена сезона не сдвигает остальную случайность.
   */
  /** 31 декабря или 1 января по календарю игрока */
  get holidayDay(): HolidayDay {
    return this.main ? this.main.holidayDay : this.ownHolidayDay;
  }
  private ownHolidayDay: HolidayDay = null;

  setHolidayDay(d: HolidayDay): void {
    if (!this.main) this.ownHolidayDay = this.ownHoliday ? d : null;
  }

  /** Во сколько раз чаще хочется посидеть в кафе: в сезон */
  private sitMood(): number {
    return this.holiday ? HOLIDAY.sitWant : 1;
  }

  /** Во сколько раз чаще любые желания: вечер 31-го — все за праздничным, утро 1-го — город спит */
  private holidayRush(minute: number): number {
    if (!this.holiday) return 1;
    const m = minute % MINUTES_PER_DAY;
    if (this.holidayDay === 'eve' && m >= HOLIDAY.eveFrom) return HOLIDAY.eveWant;
    if (this.holidayDay === 'newyear' && m < HOLIDAY.newYearUntil) return HOLIDAY.newYearWant;
    return 1;
  }

  setHoliday(on: boolean): void {
    if (this.main || this.ownHoliday === on) return;
    this.ownHoliday = on;
    const conv = on ? toWinter : toSummer;
    this.ownWeather = conv(this.ownWeather);
    this.ownForecast = conv(this.ownForecast);
  }
  set forecast(w: Weather) {
    this.ownForecast = w;
  }

  readonly seed: number;

  constructor(seed = 1, startTime = hm(6, 0), district: DistrictId = 'klenovaya') {
    this.seed = seed;
    this.district = district;
    this.rng = new Rng(seed);
    this.skyRng = new Rng(seed * 7919 + 13);
    this.eventRng = new Rng(seed * 104729 + 7);
    this.parkRng = new Rng(seed * 6007 + 3);
    this.time = startTime;
    this.day = dayNumber(startTime);
    this.cafe.today = Cafe.emptyDay(this.day);
    // Первый день — ясно, дальше как повезёт
    this.ownWeather = { kind: 'sunny', temp: 21, wind: 0 };
    this.ownForecast = this.rollForecast(this.day + 1);
    this.residents = generateResidents(this.rng, seed, district);
    this.regulars = pickRegulars(this.residents);
    const colleagues = formGroups(this.residents);
    this.groups = [...colleagues, ...formFriends(this.residents, colleagues.length)];
    for (const g of this.groups) for (const id of g.members) this.groupOf.set(id, g);
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
      district: this.district,
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
      steps: { ...this.steps },
      pendingEvent: this.pendingEvent,
      effects: this.effects,
      lastEvent: { ...this.lastEvent },
      contract: this.contract,
      farm: this.farm,
      groupDay: this.groupDay,
      groupWas: this.groupWas,
      officeOrders: this.officeOrders,
      contractBan: this.contractBan,
      eventRng: this.eventRng.snapshot,
      parkRng: this.parkRng.snapshot,
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
    const sim = new Simulation(d.seed, hm(6, 0), d.district ?? 'klenovaya');
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
    Object.assign(sim.steps, d.steps ?? {});
    // Сохранение старше «Первых шагов»: игрок давно освоился — карточку не показываем
    if (!d.steps && sim.reports.length > 3) for (const st of FIRST_STEPS) sim.steps[st.id] = 0;
    sim.pendingEvent = d.pendingEvent ?? null;
    sim.effects = d.effects ?? [];
    sim.lastEvent = { ...(d.lastEvent ?? {}) };
    sim.contract = d.contract ?? null;
    sim.farm = d.farm ?? null;
    sim.groupDay = { ...(d.groupDay ?? {}) };
    sim.groupWas = { ...(d.groupWas ?? {}) };
    sim.officeOrders = d.officeOrders ?? 0;
    sim.contractBan = d.contractBan ?? 0;
    if (d.eventRng !== undefined) sim.eventRng.snapshot = d.eventRng;
    if (d.parkRng !== undefined) sim.parkRng.snapshot = d.parkRng;
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
          r.path = sim.route(r, sim.at(r.placeId), null);
        } else {
          const p = sim.at(r.placeId);
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
    if (this.cafe.opened || this.bankrupt || this.cash < pr.openingCost || pr.district !== this.district) return false;
    this.cash -= pr.openingCost;
    this.cafe.premisesId = premisesId;
    this.cafe.opened = true;
    // Два столика входят в открытие кафе; у киоска зала нет
    if (PREMISES[premisesId].seats) this.cafe.interior.load(preset('standard').layout);
    for (const e of pr.equipped ?? []) if (!this.cafe.equipment.includes(e)) this.cafe.equipment.push(e);
    // Своё стартовое меню у помещения (бистро — с обедами)
    if (pr.starterMenu) {
      for (const id of pr.starterMenu) this.cafe.addItem(id);
      for (const m of [...this.cafe.menu]) if (!pr.starterMenu.includes(m.id)) this.cafe.removeItem(m.id);
    }
    // В киоске нет кухни и бара — стартовое меню без них
    for (const m of [...this.cafe.menu]) if (!this.cafe.fits(m.id)) this.cafe.removeItem(m.id);
    if (!this.cafe.hasItem('croissant') && premisesId !== 'bakery') this.cafe.addItem('croissant');
    // Пекарня: вечером своя выпечка дешевле — лучше продать со скидкой, чем списать
    if (premisesId === 'bakery') {
      this.cafe.markdown = { ...MARKDOWN_DEFAULT };
      this.cafe.wholesale = 20;
    }
    this.note('open', tr`${pr.name}: открыто`, undefined, '');
    // У гостевой точки своего конкурента нет: в районе он один, у главной
    if (!this.host) this.rival = new Rival(premisesId, this.day + RIVAL.delayDays);
    // Сразу знают соседи и продавцы напротив; у киоска — те, кто ходит через метро
    for (const r of this.residents) {
      const neighbour =
        premisesId === 'cafe'
          ? r.homeId === 'home-1' || r.homeId === 'home-2'
          : premisesId === 'bistro'
            ? r.workId === 'bc-alfa' || r.workId === 'cowork'
            : premisesId === 'bakery'
              ? SADOVAYA_HOMES.includes(r.homeId)
              : r.homeId === 'metro' && r.kind !== 'visitor';
      const p = r.kind === 'shopkeeper' ? 1 : neighbour ? (premisesId === 'kiosk' ? 0.35 : 0.7) : MARKETING.openingHeard;
      if (this.rng.chance(p)) this.learn(r, 'start');
    }
    // Стартовая закупка входит в стоимость открытия; автозаказ включён на тех же уровнях —
    // только для того, что нужно стартовому меню: иначе кухонные продукты портятся каждые два дня
    const used = new Set(this.cafe.menu.flatMap((m) => Object.keys(recipeOf(m.id))));
    for (const ing of INGREDIENTS) {
      const qty = used.has(ing.id) ? STARTER_KEEP[ing.id] : 0;
      this.cafe.stock.keep[ing.id] = qty;
      this.cafe.stock.keepWeekend[ing.id] = used.has(ing.id) ? STARTER_KEEP_WEEKEND[ing.id] : 0;
      if (qty > 0) this.cafe.stock.addNow(ing.id, qty, this.day, ing.unitCost);
    }
    return true;
  }

  setPrice(itemId: string, price: number): void {
    const it = this.cafe.item(itemId);
    const from = it.price;
    it.price = Math.max(ECONOMY.priceStep, Math.round(price / ECONOMY.priceStep) * ECONOMY.priceStep);
    if (it.price !== from) this.markStep('price');
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
    if (from !== to) this.note('hours', L('Часы работы'), from, to);
  }

  hireBarista(contract: Contract): boolean {
    const b = this.cafe.hire(contract);
    if (b) this.note(`staff:${b.id}`, L('Нанят бариста'), undefined, contract === 'shift' ? L('на смену') : L('почасово'));
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
    else this.note(`staff:${id}`, L('Уволен бариста'), undefined, b.contract === 'shift' ? L('на смене') : L('почасовой'));
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
    this.note(`schedule:${id}`, tr`График бариста ${n}`, from, scheduleText(b));
  }

  /**
   * Свои часы владельца — когда он встаёт за стойку вместе с персоналом. Без персонала не нужны:
   * владелец и так стоит всё время работы. null — убрать свои часы
   */
  setOwnerShift(schedule: StaffSchedule | null): boolean {
    if (schedule && (!validWindow(schedule) || schedule.to - schedule.from > ECONOMY.ownerHours * 60)) return false;
    if (schedule && this.cafe.staff.length === 0) return false;
    const from = ownerShiftText(this.cafe.ownerShift);
    this.cafe.ownerShift = schedule ? { days: [...schedule.days], from: schedule.from, to: schedule.to } : null;
    this.note('owner-shift', L('Твои часы за стойкой'), from, ownerShiftText(this.cafe.ownerShift));
    return true;
  }

  /** Промотать до 6:00 следующего утра (если сейчас раньше 6:00 — до сегодняшних 6:00) */
  skipToMorning(): void {
    const left = (hm(6) - this.minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    this.advance(left < 1 ? MINUTES_PER_DAY : left);
  }

  addMenuItem(id: string): boolean {
    // Сезонное — только в свой сезон
    if (CATALOG.find((c) => c.id === id)?.seasonal && !this.holiday) return false;
    const ok = this.cafe.addItem(id);
    if (ok) this.ensureSupply(id);
    if (ok) this.toggle(`menu:${id}`, tr`Меню: ${itemName(id, this.cafe.own)}`, L('добавлен'), L('убран'), true);
    return ok;
  }

  /** Для новой позиции нужных продуктов нет и автозаказ на них выключен: ставим его и заказываем сразу — привезут утром */
  private ensureSupply(itemId: string): void {
    const stock = this.cafe.stock;
    for (const id of Object.keys(recipeOf(itemId)) as IngredientId[]) {
      if (stock.keep[id] > 0 || stock.qty(id) > 0 || (stock.pending[id] ?? 0) > 0) continue;
      stock.keep[id] = DISH_STARTER;
      stock.keepWeekend[id] = DISH_STARTER;
      stock.order(id, DISH_STARTER);
    }
  }

  /** Придумать своё блюдо: основа + добавки, своё название и цена. Сразу встаёт в меню */
  createDish(baseId: BaseId, addIns: AddInId[], name: string, price: number): boolean {
    const it = this.cafe.createDish(baseId, addIns, name, price);
    if (!it) return false;
    this.ensureSupply(it.id);
    this.toggle(`menu:${it.id}`, tr`Своё блюдо: ${it.name}`, L('убрано'), L('в меню'), true);
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
    if (ok) this.toggle(`menu:${id}`, tr`Своё блюдо: ${name}`, L('в меню'), L('убрано'), false);
    return ok;
  }

  removeMenuItem(id: string): boolean {
    const name = itemName(id, this.cafe.own);
    const ok = this.cafe.removeItem(id);
    if (ok) this.toggle(`menu:${id}`, tr`Меню: ${name}`, L('добавлен'), L('убран'), false);
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

  /** Место в районе этой точки */
  at(id: string): Place {
    return place(id, this.district);
  }

  /** Сделать точку второй: касса, кредит, погода и банкротство — общие с главной. Владелец стоит в главной */
  link(main: Simulation): void {
    this.main = main;
    this.wallet = main.wallet;
    this.cafe.ownerAway = true;
  }

  get isBranch(): boolean {
    return this.main !== null;
  }

  /** Сделать точку гостевой при главной в том же районе: жители, погода и касса — общие */
  attachTo(host: Simulation): void {
    this.link(host);
    this.host = host;
    this.residents = host.residents;
    this.regulars = [];
    this.regularById.clear();
    this.groups = [];
    this.groupOf.clear();
    this.rival = null;
    if (!host.guests.includes(this)) host.guests.push(this);
  }

  /** Гостевая точка: жителей ведёт главная */
  get isGuest(): boolean {
    return this.host !== null;
  }

  /** Точка, к которой сейчас идёт или в которой сидит житель */
  private pointOf(r: Resident): Simulation {
    const id = r.visit?.point;
    return (id && this.guests.find((g) => g.shopId === id)) || this;
  }

  /** Один шаг симуляции — для города из нескольких точек, которые идут в ногу */
  tick(): void {
    if (!this.bankrupt) this.step(STEP);
  }

  /** Где на карте бизнес игрока */
  get shopId(): string {
    return this.cafe.premises.placeId;
  }

  get minute(): number {
    return minuteOfDay(this.time);
  }

  private step(dt: number): void {
    if (this.steps.guests === undefined && this.cafe.opened && this.guestsServed >= STEP_GUESTS) this.markStep('guests');
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

    // Гостевая точка жителей не ведёт: их шаг делает главная
    for (const r of this.host ? [] : this.residents) {
      const entry = currentEntry(r.schedule, minute);
      // Пока житель в кафе и ещё не получил заказ, следующее занятие подождёт
      const waiting = r.visit && r.visit.stage !== 'dining' && this.time - r.visit.since < PATIENCE;
      if (entry !== r.entry && !waiting) this.onTransition(r, entry);
      if (r.visit?.stage === 'dining' && this.time >= r.visit.until) this.pointOf(r).finishVisit(r);
      if (r.rivalVisit?.until != null && this.time >= r.rivalVisit.until) {
        r.rivalVisit = null;
        this.goTo(r, r.entry.placeId);
      }
      if (r.walking) this.walk(r, dt);
      else this.wander(r, dt);
    }

    const broken = this.effects.some((e) => e.type === 'broken' && e.slow && this.time < e.until) ? 1.5 : 1;
    // Специализация: утром в пик руки набиты — гостя обслуживают быстрее
    const peak = this.cafe.specialty && minute >= SPECIALTY.peakFrom && minute < SPECIALTY.peakTo ? SPECIALTY.speed : 1;
    this.cafe.serviceFactor = broken * peak;
    this.fulfilOrders(minute);
    this.inspect(minute);
    const { sales, failed } = this.cafe.tick(dt, minute);
    for (const sale of sales) this.onSale(sale.residentId, sale.price, sale.itemId);
    for (const id of failed) this.runOut(this.residents[id]);
  }

  // ——— Большой сквер ———

  /** Гулять идут то в маленький сквер у перекрёстка, то в большой: днём чаще в большой, вечером — реже */
  private parkFor(entry: ScheduleEntry): string {
    if (entry.placeId !== 'park') return entry.placeId;
    const share = entry.activity === 'night' ? PARK_SHARE.night : PARK_SHARE.day;
    return this.parkRng.chance(share) ? 'bigpark' : 'park';
  }

  /** Кто гуляет в большом сквере, время от времени идёт дальше по кольцу — сквер живой */
  private wander(r: Resident, dt: number): void {
    if (r.walking || r.visit || r.rivalVisit || r.placeId !== 'bigpark') return;
    if (!this.parkRng.chance(dt / PARK_SHARE.strollEvery)) return;
    const from = nearestLoop(r.pos);
    const n = PARK_LOOP.length;
    const to = (from + (this.parkRng.chance(0.5) ? 1 : -1) * this.parkRng.int(1, 3) + n) % n;
    r.path = this.loopSpot(loopPath(from, to));
    r.walking = true;
  }

  /** Путь по кольцу с небольшим сдвигом последней точки: гуляющие не стоят друг в друге */
  private loopSpot(path: Point[]): Point[] {
    const last = path.at(-1);
    if (last) path[path.length - 1] = { x: last.x + this.parkRng.jitter(8), y: last.y + this.parkRng.jitter(8) };
    return path;
  }

  // ——— Жители и кафе ———

  private onTransition(r: Resident, entry: ScheduleEntry): void {
    const prev = r.entry;
    r.entry = entry;
    r.activity = entry.activity;
    if (r.visit) this.pointOf(r).dropVisit(r, 'no-time');
    r.rivalVisit = null;

    const bakery = this.guests.some((g) => g.cafe.opened && g.cafe.premisesId === 'bakery');
    // В пятницу компания друзей идёт сидеть вместе — в бар, а не как придётся
    const want = this.friendsMeeting(r, entry)
      ? { kind: 'bar' as const, mode: 'replace' as const, dwell: FRIENDS.dwell }
      : rollWant(this.rng, r, entry, prev, this.weather.kind, isWeekend(this.day), this.sitMood(), this.holidayRush(this.minute), bakery);
    const point = want ? this.pickPoint(r, want, entry) : this;
    // Хлеб домой бывает только в пекарне: закрыта — житель купит хлеб в «Продуктах», в отчёт кафе это не идёт
    const breadOnly = want?.bakery && point === this;
    if (want && !breadOnly && point.decide(r, want, entry)) {
      if (point !== this) r.visit!.point = point.shopId;
      this.goTo(r, point.shopId);
      return;
    }
    if (r.rivalVisit && this.rival) {
      this.goTo(r, this.rival.placeId);
      return;
    }
    // В дождь и мороз в сквер идут немногие — остаются дома
    const skip = PARK_SKIP[this.weather.kind];
    if (entry.placeId === 'park' && skip && this.rng.chance(skip) && r.homeId !== 'metro') {
      this.goTo(r, r.homeId);
      return;
    }
    this.goTo(r, this.parkFor(entry));
  }

  /**
   * Куда из точек игрока в районе житель пойдёт с этим желанием: туда, где у него больше шансов зайти.
   * Без гостевых точек — всегда сюда. Закрытые и неоткрытые точки не рассматриваются (кроме главной: её отказ
   * «закрыто» тоже считается в отчёте).
   */
  private pickPoint(r: Resident, want: Want, entry: ScheduleEntry): Simulation {
    if (!this.guests.length) return this;
    const minute = Math.floor(this.minute);
    let best: Simulation = this;
    let top = this.cafe.opened && this.cafe.isOpenAt(minute) && r.aware ? this.chances(r, want, entry, minute).pP : 0;
    for (const g of this.guests) {
      if (!g.cafe.opened || !g.cafe.isOpenAt(minute) || !g.cafe.isOpenAt(minuteOfDay(minute + 10))) continue;
      const p = r.aware ? g.chances(r, want, entry, minute).pP : 0;
      if (p > top) [best, top] = [g, p];
    }
    return best;
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
      const { offer, pP, pR } = this.chances(r, want, entry, minute);
      itemId = offer.item?.id;
      price = offer.item?.price;
      const colleagues = want.kind === 'lunch' && !isWeekend(this.day) ? this.groupOf.get(r.id) : undefined;
      const group = colleagues && !colleagues.friends ? colleagues : want.kind === 'bar' ? this.friendsMeeting(r, entry) ?? undefined : undefined;
      if (!offer.item) reason = 'no-item';
      else if (group) {
        // Обедают компанией: решение общее, своё «зайти или нет» не бросают
        const v = this.groupVote(group, want, entry, minute);
        if (!v.go) {
          reason = v.reason ?? 'company';
          if (reason === 'rival' && this.rival) r.rivalVisit = { until: null, dwell: this.rival.t.seats ? want.dwell : 0 };
        }
      } else if (pR <= 0) {
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

  /** Компания жителя и её сегодняшнее решение (если уже решали) */
  groupFor(residentId: number): { group: Group; today: GroupDay | null; last: GroupDay | null } | null {
    const group = this.groupOf.get(residentId);
    if (!group) return null;
    const d = this.groupDay[group.id];
    return { group, today: d && d.day === this.day ? d : null, last: d ?? null };
  }

  /** Насколько житель готов зайти к вам (pP) и к конкуренту (pR) и что он бы взял */
  private chances(r: Resident, want: Want, entry: ScheduleEntry, minute: number): { offer: Offer; pP: number; pR: number } {
    const cafe = this.cafe;
    // Житель видит цены с учётом счастливых часов
    const festive = this.holiday;
    const menu = cafe.menu
      // За хлебом домой — только своя выпечка пекарни
      .filter((m) => !this.blocked(m.kind) && (!want.bakery || !!CATALOG.find((c) => c.id === m.id)?.bakery))
      .map((m) => ({ ...m, price: cafe.priceAt(m, minute), festive: festive && !!m.seasonal }));
    const offer = evaluate(r, want, menu, r.pos, this.at(this.shopId).front, nearestFront(this.at(entry.placeId), r.pos), this.weather.kind);
    // Специализация: за своей категорией идут именно сюда
    const special = cafe.specialty?.has(want.kind) ? 1 + SPECIALTY.pull : 1;
    const pP = offer.item ? Math.min(1, offer.p * this.boost * this.cozyPull(r, want) * special) : 0;
    // Фирменное блюдо по вкусу есть только здесь — конкурент переманивает вдвое реже
    const signature = offer.item && isDish(offer.item.id) && offer.match >= SIGNATURE_MATCH ? DISH_EFFECT.rivalPull : 1;
    const pR = this.rivalChance(r, want, entry, minute) * signature;
    return { offer, pP, pR };
  }

  /**
   * Компания коллег решает за всех один раз в день: каждый «голосует» своим желанием зайти к вам или к конкуренту.
   * Нравится большинству и очередь небольшая — идут все; иначе все идут к конкуренту (если большинство за него) или мимо.
   */
  private groupVote(g: Group, want: Want, entry: ScheduleEntry, minute: number): GroupDay {
    const cached = this.groupDay[g.id];
    if (cached && cached.day === this.day) return cached;
    const members = g.members.map((id) => this.residents[id]);
    // На работе говорят: знает один — знают все
    if (members.some((m) => m.aware)) for (const m of members) if (!m.aware) this.learn(m, 'word');
    let yes = 0;
    let rival = 0;
    for (const m of members) {
      const c = this.chances(m, want, entry, minute);
      if (c.offer.item && this.rng.chance(c.pP)) yes += 1;
      else if (c.pR > 0 && this.rng.chance(c.pR)) rival += 1;
    }
    const need = votesNeeded(members.length);
    let verdict: GroupDay;
    if (yes >= need && this.cafe.busy < GROUP.queue) verdict = { day: this.day, go: true };
    else if (yes >= need) verdict = { day: this.day, go: false, reason: 'queue' };
    else if (rival >= need) verdict = { day: this.day, go: false, reason: 'rival' };
    else verdict = { day: this.day, go: false, reason: 'company' };
    this.groupDay[g.id] = verdict;
    // Новость, когда компания впервые пришла или перестала ходить
    const was = this.groupWas[g.id];
    if (was !== undefined ? was !== verdict.go : verdict.go) {
      const first = members.map((m) => m.name.split(' ')[0]);
      const who = tr`${first.slice(0, 2).join(', ')} и\u00a0ещё ${first.length - 2}`;
      const why = verdict.reason === 'queue' ? L('очередь') : verdict.reason === 'rival' ? L('выбрали конкурента') : L('большинству не\u00a0по\u00a0душе');
      if (g.friends)
        this.addNews(
          verdict.go
            ? tr`🍻 ${who} теперь собираются у\u00a0вас по\u00a0пятницам`
            : tr`🍻 ${who} в\u00a0эту пятницу сидят не\u00a0у\u00a0вас\u00a0— ${why}`,
        );
      else {
        const where = this.at(g.workId).name;
        this.addNews(
          verdict.go
            ? tr`${where}: ${who} теперь обедают у\u00a0вас компанией`
            : tr`${where}: ${who} сегодня обедают не\u00a0у\u00a0вас\u00a0— ${why}`,
        );
      }
    }
    this.groupWas[g.id] = verdict.go;
    return verdict;
  }

  /** Уютный зал тянет: посидеть идут охотнее, чем взять с собой; любимая вещь в зале — ещё немного */
  private cozyPull(r: Resident, want: Want): number {
    if (this.cafe.premisesId === 'kiosk') {
      // Стойка киоска: меню видно издалека, обжитый вид тоже тянет
      return 1 + (this.cafe.has('board') ? UPGRADE_EFFECT.boardPull : 0) + (this.cafe.has('shelves') ? UPGRADE_EFFECT.shelvesPull : 0);
    }
    if (!this.cafe.premises.seats) return 1;
    const hall = this.cafe.interior;
    const sit = want.mode === 'replace';
    const style = hall.styleFit(r.kind) * (sit ? INTERIOR.styleSit : INTERIOR.styleGo);
    // Ёлка и гирлянда в сезон: посидеть в праздничном зале хочется больше
    const festive =
      sit && this.holiday ? (hall.layout.tree ? HOLIDAY.treeSit : 0) + (hall.layout.garland ? HOLIDAY.garlandSit : 0) : 0;
    return 1 + hall.cozyLevel * (sit ? INTERIOR.attractSit : INTERIOR.attractGo) + (sit && hall.likes(r.kind) ? 0.05 : 0) + style + festive;
  }

  /** Насколько житель склонен пойти к конкуренту с этим желанием прямо сейчас (0 — никак) */
  private rivalChance(r: Resident, want: Want, entry: ScheduleEntry, minute: number): number {
    const rival = this.rival;
    if (!rival || !rival.isOpen(this.day, minute) || !rival.isOpen(this.day, minute + 10)) return 0;
    const o = evaluate(r, want, rival.menu(this.day), r.pos, this.at(rival.placeId).front, nearestFront(this.at(entry.placeId), r.pos), this.weather.kind);
    // Конкурент — сетевой, о нём знают все; лояльность к нему не растёт
    return o.item ? o.pPrice * o.pRoute * 0.8 : 0;
  }

  private onArrive(r: Resident): void {
    const point = this.pointOf(r);
    if (point !== this) return point.onArrive(r);
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
    const wet = this.weather.kind === 'rain' || this.weather.kind === 'snow' || this.weather.kind === 'frost';
    if (this.cafe.premisesId === 'kiosk' && wet && !this.cafe.has('awning')) limit -= UPGRADE_EFFECT.rainQueue;
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
    const hall = this.cafe.premises.seats ? this.cafe.interior : null;
    const cozy = hall
      ? hall.cozyLevel * INTERIOR.loyalty + (hall.likes(r.kind) ? INTERIOR.liked : 0) + hall.styleFit(r.kind) * INTERIOR.styleLoyalty
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
    const cozyWord =
      (hall ? (1 + INTERIOR.wordBoost * hall.cozyLevel) * (1 + INTERIOR.styleWord * hall.styleFit(r.kind)) : 1) *
      (this.cafe.specialty?.has(item.kind) ? 1 + SPECIALTY.word : 1);
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
    // Сел в зале своего стиля — считаем, что пришёл и ради зала
    if (r.visit.want.mode === 'replace' && hall && hall.wholeFit(r.kind) > 0) this.cafe.today.styleGuests = (this.cafe.today.styleGuests ?? 0) + 1;
    this.bringCompany(r, itemId);
    this.extraOrder(r, itemId);
    this.pastryImpulse(r, itemId);
    this.takeHome(r, itemId);
  }

  /**
   * Постоянный гость сел в зале и привёл коллегу, соседа или друга. Чем уютнее зал, тем чаще.
   * Тот узнаёт о кафе, заказывает по своему вкусу и сам немного привязывается.
   */
  private bringCompany(r: Resident, itemId: string): void {
    if (!this.cafe.premises.seats || r.loyalty < LOYAL) return;
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
      const who = { work: L('коллегу'), home: f ? L('соседку') : L('соседа'), kind: f ? L('подругу') : L('друга') }[near(friend)!];
      const first = r.name.split(' ')[0];
      (t.news ??= []).push(tr`${first} ${isFemale(r.name) ? L('привела') : L('привёл')} ${who} — ${friend.name.split(' ')[0]} взял${f ? L('а') : ''} ${pick.name.toLowerCase()}`);
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

  /**
   * Пекарня: домой берут не одно — к хлебу булочки, к кофе пирожок. Только своя выпечка и только в пекарне,
   * один раз за визит.
   */
  private takeHome(r: Resident, itemId: string): void {
    if (this.cafe.premisesId !== 'bakery' || !r.visit) return;
    const chance = r.visit.want.bakery ? BAKERY.takeHomeBread : BAKERY.takeHomeOther;
    if (!this.rng.chance(chance)) return;
    const options = this.cafe.menu.filter((m) => m.id !== itemId && CATALOG.find((c) => c.id === m.id)?.bakery && this.cafe.stock.canMake(m.id));
    if (!options.length) return;
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
    if (this.cafe.premises.seats) chance = Math.min(0.95, chance * (1 + INTERIOR.extraBoost * this.cafe.interior.cozyLevel));
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
    // Выпечку везёт своя пекарня, если она есть и возит: дешевле поставщика, деньги остаются в сети
    const baker = this.ownBakery();
    if (baker) this.cafe.stock.unitPrice.bakery = BAKERY.supplyPrice;
    else delete this.cafe.stock.unitPrice.bakery;
    const farm = this.farm && this.day <= this.farm.until ? this.farm : null;
    if (farm) this.cafe.stock.unitPrice[farm.ingredientId] = farm.price;
    const d = this.cafe.stock.deliver(this.day);
    if (farm) this.farmDelivery(farm, d.items[farm.ingredientId] ?? 0);
    const shipped = d.items.bakery ?? 0;
    if (baker && shipped > 0) baker.supplyOut(shipped);
    if (this.cafe.premisesId === 'bakery') this.sellWholesale();
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
    this.resolveLater();
    this.runContract();
    this.rollEvent();
  }

  /** Своя пекарня, которая возит выпечку в эту точку (сама пекарня себе не возит) */
  private ownBakery(): Simulation | null {
    if (this.cafe.premisesId === 'bakery') return null;
    const hub = this.host ?? this.main ?? this;
    return hub.guests.find((g) => g.cafe.opened && g.cafe.premisesId === 'bakery' && g.cafe.supply) ?? null;
  }

  /** Пекарня утром везёт хлеб в «Продукты»: магазин платит за проданное, непроданное возвращает (печь уже потрачена) */
  private sellWholesale(): void {
    const qty = Math.min(BAKERY.wholesaleMax, Math.max(0, Math.round(this.cafe.wholesale)));
    if (!qty) return;
    const share = (BAKERY.wholesaleMin + BAKERY.wholesaleSpread * this.eventRng.next()) * (isWeekend(this.day) ? BAKERY.wholesaleWeekend : 1);
    const sold = Math.min(qty, Math.round(qty * share));
    const t = this.cafe.today;
    const revenue = sold * BAKERY.wholesalePrice;
    const cost = qty * BAKERY.supplyCost;
    t.revenue += revenue;
    t.cogs += sold * BAKERY.supplyCost;
    // Возврат: выпечка пропала, это расход «под заказ», а не списание со склада
    t.orderCost = (t.orderCost ?? 0) + (qty - sold) * BAKERY.supplyCost;
    t.wholesale = { qty, sold };
    (t.revenueBy ??= {}).wholesale = (t.revenueBy.wholesale ?? 0) + revenue;
    (t.cogsBy ??= {}).wholesale = (t.cogsBy.wholesale ?? 0) + cost;
    this.cash += revenue - cost;
  }

  /** Пекарня: возить ли выпечку в свои точки */
  setSupply(on: boolean): void {
    this.cafe.supply = on;
    this.toggle('supply', L('Выпечка в\u00a0свои точки'), L('возим'), L('не\u00a0возим'), on);
  }

  /** Пекарня: сколько хлеба возить в «Продукты» каждое утро */
  setWholesale(qty: number): void {
    const before = this.cafe.wholesale;
    this.cafe.wholesale = Math.min(BAKERY.wholesaleMax, Math.max(0, Math.round(qty)));
    this.note('wholesale', L('Хлеб в\u00a0«Продукты»'), tr`${before}\u00a0шт.`, tr`${this.cafe.wholesale}\u00a0шт.`);
  }

  /** Пекарня отвезла выпечку в свою точку: выручка по цене сети, затраты на выпечку — себестоимость */
  private supplyOut(qty: number): void {
    const t = this.cafe.today;
    const revenue = qty * BAKERY.supplyPrice;
    const cost = qty * BAKERY.supplyCost;
    t.revenue += revenue;
    t.cogs += cost;
    t.supplied = (t.supplied ?? 0) + qty;
    (t.revenueBy ??= {}).supply = (t.revenueBy.supply ?? 0) + revenue;
    (t.cogsBy ??= {}).supply = (t.cogsBy.supply ?? 0) + cost;
    this.cash += revenue - cost;
  }

  /** Житель узнал о точке от самого себя: он свой в другой вашей точке (sim/commute.ts) */
  learnFromChain(r: Resident): void {
    this.learn(r, 'word');
  }

  /** Новость о знакомых лицах в сегодняшний отчёт */
  addNews(line: string): void {
    (this.cafe.today.news ??= []).push(line);
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
    this.note('sign', L('Повешена вывеска'), undefined, formatMoney(MARKETING.signCost));
    this.cash -= MARKETING.signCost;
    this.cafe.today.marketing += MARKETING.signCost;
    return true;
  }

  setFlyers(on: boolean): void {
    if (on !== this.marketing.flyers) this.toggle('flyers', L('Листовки у\u00a0метро'), L('раздаём'), L('остановлены'), on);
    this.marketing.flyers = on;
    if (on) this.flyersToday = true;
  }

  launchSocial(): boolean {
    if (this.marketing.socialDaysLeft > 0 || !this.cafe.opened) return false;
    this.marketing.socialDaysLeft = MARKETING.socialDays;
    this.note('social', L('Запущены соцсети'), undefined, tr`${MARKETING.socialDays}\u00a0дней`, L('со\u00a0следующего утра'));
    this.cash -= MARKETING.socialCampaign;
    this.cafe.today.marketing += MARKETING.socialCampaign;
    return true;
  }

  setHappyHours(h: HappyHours | null): void {
    const from = happyText(this.marketing.happy);
    this.marketing.happy = h && h.to > h.from && h.discount > 0 ? h : null;
    this.note('happy', L('Счастливые часы'), from, happyText(this.marketing.happy));
  }

  setLoyaltyCard(on: boolean): void {
    if (on !== this.marketing.loyaltyCard) this.toggle('card', L('Карта лояльности'), L('включена'), L('выключена'), on);
    this.marketing.loyaltyCard = on;
  }

  /** Отметить шаг «Первых шагов» (итоги дня отмечает интерфейс: смотреть их — дело игрока) */
  markStep(id: StepId): void {
    if (this.steps[id] !== undefined) return;
    this.steps[id] = this.day;
    this.events.push({ type: 'step', id });
  }

  /** Сколько гостей обслужено за всё время — для первого шага */
  get guestsServed(): number {
    return this.reports.reduce((n, r) => n + r.guests, 0) + this.cafe.today.guests;
  }

  // ——— Склад: команды игрока ———

  orderIngredient(id: IngredientId, qty: number): void {
    this.cafe.stock.order(id, qty);
    this.markStep('stock');
    const total = this.cafe.stock.pending[id] ?? qty;
    this.note(`order:${id}`, tr`Заказ: ${ingredient(id).name.toLowerCase()}`, undefined, tr`${total}\u00a0порц.`, L('привезут в\u00a06:00'));
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
    if (levels[id] !== from) this.markStep('stock');
    this.note(
      `keep:${id}:${weekend ? 'we' : 'wd'}`,
      tr`Держать ${ingredient(id).name.toLowerCase()} (${weekend ? L('выходные') : L('будни')})`,
      String(from),
      String(levels[id]),
      L('автозаказ ночью'),
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
    this.writeOff(this.cafe.stock.expire(this.day));
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
    if (this.rival) {
      // Конец недели конкурента: теряет гостей — отвечает, дела идут хорошо — поднимает цены
      const late = this.cafe.opened && this.cafe.closeAt > this.rival.t.closeAt;
      const move = this.rival.endDay(this.day, late);
      if (move) (this.cafe.today.events ??= []).push(move);
    }
    // Не успели решить — срабатывает вариант по умолчанию
    if (this.pendingEvent) this.applyChoice(card(this.pendingEvent).fallback, true);
    this.effects = this.effects.filter((e) => !(e.type === 'boost' && e.day <= this.day) && !(e.type === 'broken' && e.until <= nextDay * MINUTES_PER_DAY - MINUTES_PER_DAY));
    const news = this.updateRegulars();
    if (news.length) this.cafe.today.news = [...(this.cafe.today.news ?? []), ...news];
    const report = this.cafe.closeDay(nextDay);
    report.weekday = weekday(report.day);
    report.weather = this.weather;
    // Новый день: погода из прогноза, новый прогноз, будни или выходные
    if (!this.main) {
      this.weather = this.forecast;
      this.forecast = this.rollForecast(nextDay + 1);
    }
    report.forecast = this.main ? this.main.weather : this.weather;
    // Выручка и закупка уже прошли через кассу — списываем постоянные расходы и налог
    this.cash -= report.rent + report.utilities + report.wages + report.tax;
    if (!this.main) this.payLoan(report);
    report.cashAfter = this.cash;
    this.reports.push(report);
    if (report.opened && report.revenue >= STEP_REVENUE) this.markStep('revenue');
    const reached = this.checkMilestones(report.day);
    if (reached.length) report.milestones = reached;
    this.day = nextDay;
    this.applyDaySchedules();
    this.events.push({ type: 'day', report });
    for (const id of reached) this.events.push({ type: 'milestone', id });
    if (this.rival?.opensDay === nextDay) this.events.push({ type: 'rival', what: 'open' });
    else if (this.rival && this.rival.promo(nextDay) && !this.rival.promo(nextDay - 1)) this.events.push({ type: 'rival', what: 'promo' });

    // Банкротство считает главная точка: касса общая
    if (this.main) return;
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
    // Кредит один на всё дело: берут и платят в главной точке
    if (this.main) return this.main.loanOffer(source);
    const no = (refusal: string): LoanOffer => ({ source, refusal, max: 0 });
    if (!this.cafe.opened || this.bankrupt) return no(L('Сначала открой точку'));
    if (this.loan) return no(L('Сначала верни текущий кредит'));
    const h = this.loanHistory;
    if (h.repaidDay !== null && this.day < h.repaidDay + LOAN.cooldownDays) {
      return no(tr`Новый кредит — через ${h.repaidDay + LOAN.cooldownDays - this.day} дн. после погашения прошлого`);
    }
    if (source === 'private') {
      if (h.privateTaken >= LOAN.privateTimes) return no(tr`Частник выручал уже ${LOAN.privateTimes} раза и больше не даёт`);
      return { source, refusal: null, max: LOAN.privateMax };
    }
    const worked = this.day - this.openedDay;
    if (worked < LOAN.bankFromDay) return no(tr`Банк смотрит историю: приходи через ${LOAN.bankFromDay - worked} дн. работы`);
    const opened = this.reports.filter((r) => r.opened);
    const lastWeek = opened.slice(-7).reduce((s, r) => s + r.profit, 0);
    if (lastWeek < -LOAN.bankRefuseLoss) return no(tr`Банк не кредитует точку в убытке: за неделю ${formatMoney(lastWeek)}`);
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
    if (this.main) return this.main.takeLoan(source, amount);
    const o = this.loanOffer(source);
    const sum = Math.round(amount / LOAN.step) * LOAN.step;
    if (o.refusal || sum < LOAN_TERMS[source].min || sum > o.max) return false;
    this.loan = { source, amount: sum, left: sum, takenDay: this.day, nextDue: this.day + 7, paidWeeks: 0, late: 0 };
    if (source === 'private') this.loanHistory.privateTaken += 1;
    this.cash += sum;
    this.cafe.today.loanTaken = (this.cafe.today.loanTaken ?? 0) + sum;
    this.note('loan', tr`Кредит: ${LOAN_LABEL[source].toLowerCase()}`, undefined, formatMoney(sum));
    return true;
  }

  /** Погасить досрочно: остаток долга, проценты дальше не идут */
  repayLoan(): boolean {
    if (this.main) return this.main.repayLoan();
    const l = this.loan;
    if (!l || this.cash < l.left) return false;
    this.cash -= l.left;
    this.cafe.today.loanPaid = (this.cafe.today.loanPaid ?? 0) + l.left;
    this.note('loan', L('Кредит погашен досрочно'), undefined, formatMoney(l.left));
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

  /** Идут первые дни после открытия: ленточка на вывеске, прохожие замечают новое место охотнее */
  get grandOpening(): boolean {
    return this.cafe.opened && this.day - this.openedDay < MARKETING.openingDays;
  }

  /** День открытия — от него считаем, когда начинаются события */
  private get openedDay(): number {
    return this.rival ? this.rival.opensDay - RIVAL.delayDays : this.day;
  }

  private rollEvent(): void {
    if (this.host || !this.cafe.opened || this.pendingEvent || this.day < this.openedDay + EVENTS.fromDay) return;
    if (!this.eventRng.chance(EVENTS.chance)) return;
    const options = this.eligibleEvents().filter((e) => (this.lastEvent[e.id] ?? -99) <= this.day - (EVENTS.cooldown[e.id] ?? EVENTS.cooldownDays));
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
    // В новогодний сезон вместо летнего праздника — ярмарка у ёлки, по субботам и воскресеньям
    if (this.holiday) {
      if (wd >= 5) out.push({ id: 'fair', day });
    } else if (wd === 5) out.push({ id: 'festival', day });
    const perishable = (['milk', 'bakery', 'kitchen'] as IngredientId[]).filter((id) =>
      cafe.menu.some((m) => Object.keys(recipeOf(m.id)).includes(id)),
    );
    if (perishable.length) out.push({ id: 'supplier', day, ingredientId: perishable[day % perishable.length] });
    const lunch = cafe.menu.find((m) => m.id === 'lunch') ?? cafe.menu.find((m) => m.kind === 'lunch');
    // Пока действует договор, разовых заказов «Север» не делает
    if (lunch && wd <= 3 && !this.contract) {
      const pay = Math.round((lunch.price * EVENTS.order.qty * (1 - EVENTS.order.discount)) / 10) * 10;
      const ingredientCost = Math.round(recipeCost(lunch.id) * EVENTS.order.qty);
      out.push({ id: 'office-order', day, itemId: lunch.id, itemName: lunch.name, pay, ingredientCost });
    }
    // Договор: после удачного разового заказа, если договора нет и офис не в обиде
    const ct = EVENTS.contract;
    if (lunch && wd <= 3 && !this.contract && this.officeOrders >= ct.afterOrders && this.day >= this.contractBan) {
      const pay = Math.round((lunch.price * ct.qty * (1 - ct.discount)) / 10) * 10;
      out.push({ id: 'contract', day, itemId: lunch.id, itemName: lunch.name, qty: ct.qty, pay, ingredientCost: Math.round(recipeCost(lunch.id) * ct.qty) });
    }
    // Корпоратив в будни сезона: праздничное из меню, а если его нет — кофе или выпечка
    if (this.holiday && wd <= 3) {
      const item =
        cafe.menu.find((m) => CATALOG.find((c) => c.id === m.id)?.seasonal) ??
        cafe.menu.find((m) => m.kind === 'snack') ??
        cafe.menu.find((m) => m.kind === 'coffee');
      if (item) {
        const qty = EVENTS.corporate.qty;
        const pay = Math.round((item.price * qty * (1 + EVENTS.corporate.premium)) / 10) * 10;
        out.push({ id: 'corporate', day, itemId: item.id, itemName: item.name, pay, qty, ingredientCost: Math.round(recipeCost(item.id) * qty) });
      }
    }
    if (this.awareCount < this.residents.length * 0.9) out.push({ id: 'blogger', day });
    // Жалоба: самый недовольный вчерашний гость приходит сказать об этом
    const complaint = this.complaintToday();
    if (complaint) out.push(complaint);
    // Холодильник: в меню есть то, что хранится в холоде
    const chilled = cafe.menu.some((m) => Object.keys(recipeOf(m.id)).some((id) => CHILLED.includes(id as IngredientId)));
    if (chilled) out.push({ id: 'fridge', day });
    // Проверка: когда точка уже освоилась и проверку ещё не ждут
    const settled = (n: number) => day >= this.openedDay + n;
    if (settled(EVENTS.inspection.fromDay) && !this.effects.some((x) => x.type === 'inspection')) out.push({ id: 'inspection', day });
    // Ферма: молоко, а без молочного в меню — продукты для кухни
    const uses = (id: IngredientId) => cafe.menu.some((m) => (recipeOf(m.id)[id] ?? 0) > 0);
    const farmIng = uses('milk') ? 'milk' : uses('kitchen') ? 'kitchen' : null;
    if (farmIng && !this.farm && settled(EVENTS.farm.fromDay)) out.push({ id: 'farm', day, ingredientId: farmIng });
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
      case 'fair:stall':
        this.spend(e.id === 'fair' ? EVENTS.fair.cost : EVENTS.festival.cost);
        this.effects.push({ type: 'boost', day: e.day, factor: e.id === 'fair' ? EVENTS.fair.boost : EVENTS.festival.boost });
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
        t.orderCost = (t.orderCost ?? 0) + e.ingredientCost!;
        this.effects.push({ type: 'order', day: e.day + 1, minute: EVENTS.order.minute, itemId: e.itemId!, qty: EVENTS.order.qty, pay: e.pay! });
        break;
      case 'corporate:accept':
        this.cash -= e.ingredientCost!;
        t.purchases += e.ingredientCost!;
        t.orderCost = (t.orderCost ?? 0) + e.ingredientCost!;
        this.effects.push({ type: 'order', day: e.day + 1, minute: EVENTS.corporate.minute, itemId: e.itemId!, qty: e.qty!, pay: e.pay!, corporate: true });
        break;
      case 'contract:sign':
      case 'contract-renew:renew':
        this.contract = {
          itemId: e.itemId!,
          qty: e.qty!,
          pay: e.pay!,
          ingredientCost: e.ingredientCost!,
          from: e.day + 1,
          left: EVENTS.contract.weekdays,
          strikes: 0,
          done: 0,
          earned: 0,
        };
        break;
      case 'blogger:treat':
        this.spend(EVENTS.blogger.cost);
        this.effects.push({ type: 'blogger', day: e.day + 1, success: this.eventRng.chance(EVENTS.blogger.success) });
        break;
      case 'complaint:apologize': {
        const c = EVENTS.complaint;
        this.spend(c.cost);
        const r = this.residents[e.residentId!];
        if (r) r.loyalty = Math.max(r.loyalty, Math.min(0.4, r.loyalty + c.warm));
        this.effects.push({ type: 'word', day: e.day + c.goodAfter, residentId: e.residentId!, good: true });
        break;
      }
      case 'complaint:ignore': {
        const r = this.residents[e.residentId!];
        if (r) r.loyalty = Math.max(0, r.loyalty - EVENTS.complaint.chillBy);
        this.effects.push({ type: 'word', day: e.day + EVENTS.complaint.badAfter, residentId: e.residentId!, good: false });
        break;
      }
      case 'fridge:fix':
        this.spend(EVENTS.fridge.fixCost);
        break;
      case 'fridge:patch': {
        const f = EVENTS.fridge;
        this.spend(f.patchCost);
        if (this.eventRng.chance(f.relapse)) this.effects.push({ type: 'relapse', day: e.day + this.eventRng.int(f.relapseFrom, f.relapseTo) });
        break;
      }
      case 'inspection:prepare':
      case 'inspection:risk': {
        const i = EVENTS.inspection;
        const ready = optionId === 'prepare';
        if (ready) this.spend(i.prepCost);
        const day = e.day + this.eventRng.int(i.from, i.to);
        const minute = hm(10) + this.eventRng.int(0, 5 * 60);
        this.effects.push({ type: 'inspection', day, minute, ready, fail: !ready && this.eventRng.chance(i.fail) });
        break;
      }
      case 'farm:sign': {
        const f = EVENTS.farm;
        const id = e.ingredientId!;
        // Сбой — не чаще раза в неделю, день внутри недели случайный
        const bad: number[] = [];
        for (let w = 0; w * 7 < f.days; w++) if (this.eventRng.chance(f.bad)) bad.push(e.day + 1 + w * 7 + this.eventRng.int(0, 6));
        this.farm = { ingredientId: id, price: Math.round(ingredient(id).unitCost * (1 - f.discount) * 100) / 100, until: e.day + f.days, bad, saved: 0, lost: 0 };
        break;
      }
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
      // Договор: в назначенное время кафе закрыто — заказ сорван, продукты уже куплены
      if (e.contract && !cafe.isOpenAt(minute)) {
        this.contractStrike();
        continue;
      }
      // Обеды для заказа готовят партией — вдвое быстрее, чем по одному
      const prep = Math.ceil((e.qty * cafe.serviceMinutes * 0.5) / cafe.counters);
      cafe.prepUntil = Math.floor(minute) + prep;
      const t = cafe.today;
      const name = itemName(e.itemId, cafe.own);
      this.cash += e.pay;
      t.revenue += e.pay;
      t.sold[e.itemId] = (t.sold[e.itemId] ?? 0) + e.qty;
      cafe.countItem(e.itemId, e.pay, 0);
      if (e.contract && this.contract) {
        this.contract.done += 1;
        this.contract.earned += e.pay;
      } else if (!e.corporate) this.officeOrders += 1;
      (t.events ??= []).push(
        e.contract
          ? tr`🤝 Обеды для «Севера» по\u00a0договору: ${e.qty}\u00a0× ${name}, +${formatMoney(e.pay)}. Стойка была занята ${prep}\u00a0мин`
          : e.corporate
          ? tr`🎄 Корпоратив: ${e.qty}\u00a0× ${name}, +${formatMoney(e.pay)}. Стойка была занята ${prep}\u00a0мин`
          : tr`🏢 Заказ офиса: ${e.qty}\u00a0× ${name}, +${formatMoney(e.pay)}. Стойка была занята ${prep}\u00a0мин`,
      );
    }
  }

  /**
   * Договор утром: в будни — закупка продуктов и заказ к 11:00; срок вышел — итог и, если без срывов, предложение продлить.
   * Срыв проверяется в 11:00 (fulfilOrders): часы можно поменять до обеда.
   */
  private runContract(): void {
    const c = this.contract;
    if (!c || this.day < c.from) return;
    const t = this.cafe.today;
    if (c.left <= 0) {
      // Предложение продлить ждёт свободного утра: событие дня уже идёт — завтра
      if (c.strikes === 0 && this.pendingEvent) return;
      this.contract = null;
      (t.events ??= []).push(tr`🤝 Договор с\u00a0«Севером» закончился: ${c.done} заказов, +${formatMoney(c.earned)}`);
      if (c.strikes === 0) {
        const ct = EVENTS.contract;
        const qty = Math.min(ct.maxQty, c.qty + ct.grow);
        const item = this.cafe.menu.find((m) => m.id === c.itemId);
        if (item) {
          const pay = Math.round((c.pay / c.qty) * qty / 10) * 10;
          this.startEvent({ id: 'contract-renew', day: this.day, itemId: item.id, itemName: item.name, qty, pay, ingredientCost: Math.round(recipeCost(item.id) * qty) });
        }
      }
      return;
    }
    if (weekday(this.day) > 4) return;
    c.left -= 1;
    this.cash -= c.ingredientCost;
    t.purchases += c.ingredientCost;
    t.orderCost = (t.orderCost ?? 0) + c.ingredientCost;
    this.effects.push({ type: 'order', day: this.day, minute: EVENTS.contract.minute, itemId: c.itemId, qty: c.qty, pay: c.pay, contract: true });
  }

  /** Сорванный заказ по договору: второй срыв — офис расторгает договор и месяц не обращается */
  private contractStrike(): void {
    const c = this.contract;
    if (!c) return;
    c.strikes += 1;
    const t = this.cafe.today;
    const ct = EVENTS.contract;
    if (c.strikes >= ct.strikes) {
      this.contract = null;
      this.contractBan = this.day + ct.banDays;
      (t.events ??= []).push(tr`🤝 «Север» расторг договор: в\u00a011:00 кафе было закрыто уже ${c.strikes}\u00a0раза`);
    } else (t.events ??= []).push(tr`🤝 Заказ «Севера» сорван: в\u00a011:00 кафе закрыто, продукты пропали. Ещё срыв\u00a0— и\u00a0договор расторгнут`);
  }

  /** Жалоба: вчерашний гость этой точки, которому визит запомнился хуже всех (оценка ниже порога) */
  private complaintToday(): PendingEvent | null {
    const day = this.day;
    let worst: { r: Resident; m: Memory } | null = null;
    for (const r of this.residents) {
      if (!r.aware || r.commute) continue;
      const m = r.memory.find((x) => x.day === day - 1 && this.cafe.hasItem(x.itemId));
      if (!m || m.score >= EVENTS.complaint.below) continue;
      if (!worst || m.score < worst.m.score) worst = { r, m };
    }
    if (!worst) return null;
    const { r, m } = worst;
    const topic = m.notes.includes('long-wait')
      ? 'long-wait'
      : m.notes.includes('not-my-taste')
      ? 'not-my-taste'
      : m.notes.includes('pricey')
      ? 'pricey'
      : this.cafe.item(m.itemId).kind === 'coffee'
      ? 'cold'
      : 'long-wait';
    return { id: 'complaint', day, residentId: r.id, residentName: r.name, topic, itemId: m.itemId, itemName: itemName(m.itemId, this.cafe.own) };
  }

  /** Списание сверх обычной порчи (холодильник, испорченная партия) — в отчёт дня */
  private writeOff(w: WriteOff): void {
    const t = this.cafe.today;
    t.writtenOff += w.value;
    for (const [id, q] of Object.entries(w.items) as [IngredientId, number][]) t.writtenOffItems[id] = Math.round(((t.writtenOffItems[id] ?? 0) + q) * 10) / 10;
  }

  /** Утром: то, что решили несколько дней назад, — аукается */
  private resolveLater(): void {
    const t = this.cafe.today;
    for (const e of [...this.effects]) {
      if ((e.type !== 'word' && e.type !== 'relapse') || e.day > this.day) continue;
      this.effects.splice(this.effects.indexOf(e), 1);
      if (e.type === 'relapse') {
        const w = this.cafe.stock.spoil(CHILLED);
        this.writeOff(w);
        this.spend(EVENTS.fridge.fixCost);
        (t.events ??= []).push(
          w.value > 0
            ? tr`🧊 Подлатанный холодильник встал ночью: продуктов испортилось на\u00a0${formatMoney(w.value)}, компрессор всё равно пришлось менять за\u00a0${formatMoney(EVENTS.fridge.fixCost)}`
            : tr`🧊 Подлатанный холодильник встал ночью. Повезло, что он был пуст, но\u00a0компрессор всё равно пришлось менять за\u00a0${formatMoney(EVENTS.fridge.fixCost)}`,
        );
        continue;
      }
      const r = this.residents[e.residentId];
      if (!r) continue;
      (t.events ??= []).push(this.spreadWord(r, e.good));
    }
  }

  /** Гость рассказывает соседям по дому (а потом и остальным), как с ним обошлись */
  private spreadWord(r: Resident, good: boolean): string {
    const c = EVENTS.complaint;
    const first = r.name.split(' ')[0];
    const f = isFemale(r.name);
    // Сначала соседи по дому, потом остальные — по порядку
    const others = this.residents.filter((x) => x.id !== r.id && !x.commute);
    const near = [...others.filter((x) => x.homeId === r.homeId), ...others.filter((x) => x.homeId !== r.homeId)];
    if (good) {
      let n = 0;
      for (const x of near) {
        if (n >= c.tell) break;
        if (x.aware) continue;
        this.learn(x, 'word');
        n += 1;
      }
      return n > 0
        ? tr`💬 ${first} ${f ? L('рассказала') : L('рассказал')} соседям, как вы извинились за\u00a0вчерашнее: о\u00a0вас узнали ещё ${n}\u00a0чел.`
        : tr`💬 ${first} ${f ? L('рассказала') : L('рассказал')} соседям, как вы извинились за\u00a0вчерашнее`;
    }
    let n = 0;
    for (const x of near) {
      if (n >= c.chill) break;
      if (!x.aware || x.loyalty <= 0) continue;
      x.loyalty = Math.max(0, x.loyalty - c.chillBy);
      n += 1;
    }
    return n > 0
      ? tr`💬 ${first} ${f ? L('написала') : L('написал')} в\u00a0чат дома, как ${f ? L('её') : L('его')} не\u00a0выслушали. ${n}\u00a0чел. из\u00a0ваших гостей стали относиться к\u00a0вам холоднее`
      : tr`💬 ${first} ${f ? L('написала') : L('написал')} в\u00a0чат дома, как ${f ? L('её') : L('его')} не\u00a0выслушали. Обошлось: ваших гостей там почти нет`;
  }

  /** Санитарная проверка: стойка стоит, пока идёт проверка; без подготовки — могут найти нарушения */
  private inspect(minute: number): void {
    for (const e of [...this.effects]) {
      if (e.type !== 'inspection' || e.day > this.day || (e.day === this.day && minute < e.minute)) continue;
      this.effects.splice(this.effects.indexOf(e), 1);
      // Закрыто — проверяющие придут завтра в то же время
      if (!this.cafe.isOpenAt(minute)) {
        this.effects.push({ ...e, day: this.day + 1 });
        continue;
      }
      const i = EVENTS.inspection;
      const mins = e.ready ? i.readyMinutes : e.fail ? i.failMinutes : i.passMinutes;
      this.cafe.prepUntil = Math.max(this.cafe.prepUntil, Math.floor(minute) + mins);
      if (e.fail) this.spend(i.fine);
      (this.cafe.today.events ??= []).push(
        e.ready
          ? tr`🧾 Пришла санитарная проверка. Всё было готово: ${mins}\u00a0минут, нарушений нет`
          : e.fail
          ? tr`🧾 Пришла санитарная проверка и\u00a0нашла нарушения: штраф ${formatMoney(i.fine)}, ${mins / 60}\u00a0часа стойка не\u00a0обслуживала гостей`
          : tr`🧾 Пришла санитарная проверка. Без подготовки, но\u00a0обошлось: нарушений не\u00a0нашли, час стойка стояла`,
      );
    }
  }

  /** Поставка по договору с фермой: экономия, испорченная партия, конец договора */
  private farmDelivery(farm: FarmDeal, qty: number): void {
    const id = farm.ingredientId;
    delete this.cafe.stock.unitPrice[id];
    const t = this.cafe.today;
    const name = ingredient(id).name;
    if (qty > 0) {
      farm.saved += Math.max(0, orderPrice(id, qty) - Math.round(farm.price * qty));
      if (farm.bad.includes(this.day)) {
        const w = this.cafe.stock.spoilLatest(id);
        this.writeOff(w);
        farm.lost += w.value;
        (t.events ??= []).push(tr`🚜 Ферма привезла испорченную партию: ${name.toLowerCase()}, ${Math.round(qty)}\u00a0порц. в\u00a0списание. Сегодня только то, что осталось со\u00a0вчера`);
      }
    }
    if (this.day >= farm.until) {
      this.farm = null;
      (t.events ??= []).push(tr`🚜 Договор с\u00a0фермой закончился: сэкономили ${formatMoney(farm.saved)}, на\u00a0испорченных партиях потеряли ${formatMoney(farm.lost)}`);
    }
  }

  /** Утром выходит (или не выходит) обзор блогера */
  private resolveBlogger(): void {
    for (const e of [...this.effects]) {
      if (e.type !== 'blogger' || e.day > this.day) continue;
      this.effects.splice(this.effects.indexOf(e), 1);
      const t = this.cafe.today;
      if (!e.success) {
        (t.events ??= []).push(L('📱 Обзор блогера так и\u00a0не\u00a0вышел'));
        continue;
      }
      const fans = this.residents.filter((r) => !r.aware && (r.kind === 'youth' || r.kind === 'student' || r.kind === 'visitor'));
      let n = 0;
      for (const r of fans) {
        if (n >= EVENTS.blogger.reach) break;
        this.learn(r, 'social');
        n += 1;
      }
      (t.events ??= []).push(tr`📱 Вышел обзор блогера: о\u00a0вас узнали ${n}\u00a0человек`);
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
    this.note(`upgrade:${id}`, u.name, undefined, tr`куплено за ${formatMoney(u.cost)}`);
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
    this.note(`equipment:${id}`, e.name, undefined, tr`куплено за ${formatMoney(e.cost)}`);
    return true;
  }

  /** Сколько гостей сейчас сидит в зале */
  seated(): number {
    return this.residents.filter((r) => r.visit?.stage === 'dining' && r.visit.want.mode === 'replace' && r.placeId === this.shopId).length;
  }

  /** Зал есть только у кафе; киоск — навынос */
  get hasHall(): boolean {
    return this.cafe.opened && this.cafe.premises.seats;
  }

  /** Поставить вещь на место; если там что-то стоит — оно продаётся */
  placeFurniture(slot: string, id: FurnitureId): boolean {
    if (!this.hasHall || !canPlace(slot, id)) return false;
    // Новогодний декор продаётся только в сезон
    if (SEASON_SLOTS.includes(slot) && !this.holiday) return false;
    const before = this.cafe.interior.style;
    const old = this.cafe.interior.layout[slot];
    if (old === id) return false;
    const cost = furniture(id).cost - (old ? Interior.refund(old) : 0);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.cafe.interior.layout[slot] = id;
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + cost;
    this.note(`hall:${slot}`, L('Зал'), old ? furniture(old).name : undefined, furniture(id).name);
    const after = this.cafe.interior.style;
    if (after !== before) this.note('hall-style', L('Стиль зала'), before ? hallStyle(before).name : L('без стиля'), after ? hallStyle(after).name : L('без стиля'));
    return true;
  }

  /** Продать вещь: возвращается половина цены */
  sellFurniture(slot: string): boolean {
    if (!this.hasHall) return false;
    const old = this.cafe.interior.layout[slot];
    if (!old || FINISH_SLOTS.includes(slot)) return false;
    const refund = Interior.refund(old);
    this.cash += refund;
    delete this.cafe.interior.layout[slot];
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) - refund;
    this.note(`hall:${slot}`, L('Зал'), furniture(old).name, L('продано'));
    return true;
  }

  /** Готовая комплектация: новое покупается, лишнее продаётся */
  applyPreset(id: PresetId): boolean {
    if (!this.hasHall || this.cafe.interior.matches(id)) return false;
    const cost = this.cafe.interior.presetCost(id);
    if (this.cash < cost) return false;
    this.cash -= cost;
    this.cafe.interior.applyPreset(id);
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + cost;
    this.note('hall', L('Зал'), undefined, tr`комплектация «${preset(id).name}»`);
    return true;
  }

  /** Собрать стиль целиком: стены, пол и обе фирменные вещи */
  applyStyle(id: StyleId): boolean {
    const hall = this.cafe.interior;
    if (!this.hasHall || hall.styleCount(id) === STYLE_SLOTS.length) return false;
    const cost = hall.styleCost(id);
    if (this.cash < cost) return false;
    const before = hall.style;
    this.cash -= cost;
    Object.assign(hall.layout, styleSet(id));
    this.cafe.today.invested = (this.cafe.today.invested ?? 0) + cost;
    this.note('hall-style', L('Стиль зала'), before ? hallStyle(before).name : L('без стиля'), hallStyle(id).name);
    return true;
  }

  /** Сколько жителей и гостей улицы — аудитория стиля */
  styleAudience(id: StyleId): number {
    const s = hallStyle(id);
    return s.audience === 'all' ? this.residents.length : this.residents.filter((r) => (s.audience as string[]).includes(r.kind)).length;
  }

  /** Погода на день: вид и температура — из генератора погоды, ветер — из seed и дня */
  private rollForecast(day: number): Weather {
    const w = rollWeather(this.skyRng, this.weather, this.holiday);
    return { ...w, wind: windFor(this.seed, day, w.kind) };
  }

  /** Будни или выходные: каждому жителю — расписание на сегодня */
  private applyDaySchedules(): void {
    this.cafe.day = this.day;
    this.cafe.weekday = weekday(this.day);
    const weekend = isWeekend(this.day);
    for (const r of this.residents) r.schedule = weekend ? r.weekend : r.weekday;
    if (this.cafe.weekday === FRIENDS.weekday) this.fridayPlans();
  }

  /** Пятница: у компании друзей общий вечер — собираются в одно время, потом расходятся по домам */
  private fridayPlans(): void {
    this.groups
      .filter((g) => g.friends)
      .forEach((g, i) => {
        const meet = meetAt(i);
        for (const id of g.members) {
          const r = this.residents[id];
          // Ночь с четверга (до утра) остаётся, свой вечер — нет
          const day = r.weekday.filter((e) => e.start < meet - 30 && (e.activity !== 'night' || e.start < hm(6)));
          r.schedule = [
            ...day,
            { start: meet, placeId: 'park', activity: 'night' },
            { start: meet + FRIENDS.stay, placeId: r.homeId, activity: 'home' },
          ];
        }
      });
  }

  /** Компания друзей, которая сейчас собирается (пятница, вечер встречи) */
  private friendsMeeting(r: Resident, entry: ScheduleEntry): Group | null {
    const g = this.groupOf.get(r.id);
    if (!g?.friends || this.cafe.weekday !== FRIENDS.weekday || entry.activity !== 'night') return null;
    return entry.start >= FRIENDS.meet ? g : null;
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
    const from = r.walking ? null : this.at(r.placeId);
    r.placeId = placeId;
    r.path = this.route(r, this.at(placeId), from);
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
    // Проходя мимо открытой точки игрока, можно её заметить — вывеска помогает
    for (const point of this.host ? [] : [this, ...this.guests]) if (!r.aware && !r.noticed) point.notice(r);
    if (r.path.length === 0) {
      r.walking = false;
      r.visible = !this.at(r.placeId).indoor;
      this.onArrive(r);
    }
  }

  /** Пекарня: вечерняя уценка своей выпечки (null — не уценивать, продавать по полной до закрытия) */
  setMarkdown(md: Markdown | null): void {
    const before = this.cafe.markdown;
    this.cafe.markdown = md ? { from: md.from, off: Math.min(0.7, Math.max(0.1, md.off)) } : null;
    const text = (m: Markdown | null) => (m ? tr`с\u00a0${formatClock(m.from)} −${Math.round(m.off * 100)}\u00a0%` : L('без уценки'));
    this.note('markdown', L('Уценка выпечки вечером'), text(before), text(this.cafe.markdown));
  }

  /** Житель проходит мимо: может заметить точку */
  private notice(r: Resident): void {
    if (!this.cafe.opened) return;
    const front = this.at(this.shopId).front;
    if (Math.abs(r.pos.x - front.x) < 45 && Math.abs(r.pos.y - front.y) < 60) {
      r.noticed = true;
      // Любопытный замечает новое место чаще, торопливый — реже
      const look = 1 + 0.8 * (r.character.curiosity - 0.5) - 0.3 * (r.character.hurry - 0.5);
      // Доска с подсветкой у киоска: замечают чаще, особенно вечером
      const board = this.cafe.has('board') ? (this.minute >= hm(17) ? UPGRADE_EFFECT.boardNoticeEvening : UPGRADE_EFFECT.boardNotice) : 1;
      const base = this.marketing.sign ? MARKETING.noticeWithSign : MARKETING.noticeBase;
      // Зал своего стиля виден в окне — своя аудитория замечает его чаще
      const style = this.hasHall ? 1 + INTERIOR.styleNotice * this.cafe.interior.styleFit(r.kind) : 1;
      const p = (this.grandOpening ? Math.max(base, MARKETING.noticeOpening) : base) * look * board * style;
      if (this.rng.chance(Math.min(1, p))) this.learn(r, 'walk');
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
    if (from?.id === 'bigpark' && s.door) {
      // Из большого сквера — по кольцу к выбранному входу
      path.push(...loopPath(nearestLoop(r.pos), nearestLoop(s.door)));
    } else if (s.door && from && entrancesOf(from).length > 1) {
      if (outdoor) path.push({ ...s.door });
      else r.pos = { ...s.door };
    }
    // Дверь во дворе: сначала по проходу к тротуару
    if (from && s.via) for (const p of [...s.via].reverse()) path.push({ ...p });
    for (const p of walkPath(s.front, t.front)) path.push(withLane(p, r.lane));
    if (t.via) for (const p of t.via) path.push({ ...p });
    if (to.id === 'bigpark') {
      // В большом сквере — от входа по кольцу к месту, где погулять
      const gate = nearestLoop(t.door);
      path.push({ ...t.door }, ...this.loopSpot(loopPath(gate, this.parkRng.int(0, PARK_LOOP.length - 1))));
      return path;
    }
    path.push(this.spotIn(to, t));
    return path;
  }

  /** Куда именно встать в месте назначения */
  private spotIn(p: Place, entrance: Entrance = entrancesOf(p)[0]): Point {
    if (p.id === 'bigpark') {
      const q = PARK_LOOP[this.parkRng.int(0, PARK_LOOP.length - 1)];
      return { x: q.x + this.parkRng.jitter(8), y: q.y + this.parkRng.jitter(8) };
    }
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
    const p = this.at(placeId);
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
  return h ? `${clockText(h.from)}–${clockText(h.to)}, −${Math.round(h.discount * 100)}\u00a0%` : L('выкл.');
}

function itemName(id: string, own: MenuItem[] = []): string {
  return CATALOG.find((c) => c.id === id)?.name ?? own.find((m) => m.id === id)?.name ?? id;
}
