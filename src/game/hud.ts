import { AXES, AXIS_LABEL, NOTE_LABEL, profileOf, tasteWords, traitWords, type TasteAxis } from '../sim/character';
import {
  CAFE_NAME_MAX,
  CATALOG,
  KIND_TITLE,
  MAX_MENU,
  REJECT_LABEL,
  type Barista,
  type Change,
  type DayHours,
  type DayReport,
  type ItemKind,
  type MenuItem,
  type RejectReason,
  DISH_NAME_MAX,
  windowOn,
} from '../sim/cafe';
import {
  dayNumber,
  formatClock,
  hm,
  isWeekend,
  MINUTES_PER_DAY,
  minuteOfDay,
  WEEKDAY_FULL,
  WEEKDAY_SHORT,
  weekday,
} from '../sim/clock';
import { analyzeDay, describeLost } from '../sim/analysis';
import { AWARE_LABEL, MARKETING, type AwareSource } from '../sim/marketing';
import { ingredient, INGREDIENTS, orderPrice, recipeCost, recipeOf, type IngredientId } from '../sim/stock';
import { cashDiagnosis, LOAN, LOAN_LABEL, LOAN_TERMS, paymentLeft, totalInterest, weeklyPayment, type LoanSource } from '../sim/loans';
import { menuAddWarning, orderWarning, priceWarning, staffWarnings } from '../sim/warnings';
import { COST_LINES, compareLine, funnel, insights, periodByIndex, periodOf, summarize, type Period, type PeriodKind } from '../sim/periods';
import { iconImg, namedIcon } from './icons';
import { compositionOf } from '../sim/composition';
import { placeInterior, portrait } from './portraits';
import { standTab } from './stand';
import { cookable, dailyUse, daysLeft, ingredientOrder, usedIn, USE_DAYS } from '../sim/stockView';
import { BASES, base as dishBase, addIn as dishAddIn, defaultDishName, dishId, dishPrep, MAX_ADDINS, MAX_OWN, type AddInId, type BaseId } from '../sim/dishes';
import { WEATHER_HINT, WEATHER_ICON, WEATHER_LABEL, type Weather } from '../sim/weather';
import { FOCUS, WANT_LABEL, type WantKind } from '../sim/demand';
import { ECONOMY, EQUIPMENT, equipmentFor, formatMoney, PREMISES, type EquipmentId, type PremisesId } from '../sim/economy';
import { ACTIVITY_LABEL, currentEntry, isFemale as femaleName, KIND_LABEL, type Resident, type ResidentKind } from '../sim/residents';
import { statusText, type Regular } from '../sim/regulars';
import { milestone, MILESTONES, UPGRADES, type UpgradeId } from '../sim/milestones';
import type { Simulation } from '../sim/simulation';
import { place, type Place } from '../sim/world';
import { clearSave, exportSave, importSave } from './save';
import { openFeedback } from './feedback';
import { showTutorial } from './tutorial';
import { showEventCard } from './eventCard';
import { hallTab } from './hall';
import type { FurnitureId, PresetId } from '../sim/interior';
import { goal } from './metrika';
import { sound } from './sound';
import { CHALLENGE, challengeUrl, resultIfFinished, savedResult, saveKeyFor, showChallengeResult } from './challenge';
import { card } from '../sim/events';
import cardKiosk from './art/cards/card-kiosk.webp';
import cardCafe from './art/cards/card-cafe.webp';

const PREMISES_PIC: Record<PremisesId, string> = { kiosk: cardKiosk, cafe: cardCafe };

// Интерфейс — обычный DOM поверх канваса: чёткий текст на любом экране
// и привычная вёрстка для правок дизайнера. Все кнопки — через data-action.

const NB = ' ';
export const SPEEDS = [0, 1, 2, 4] as const;

type View = 'cafe' | 'resident' | 'report' | 'place';
type CafeTab = 'overview' | 'menu' | 'stock' | 'staff' | 'guests' | 'hall' | 'stand' | 'growth';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

/** Подсказка под картой: что сейчас происходит на улице в это время суток */
function streetNote(minute: number, weekend: boolean): string {
  const h = minute / 60;
  const [title, text] =
    h < 6
      ? ['Ночь', `Почти все спят. Ночью работать дорого: +20${NB}% к${NB}зарплате.`]
      : h < 7
        ? ['Город просыпается', `Первые жители идут к${NB}метро.`]
        : weekend && h < 15
          ? ['Выходной', `Офисы закрыты, у${NB}метро тише. Жители гуляют и${NB}не${NB}спешат.`]
          : h < 10
            ? ['Утренний поток', `Офисные и${NB}студенты спешат: очередь их отпугивает.`]
            : h < 12
              ? ['Затишье', `На${NB}улице пенсионеры и${NB}фрилансеры, им не${NB}к${NB}спеху.`]
              : h < 15
                ? ['Обед', `Офисы выходят поесть: нужна еда, а${NB}не${NB}только кофе.`]
                : h < 18
                  ? ['После обеда', `Студенты возвращаются, молодёжь гуляет в${NB}сквере.`]
                  : h < 21
                    ? ['Вечер', `Все идут домой, молодёжь${NB}— гулять и${NB}в${NB}бар.`]
                    : ['Поздний вечер', `Улица пустеет: остаются ночные смены и${NB}молодёжь.`];
  return `<b>${title}</b> <span>${text}</span>`;
}

/** 1 гость, 2 гостя, 5 гостей */
const plural = (n: number, one: string, few: string, many: string): string => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/** Маленькие числа словом — «два гостя», остальные цифрами */
const numWord = (n: number): string => ({ 2: 'два', 3: 'три', 4: 'четыре' })[n] ?? String(n);

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m) % 60).padStart(2, '0')}`;

const money = formatMoney;

const weatherShort = (w: Weather): string => `${WEATHER_ICON[w.kind]}${NB}${w.temp > 0 ? '+' : ''}${w.temp}°${w.wind === 2 ? ` · 💨${NB}ветрено` : ''}`;

const WANT_VISIT: Record<WantKind, string> = {
  coffee: `за${NB}кофе`,
  lunch: 'пообедать',
  tea: `на${NB}чай`,
  snack: 'перекусить',
  bar: 'выпить',
};

const isFemale = (r: Resident): boolean => femaleName(r.name);
/** 1 186 → «1 186» с неразрывным пробелом */
const num = (n: number): string => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NB);
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Свои блюда игрока — для названий; обновляется при каждой отрисовке */
let OWN: MenuItem[] = [];
const itemName = (id: string): string => CATALOG.find((c) => c.id === id)?.name ?? OWN.find((m) => m.id === id)?.name ?? id;
/** «не зашли, потому что …» — для выводов отчёта за период */
const REASON_BECAUSE: Partial<Record<RejectReason, string>> = {
  closed: 'было закрыто',
  'no-item': `не${NB}было нужного в${NB}меню`,
  expensive: 'дорого',
  'off-route': `не${NB}по${NB}пути`,
  queue: 'очередь',
  'no-time': 'долго ждать заказа',
  'out-of-stock': 'закончились продукты',
  rival: 'выбрали конкурента',
  taste: `не${NB}по${NB}вкусу`,
  'no-staff': `некому было обслужить`,
};

/** «студентам», «молодёжи» — кому блюдо по вкусу */
const FANS_DATIVE: Record<ResidentKind, string> = {
  office: 'офисным',
  student: 'студентам',
  pensioner: 'пенсионерам',
  shopkeeper: 'продавцам',
  remote: 'фрилансерам',
  youth: 'молодёжи',
  nightworker: `ночной${NB}смене`,
  passenger: 'пассажирам',
  visitor: `гостям${NB}района`,
};
/** Вкус позиции словами: «сладкое, необычное» — по нему подбирают меню под гостей */
const itemTaste = (id: string): string => {
  const p = profileOf(id);
  return AXES.filter((a) => p[a] >= 0.55).map((a) => AXIS_LABEL[a]).join(', ');
};

const REASON_HINT: Record<RejectReason, string> = {
  'not-open': 'Хотели зайти, но кафе ещё не работает',
  closed: `Хотели зайти, когда было закрыто — подумай о${NB}часах работы`,
  expensive: 'Цена выше, чем готовы платить',
  'off-route': `Кафе не${NB}по${NB}пути — делать крюк не${NB}захотели`,
  'no-item': `Не${NB}нашли нужного в${NB}меню`,
  queue: `Не${NB}стали стоять в${NB}очереди — нужен бариста`,
  'no-time': `Не${NB}дождались заказа и${NB}ушли`,
  unaware: `Хотели зайти куда-нибудь, но о${NB}твоём кафе не${NB}знают. Помогут вывеска, листовки и${NB}соцсети — вкладка «Гости»`,
  'out-of-stock': `Позиция закончилась на${NB}складе. Гость ушёл недовольным — закажи больше или подними автозаказ`,
  mood: `Цена и${NB}дорога устраивали, но${NB}не${NB}каждый день хочется в${NB}кафе. Постоянные гости заходят чаще`,
  rival: `Готовы были зайти, но${NB}выбрали конкурента: у${NB}него дешевле, ближе по${NB}пути или нужная позиция`,
  taste: `Цена и${NB}дорога устраивали, но${NB}в${NB}меню не${NB}нашлось ничего на${NB}их вкус. Посмотри, что любят твои гости, в${NB}их карточках`,
  'no-staff': `Точка открыта, но${NB}за${NB}стойкой никого: ты отстоял свои ${ECONOMY.ownerHours}${NB}ч, а${NB}бариста не${NB}было. Найми бариста на${NB}эти часы или сократи часы работы`,
};

const USUAL: Record<WantKind, string> = {
  coffee: 'кофе',
  lunch: 'обед',
  tea: 'чай',
  snack: 'перекус',
  bar: `пиво или${NB}сидр`,
};

const OPEN_OPTIONS = Array.from({ length: 25 }, (_, i) => hm(6) + i * 30); // 06:00…18:00 — бар может открываться вечером
// 14:00…04:00 следующего дня: после 24:00 — работа через полночь
const CLOSE_OPTIONS = Array.from({ length: 15 }, (_, i) => hm(14) + i * 60);
const ALL_DAY = 'all-day';
/** Откуда узнали о точке — иконка */
const AWARE_ICON: Record<AwareSource, string> = {
  start: 'aware-start',
  walk: 'aware-walk',
  flyers: 'mk-flyers',
  social: 'mk-social',
  word: 'mk-word',
};
/** «Состав: вода, молотый кофе из зёрен, …» — пока только описание */
const compositionLine = (id: string): string => {
  const list = compositionOf(id);
  return list.length ? `<small class="comp">Состав: ${list.join(', ')}</small>` : '';
};
/** Предупреждение до решения: «⚠ …» отдельной строкой под пунктом */
const warnLine = (text: string | null): string => (text ? `<small class="warn">⚠ ${text}</small>` : '');
/** «упирается в …» */
const INGREDIENT_ACC: Record<IngredientId, string> = {
  beans: 'зерно',
  milk: 'молоко',
  bakery: 'выпечку',
  kitchen: 'продукты для кухни',
  drinks: 'чай и лимонад',
  bar: 'пиво и сидр',
  syrup: 'сиропы',
  chocolate: 'шоколад',
  honey: 'мёд',
  spices: 'специи',
  berries: 'ягоды',
  cheese: 'сыр',
  ham: 'ветчину',
};
const BASE_INGREDIENTS: IngredientId[] = ['beans', 'milk', 'bakery', 'kitchen', 'drinks', 'bar'];
const ingredientIcon = (id: IngredientId): string => (BASE_INGREDIENTS.includes(id) ? `ing-${id}` : `add-${id}`);
/** 1,5 дня → «1,5 дня»; 4 → «4 дня»; 12 → «12 дней» */
const daysText = (d: number): string => {
  const v = d >= 10 ? Math.round(d) : Math.floor(d * 2) / 2;
  const whole = Number.isInteger(v);
  const word = !whole ? 'дня' : v % 10 === 1 && v % 100 !== 11 ? 'день' : [2, 3, 4].includes(v % 10) && ![12, 13, 14].includes(v % 100) ? 'дня' : 'дней';
  return `${String(v).replace('.', ',')}${NB}${word}`;
};
const DAY_OFF = 'day-off';

export class Hud {
  speed = 1;
  private view: View = 'cafe';
  private selected: Resident | null = null;
  private selectedPlace: Place | null = null;
  private wasNegative = false;
  private lastRender = 0;
  private lastHtml = '';
  private lastView = '';
  private live: Record<string, string> = {};
  private liveWidth: Record<string, string> = {};
  private liveClass: Record<string, string> = {};
  private readonly clock = $('#clock');
  private readonly cash = $('#cash');
  private readonly panel = $('#panel');
  private readonly note = $('#street-note');
  private catalogOpen = false;
  /** Отчёт: за какой период и какой именно (null — последний) */
  private reportPeriod: 'day' | PeriodKind = 'day';
  /** Раскрыты часы по дням недели */
  private hoursByDay = false;
  /** Выбранная вещь на стойке киоска */
  private standPick: UpgradeId | null = null;
  /** Почасовые бариста, у которых раскрыты часы по дням */
  private staffByDay = new Set<number>();
  private reportAt: number | null = null;
  /** Сколько хочет взять в кредит — по источнику */
  private loanAmount: Partial<Record<LoanSource, number>> = {};
  /** Конструктор своего блюда: null — закрыт */
  private dish: { base: BaseId | null; addIns: AddInId[]; name: string | null; price: number | null } | null = null;
  /** Игрок вводит название заведения; на это время игра на паузе */
  private renaming: { resume: number } | null = null;
  /** Развернуть нижний лист на телефоне — подставляет main */
  onExpand: () => void = () => {};
  private confirmRestart = false;
  /** Открыт блок «Перенести игру»; transferError — что не так с загруженным файлом */
  private transfer = false;
  private transferError = '';
  private tab: CafeTab = 'overview';
  /** Выбранное место в зале (свой дизайн) */
  private hallSlot: string | null = null;
  /** Какое событие уже показали карточкой — второй раз сама не всплывает */
  private eventShown = '';

  constructor(
    private readonly sim: Simulation,
    private readonly onDeselect: () => void,
    private readonly selectInScene: (r: Resident) => void = () => {},
    private readonly challenge = false,
  ) {
    const speeds = $('#speeds');
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.textContent = s === 0 ? '❚❚' : `×${s}`;
      b.title = s === 0 ? 'Пауза' : `Скорость ×${s}`;
      b.dataset.speed = String(s);
      b.addEventListener('click', () => this.setSpeed(s));
      speeds.append(b);
    }
    // Промотать до 6:00 утра: ночь и пустые часы не нужно ждать
    const skip = document.createElement('button');
    skip.textContent = '⏭';
    skip.title = 'Промотать до 6:00 утра';
    skip.setAttribute('aria-label', 'Промотать до утра');
    skip.className = 'skip';
    skip.addEventListener('click', () => {
      if (this.sim.bankrupt) return;
      this.sim.skipToMorning();
      this.render(true);
    });
    speeds.append(skip);
    window.addEventListener('keydown', (ev) => {
      if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        this.setSpeed(this.speed === 0 ? 1 : 0);
      }
      const n = Number(ev.key);
      if (n >= 1 && n <= 3) this.setSpeed(SPEEDS[n]);
    });
    this.panel.addEventListener('click', (ev) => this.onClick(ev));
    this.panel.addEventListener('change', (ev) => this.onChange(ev));
    // Ушли со списка, ничего не выбрав, — догоняем отложенную пересборку
    this.panel.addEventListener('focusout', () => setTimeout(() => this.render(), 0));
    this.panel.addEventListener('keydown', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.dataset.action !== 'rename-input') return;
      if (ev.key === 'Enter') this.finishRename(true);
      if (ev.key === 'Escape') this.finishRename(false);
    });
    this.setSpeed(1);
    this.render(true);
  }

  setSpeed(s: number): void {
    this.speed = this.sim.bankrupt ? 0 : s;
    document.querySelectorAll<HTMLButtonElement>('#speeds button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === this.speed);
    });
  }

  select(r: Resident | null): void {
    this.selected = r;
    if (r) this.selectedPlace = null;
    this.view = r ? 'resident' : 'cafe';
    this.render(true);
  }

  /** Нажали на здание: название, кто там живёт или работает, кто сейчас внутри */
  selectPlace(p: Place | null): void {
    this.selectedPlace = p;
    if (p) this.selected = null;
    this.view = p ? 'place' : 'cafe';
    this.render(true);
  }

  onDayEnd(): void {
    this.checkChallenge();
    // Сколько дней прожило заведение — главный показатель удержания
    const opened = this.sim.reports.filter((r) => r.opened).length;
    if ([1, 3, 7, 14, 28].includes(opened)) goal(`day_${opened}`, { premises: this.sim.cafe.premisesId });
    for (const id of this.sim.reports.at(-1)?.milestones ?? []) goal('milestone', { id });
    sound.play('ui-day-end', 0.8);
    if (this.sim.reports.at(-1)?.milestones?.length) setTimeout(() => sound.play('ui-milestone'), 900);
    if (this.view !== 'resident') {
      this.view = 'report';
      this.reportPeriod = 'day';
      this.reportAt = null;
    }
    this.render(true);
  }

  /** Испытание закончилось — один раз показываем итог */
  private checkChallenge(): void {
    if (!this.challenge || savedResult()) return;
    const r = resultIfFinished(this.sim);
    if (r) showChallengeResult(r, this);
  }

  onBankrupt(): void {
    this.checkChallenge();
    goal('bankrupt', { day: this.sim.today, premises: this.sim.cafe.premisesId });
    sound.play('ui-bankrupt');
    this.setSpeed(0);
    this.render(true);
  }

  frame(): void {
    const now = performance.now();
    if (now - this.lastRender < 100) return;
    this.lastRender = now;
    const day = dayNumber(this.sim.time);
    const dayText = !this.challenge ? `День ${day}` : day <= CHALLENGE.days ? `День ${day} из${NB}${CHALLENGE.days}` : `День ${day} · итог записан`;
    const clock = `<b>${WEEKDAY_SHORT[weekday(day)]} · ${formatClock(this.sim.time)}</b><small>${dayText} · ${weatherShort(this.sim.weather)}</small>`;
    if (this.clock.innerHTML !== clock) this.clock.innerHTML = clock;
    this.cash.textContent = money(this.sim.cash);
    const note = streetNote(this.sim.minute, isWeekend(day));
    if (this.note.innerHTML !== note) this.note.innerHTML = note;
    this.cash.classList.toggle('neg', this.sim.cash < 0);
    const e = this.sim.pendingEvent;
    const key = e ? `${e.id}:${e.day}` : '';
    if (e && key !== this.eventShown && !document.querySelector('.overlay')) {
      this.eventShown = key;
      showEventCard(this.sim, this, () => this.render(true));
      sound.play('ui-event');
    }
    // Касса ушла в минус — тихое предупреждение
    const negative = this.sim.cash < 0;
    if (negative && !this.wasNegative) sound.play('ui-money-low');
    this.wasNegative = negative;
    this.render();
  }

  // ——— Действия ———

  private finishRename(save: boolean): void {
    if (!this.renaming) return;
    const input = this.panel.querySelector<HTMLInputElement>('input[data-action="rename-input"]');
    if (save && input) this.sim.cafe.rename(input.value);
    const resume = this.renaming.resume;
    this.renaming = null;
    this.setSpeed(resume || 1);
    this.render(true);
  }

  private onClick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;
    const { action, item } = btn.dataset;
    const sim = this.sim;
    switch (action) {
      case 'open-cafe':
        if (sim.openCafe((item as PremisesId) ?? 'cafe')) goal('open', { premises: item });
        this.tab = 'overview';
        this.panel.scrollTop = 0;
        break;
      case 'price-up':
      case 'price-down': {
        const it = sim.cafe.item(item!);
        sim.setPrice(it.id, it.price + (action === 'price-up' ? 1 : -1) * ECONOMY.priceStep);
        break;
      }
      case 'remove-item':
        sim.removeMenuItem(item!);
        break;
      case 'add-item':
        sim.addMenuItem(item!);
        if (sim.cafe.menu.length >= MAX_MENU) this.catalogOpen = false;
        break;
      case 'buy-equipment':
        sim.buyEquipment(item as EquipmentId);
        break;
      case 'toggle-catalog':
        this.catalogOpen = !this.catalogOpen;
        break;
      case 'loan-up':
      case 'loan-down': {
        const src = item as LoanSource;
        const o = sim.loanOffer(src);
        const now = this.loanAmount[src] ?? 30_000;
        this.loanAmount[src] = Math.min(o.max, Math.max(LOAN_TERMS[src].min, now + (action === 'loan-up' ? 1 : -1) * LOAN.step));
        break;
      }
      case 'loan-take':
        if (sim.takeLoan(item as LoanSource, this.loanAmount[item as LoanSource] ?? 30_000)) goal('loan', { source: item });
        break;
      case 'loan-repay':
        sim.repayLoan();
        break;
      case 'dish-open':
        this.dish = { base: null, addIns: [], name: null, price: null };
        break;
      case 'dish-close':
        this.dish = null;
        break;
      case 'dish-base':
        // Новая основа — новые добавки, название и цена по умолчанию
        if (this.dish) this.dish = { base: item as BaseId, addIns: [], name: null, price: null };
        break;
      case 'dish-addin':
        if (this.dish) {
          const a = item as AddInId;
          const on = this.dish.addIns.includes(a);
          if (on || this.dish.addIns.length < MAX_ADDINS) {
            // Своё название сохраняем, название по умолчанию пересчитается под новые добавки
            this.keepDishName();
            this.dish.addIns = on ? this.dish.addIns.filter((x) => x !== a) : [...this.dish.addIns, a];
            this.dish.price = null;
          }
        }
        break;
      case 'dish-price-up':
      case 'dish-price-down':
        if (this.dish?.base) {
          this.keepDishName();
          const now = this.dish.price ?? this.suggestedPrice(dishId(this.dish.base, this.dish.addIns));
          this.dish.price = Math.max(ECONOMY.priceStep, now + (action === 'dish-price-up' ? 1 : -1) * ECONOMY.priceStep);
        }
        break;
      case 'dish-create':
        if (this.dish?.base) {
          this.keepDishName();
          const id = dishId(this.dish.base, this.dish.addIns);
          const name = this.dish.name ?? defaultDishName(id);
          const price = this.dish.price ?? this.suggestedPrice(id);
          if (sim.createDish(this.dish.base, this.dish.addIns, name, price)) {
            goal('dish-create', { base: this.dish.base, addIns: this.dish.addIns.join('+') });
            this.dish = null;
          }
        }
        break;
      case 'dish-delete':
        sim.deleteDish(item!);
        break;
      case 'hall-slot':
        this.hallSlot = this.hallSlot === item ? null : item!;
        break;
      case 'hall-place': {
        const [slot, id] = item!.split(':');
        if (sim.placeFurniture(slot, id as FurnitureId)) sound.play('ui-upgrade');
        break;
      }
      case 'hall-sell':
        if (sim.sellFurniture(item!)) sound.play('ui-upgrade');
        break;
      case 'hall-preset':
        if (sim.applyPreset(item as PresetId)) sound.play('ui-upgrade');
        this.hallSlot = null;
        break;
      case 'tab':
        this.tab = item as CafeTab;
        this.panel.scrollTop = 0;
        break;
      case 'expand':
        this.onExpand();
        return;
      case 'rename':
        this.renaming = { resume: this.speed };
        this.setSpeed(0);
        this.render(true);
        this.panel.querySelector<HTMLInputElement>('input[data-action="rename-input"]')?.focus();
        return;
      case 'rename-save':
        this.finishRename(true);
        return;
      case 'rename-cancel':
        this.finishRename(false);
        return;
      case 'insight':
        // Кнопка под «Что происходит»: открыть нужный раздел управления
        this.tab = item as CafeTab;
        this.panel.scrollTop = 0;
        this.onExpand();
        break;
      case 'order':
        sim.orderIngredient(item as IngredientId, Number(btn.dataset.qty));
        break;
      case 'cancel-order':
        sim.cancelOrder(item as IngredientId);
        break;
      case 'keep-up':
      case 'keep-down': {
        const weekend = btn.dataset.weekend === 'true';
        const st = sim.cafe.stock;
        const cur = (weekend ? st.keepWeekend : st.keep)[item as IngredientId];
        const step = Number(btn.dataset.step) * (action === 'keep-up' ? 1 : -1);
        sim.setKeep(item as IngredientId, cur + step, weekend);
        break;
      }
      case 'sign':
        sim.buySign();
        break;
      case 'flyers':
        sim.setFlyers(!sim.marketing.flyers);
        break;
      case 'social':
        sim.launchSocial();
        break;
      case 'card':
        sim.setLoyaltyCard(!sim.marketing.loyaltyCard);
        break;
      case 'hire-shift':
        sim.hireBarista('shift');
        break;
      case 'hire-hourly':
        sim.hireBarista('hourly');
        break;
      case 'fire':
        sim.fireBarista(Number(item));
        break;
      case 'duty': {
        const st = sim.cafe.staff.find((b) => b.id === Number(item));
        if (st) sim.setOnDuty(st.id, !sim.cafe.isWorking(st));
        break;
      }
      case 'staff-by-day':
        this.staffByDay.add(Number(item));
        break;
      case 'staff-same': {
        const st = sim.cafe.staff.find((b) => b.id === Number(item));
        this.staffByDay.delete(Number(item));
        if (st) sim.setStaffSchedule(st.id, { days: st.schedule.days, from: st.schedule.from, to: st.schedule.to });
        break;
      }
      case 'staff-day': {
        const st = sim.cafe.staff.find((b) => b.id === Number(item));
        if (!st) break;
        const days = [...st.schedule.days];
        const d = Number(btn.dataset.day);
        days[d] = !days[d];
        sim.setStaffSchedule(st.id, { ...st.schedule, days });
        break;
      }
      case 'face':
        this.selectInScene(sim.residents[Number(item)]);
        return;
      case 'stand-pick':
        this.standPick = this.standPick === item ? null : (item as UpgradeId);
        // Показать строку улучшения под картинкой
        setTimeout(() => document.getElementById(`fit-${item}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
        break;
      case 'buy-upgrade':
        if (sim.buyUpgrade(item as UpgradeId)) {
          goal('upgrade', { id: item });
          sound.play('ui-upgrade');
        }
        break;
      case 'skip-morning':
        sim.skipToMorning();
        break;
      case 'report':
        this.view = 'report';
        this.reportPeriod = 'day';
        this.reportAt = null;
        break;
      case 'hours-by-day':
        this.hoursByDay = true;
        break;
      case 'hours-same': {
        const h = sim.cafe.hoursOn(this.sameAsDay())!;
        sim.setHours(h.openAt, h.closeAt);
        this.hoursByDay = false;
        break;
      }
      case 'report-period':
        this.reportPeriod = item as 'day' | PeriodKind;
        this.reportAt = null;
        this.panel.scrollTop = 0;
        break;
      case 'report-prev':
      case 'report-next': {
        const [now, , max] = this.reportCursor();
        const to = now + (action === 'report-next' ? 1 : -1);
        this.reportAt = to >= max ? null : Math.max(1, to);
        break;
      }
      case 'goto-tab':
        this.view = 'cafe';
        this.tab = item as CafeTab;
        if (this.selected) this.onDeselect();
        break;
      case 'event':
        showEventCard(sim, this, () => this.render(true));
        return;
      case 'challenge':
        location.href = challengeUrl();
        return;
      case 'normal-game':
        location.href = location.pathname;
        return;
      case 'challenge-result': {
        const r = savedResult();
        if (r) showChallengeResult(r, this);
        return;
      }
      case 'feedback':
        goal('feedback');
        openFeedback(this.sim);
        return;
      case 'tutorial':
        showTutorial(this);
        return;
      case 'back':
        this.view = 'cafe';
        this.selectedPlace = null;
        this.onDeselect();
        break;
      case 'restart':
        this.restart();
        return;
      case 'restart-ask':
        this.confirmRestart = !this.confirmRestart;
        break;
      case 'transfer':
        this.transfer = !this.transfer;
        this.transferError = '';
        break;
      case 'save-export':
        goal('save-export', { day: sim.today });
        exportSave(sim);
        return;
    }
    this.render(true);
  }

  private onChange(ev: Event): void {
    const el = ev.target as HTMLSelectElement;
    const cafe = this.sim.cafe;
    if (el.dataset.action === 'save-import') {
      const file = (el as unknown as HTMLInputElement).files?.[0];
      if (!file) return;
      void importSave(file, saveKeyFor(this.challenge)).then((error) => {
        if (error) {
          this.transferError = error;
          this.render(true);
          return;
        }
        goal('save-import');
        location.reload();
      });
      return;
    }
    if (el.dataset.action === 'dish-name') {
      this.keepDishName();
      return;
    }
    if (el.dataset.action === 'open-at') {
      const open = Number(el.value);
      const h = cafe.week[0] ?? { openAt: cafe.openAt, closeAt: cafe.closeAt };
      // Круглосуточный режим сохраняем; иначе не даём закрытию оказаться раньше открытия
      const close = h.closeAt - h.openAt >= MINUTES_PER_DAY ? open + MINUTES_PER_DAY : Math.max(h.closeAt, open + 60);
      this.sim.setHours(open, close);
    }
    if (el.dataset.action?.startsWith('happy-')) {
      const root = this.panel;
      const val = (a: string) => Number(root.querySelector<HTMLSelectElement>(`select[data-action="${a}"]`)!.value);
      const discount = val('happy-disc');
      this.sim.setHappyHours(discount > 0 ? { from: val('happy-from'), to: val('happy-to'), discount } : null);
    }
    if (el.dataset.action === 'staff-from' || el.dataset.action === 'staff-to') {
      const id = Number(el.dataset.item);
      const st = cafe.staff.find((b) => b.id === id);
      const get = (a: string) => Number(this.panel.querySelector<HTMLSelectElement>(`select[data-action="${a}"][data-item="${id}"]`)!.value);
      if (st) {
        let from = get('staff-from');
        let to = get('staff-to');
        if (to <= from) to = from + 60;
        if (to - from > MINUTES_PER_DAY) from = to - MINUTES_PER_DAY;
        this.sim.setStaffSchedule(id, { ...st.schedule, from, to });
      }
    }
    if (el.dataset.action === 'staff-wfrom' || el.dataset.action === 'staff-wto') {
      const id = Number(el.dataset.item);
      const d = Number(el.dataset.day);
      const st = cafe.staff.find((b) => b.id === id);
      const get = (a: string) =>
        Number(this.panel.querySelector<HTMLSelectElement>(`select[data-action="${a}"][data-item="${id}"][data-day="${d}"]`)!.value);
      if (st) {
        let from = get('staff-wfrom');
        let to = get('staff-wto');
        if (to <= from) to = from + 60;
        if (to - from > MINUTES_PER_DAY) from = to - MINUTES_PER_DAY;
        const windows = Array.from({ length: 7 }, (_, k) => st.schedule.windows?.[k] ?? null);
        // Совпало с обычными часами — свой день не нужен
        windows[d] = from === st.schedule.from && to === st.schedule.to ? null : { from, to };
        this.sim.setStaffSchedule(id, { ...st.schedule, windows });
      }
    }
    if (el.dataset.action === 'close-at') {
      const open = cafe.week[0]?.openAt ?? cafe.openAt;
      this.sim.setHours(open, el.value === ALL_DAY ? open + MINUTES_PER_DAY : Number(el.value));
    }
    if (el.dataset.action === 'day-open') {
      const d = Number(el.dataset.item);
      const h = cafe.week[d];
      // Последний рабочий день выходным не сделать — sim откажет, а список вернётся как был
      if (el.value === DAY_OFF) this.sim.setDayHours(d, null);
      else {
        const open = Number(el.value);
        const was = h ?? cafe.week.find(Boolean) ?? { openAt: hm(8), closeAt: hm(20) };
        const allDay = was.closeAt - was.openAt >= MINUTES_PER_DAY;
        this.sim.setDayHours(d, { openAt: open, closeAt: allDay ? open + MINUTES_PER_DAY : Math.max(was.closeAt, open + 60) });
      }
    }
    if (el.dataset.action === 'day-close') {
      const d = Number(el.dataset.item);
      const h = cafe.week[d];
      if (h) this.sim.setDayHours(d, { openAt: h.openAt, closeAt: el.value === ALL_DAY ? h.openAt + MINUTES_PER_DAY : Number(el.value) });
    }
    this.render(true);
  }

  /** Новая игра: стереть сохранение и перезапустить */
  private restart(): void {
    goal('restart', { day: this.sim.today });
    window.dispatchEvent(new Event('gorod-dela:reset'));
    clearSave(saveKeyFor(this.challenge));
    location.href = this.challenge ? challengeUrl() : location.pathname;
  }

  // ——— Отрисовка панели ———

  private render(force = false): void {
    OWN = this.sim.cafe.own;
    this.live = {};
    this.liveWidth = {};
    this.liveClass = {};
    const html = this.sim.bankrupt
      ? this.bankruptView()
      : this.view === 'resident' && this.selected
        ? this.residentView(this.selected)
        : this.view === 'place' && this.selectedPlace
          ? this.placeView(this.selectedPlace)
        : this.view === 'report' && this.sim.reports.length > 0
          ? this.reportScreen()
          : this.cafeView();
    // Пересобираем DOM только когда изменилась структура — иначе обновляем «живые» числа.
    // Так не сбиваются клики, прокрутка и открытые списки.
    // Пока открыт выпадающий список или идёт ввод — не трогаем DOM: на телефоне пересборка
    // закрывает системное окно выбора времени. Пересоберём сразу после выбора (change) или ухода фокуса.
    const active = document.activeElement;
    const editing = !force && active instanceof HTMLElement && this.panel.contains(active) && (active.tagName === 'SELECT' || active.tagName === 'INPUT');
    if (!editing && (force || html !== this.lastHtml)) {
      this.lastHtml = html;
      this.panel.innerHTML = html;
      const viewKey = this.sim.bankrupt ? 'bankrupt' : `${this.sim.cafe.opened}:${this.view}:${this.selected?.id ?? ''}:${this.selectedPlace?.id ?? ''}`;
      if (viewKey !== this.lastView) this.panel.scrollTop = 0;
      this.lastView = viewKey;
    }
    for (const [key, value] of Object.entries(this.liveWidth)) {
      const el = this.panel.querySelector<HTMLElement>(`[data-live-width="${key}"]`);
      if (el && el.style.width !== value) el.style.width = value;
    }
    for (const [key, value] of Object.entries(this.live)) {
      const el = this.panel.querySelector(`[data-live="${key}"]`);
      if (el && el.textContent !== value) el.textContent = value;
    }
    for (const [key, value] of Object.entries(this.liveClass)) {
      const el = this.panel.querySelector<HTMLElement>(`[data-live="${key}"]`);
      if (el && el.dataset.tone !== value) el.dataset.tone = value;
    }
  }

  private premisesCard(id: PremisesId): string {
    const pr = PREMISES[id];
    const canAfford = this.sim.cash >= pr.openingCost;
    return `<li class="premises">
      <img class="premises-pic" src="${PREMISES_PIC[id]}" alt="" width="300" height="100" />
      <div class="row"><b class="grow">${pr.name}</b><span class="badge">аренда ${money(pr.rentPerDay * 30)}/мес</span></div>
      <small>${pr.about}. Коммуналка — за${NB}часы работы, налог 6${NB}% с${NB}выручки.</small>
      <button class="primary" data-action="open-cafe" data-item="${id}" ${canAfford ? '' : 'disabled'}>Открыть · ${money(pr.openingCost)}</button>
    </li>`;
  }

  private placeView(p: Place): string {
    const sim = this.sim;
    const residents = sim.residents;
    const inside = residents.filter((r) => r.placeId === p.id && !r.walking);
    const head = (title: string, sub: string) => `
      <div class="card-head">
        <i class="place-dot place-${p.kind}"></i>
        <div><b>${title}</b><small>${sub}</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button>
      </div>${placeInterior(p)}`;
    const people = (list: Resident[], title: string) =>
      list.length
        ? `<h5>${title}</h5><div class="people">${list
            .slice(0, 24)
            .map(
              (r) =>
                `<button class="person${sim.cafe.opened && !r.aware ? ' unaware' : ''}" data-action="face" data-item="${r.id}" title="${r.name}">${portrait(r, !!sim.regularOf(r.id))}${r.name.split(' ')[0]}</button>`,
            )
            .join('')}${list.length > 24 ? `<small>и${NB}ещё ${list.length - 24}</small>` : ''}</div>`
        : '';
    const awareLine = (list: Resident[], what: string) => {
      if (!sim.cafe.opened || !list.length) return '';
      const n = list.filter((r) => r.aware).length;
      return `<div>О${NB}твоём кафе знают ${n} из${NB}${list.length} ${what}</div>`;
    };

    // Свободное, своё или конкурента помещение
    if (p.kind === 'cafe') {
      const id = p.id as PremisesId;
      const mine = sim.cafe.opened && sim.shopId === p.id;
      const rival = sim.rival && sim.cafe.opened && sim.rival.placeId === p.id ? sim.rival : null;
      if (mine) {
        const open = sim.cafe.isOpenAt(sim.minute);
        return `${head(sim.cafe.title, open ? 'открыто' : 'закрыто')}
          <div class="facts"><div>Гостей сегодня: ${sim.cafe.today.guests} · выручка ${money(sim.cafe.today.revenue)}</div></div>
          ${people(inside, 'Сейчас внутри')}
          <button class="primary" data-action="back">К${NB}управлению кафе</button>`;
      }
      if (rival) {
        const opened = sim.today >= rival.opensDay;
        return `${head(rival.t.name, opened ? 'конкурент' : `конкурент откроется через ${rival.opensDay - sim.today}${NB}дн.`)}
          <div class="facts"><div>${rival.t.pitch}</div><div>Часы: ${fmtMinute(rival.t.openAt)}–${fmtMinute(rival.t.closeAt)}</div><div>Цены: ${Object.entries(
            rival.t.prices,
          )
            .map(([item, price]) => `${itemName(item)} ${money(price)}`)
            .join(' · ')}</div></div>
          ${people(inside, `Сейчас у${NB}него`)}`;
      }
      return `${head(p.name, sim.cafe.opened ? 'свободно' : 'сдаётся')}
        ${sim.cafe.opened ? `<div class="facts"><div>Помещение пустует.</div></div>` : `<ul class="menu premises-list">${this.premisesCard(id)}</ul>`}`;
    }

    if (p.kind === 'home') {
      const live = residents.filter((r) => r.homeId === p.id);
      return `${head(p.name, 'жилой дом')}
        <div class="facts"><div>Живут: ${live.length} · дома сейчас: ${inside.length}</div>${awareLine(live, 'жильцов')}</div>
        ${people(inside, 'Сейчас дома')}`;
    }
    if (p.kind === 'office') {
      const work = residents.filter((r) => r.workId === p.id);
      return `${head(p.name, 'офис')}
        <div class="facts"><div>Работают: ${work.length} · сейчас на${NB}месте: ${inside.length}</div>${awareLine(work, 'сотрудников')}</div>
        ${people(inside, `Сейчас в${NB}офисе`)}`;
    }
    if (p.kind === 'metro' && p.closed) {
      return `${head(p.name, 'закрыт')}
        <div class="facts"><div>Выход на${NB}Садовую пока закрыт. Все пассажиры выходят на${NB}Кленовую, к${NB}киоску.</div></div>`;
    }
    if (p.kind === 'metro') {
      const come = residents.filter((r) => r.homeId === 'metro');
      return `${head(p.name, `выход из${NB}метро`)}
        <div class="facts"><div>Приезжают на${NB}улицу на${NB}метро: ${come.length}</div>${awareLine(come, `из${NB}них`)}</div>`;
    }
    if (p.kind === 'school') {
      const study = residents.filter((r) => r.workId === p.id);
      return `${head(p.name, `школа на${NB}Садовой`)}
        <div class="facts"><div>Учатся: ${study.length} · сейчас на${NB}уроках: ${inside.length}</div>${awareLine(study, 'учеников')}</div>
        ${people(inside, `Сейчас в${NB}школе`)}`;
    }
    if (p.kind === 'vacant') {
      return `${head(p.name, 'сдаётся')}
        <div class="facts"><div>Второе помещение на${NB}жилой улице. Откроется для${NB}аренды позже${NB}— когда кафе на${NB}Кленовой встанет на${NB}ноги.</div></div>`;
    }
    const sub = p.kind === 'shop' ? 'магазин' : p.kind === 'park' ? `здесь гуляют и${NB}отдыхают` : 'остановка автобуса';
    const here = p.kind === 'park' ? residents.filter((r) => r.placeId === p.id && r.visible) : inside;
    return `${head(p.name, sub)}${people(here, p.kind === 'park' ? 'Сейчас гуляют' : 'Сейчас здесь')}`;
  }

  private cafeView(): string {
    const { cafe } = this.sim;
    const today = cafe.today;
    if (!cafe.opened) {
      this.live.wanted = String(today.wanted);
      const card = (id: PremisesId) => this.premisesCard(id);
      return `
        <div class="row head"><b>Свободные помещения</b><span class="badge">Сдаются</span></div>
        <p class="demand">Сегодня зайти хотели: <b data-live="wanted"></b>. Посмотри, кто и${NB}когда, — нажми на${NB}жителя.</p>
        ${this.challengeBanner()}
        <ul class="menu premises-list">${card('kiosk')}${card('cafe')}</ul>
        <small>Формат начинается с${NB}места: у${NB}метро — поток пассажиров, в${NB}кафе с${NB}залом гости сидят и${NB}дозаказывают.</small>
        ${this.sim.time > hm(7) ? this.restartBlock() : this.challenge ? '' : this.transferBlock()}`;
    }

    const minute = this.sim.minute;
    const open = cafe.isOpenAt(minute);
    this.live.status = this.statusText(minute, open);
    this.live.guests = String(today.guests);
    this.live.revenue = money(today.revenue);
    this.live.queue = String(this.sim.guestsInside);
    this.live.wages = money(cafe.wagesSoFar);
    this.live['owner-hours'] = (Math.floor(cafe.ownerMinutes / 6) / 10).toFixed(1).replace('.', ',');

    const items = cafe.menu
      .map((m) => {
        this.live[`sold-${m.id}`] = String(today.sold[m.id] ?? 0);
        this.live[`oos-${m.id}`] = cafe.stock.canMake(m.id) ? '' : ` · нет в${NB}наличии`;
        return `
        <li>
          ${iconImg(m.id)}
          <div class="grow"><b>${m.name}</b>
            <small>${itemTaste(m.id) ? `${itemTaste(m.id)} · ` : ''}по${NB}вкусу ${this.sim.tasteFans(m.id).fans} · себестоимость ${money(m.cost)} · продано <span data-live="sold-${m.id}"></span><span class="oos" data-live="oos-${m.id}"></span></small></div>
          <div class="stepper">
            <button data-action="price-down" data-item="${m.id}" aria-label="Дешевле">−</button>
            <span>${money(m.price)}</span>
            <button data-action="price-up" data-item="${m.id}" aria-label="Дороже">+</button>
          </div>
          <button class="icon" data-action="remove-item" data-item="${m.id}" ${cafe.menu.length <= 1 ? 'disabled' : ''}
            aria-label="Убрать из меню">✕</button>
          ${compositionLine(m.id)}${warnLine(priceWarning(m))}
        </li>`;
      })
      .join('');

    const full = cafe.menu.length >= MAX_MENU;
    const catalog = this.catalogOpen
      ? (Object.keys(KIND_TITLE) as ItemKind[])
          .map((kind) => {
            const rows = CATALOG.filter((c) => c.kind === kind)
              .map((c) => {
                const inMenu = cafe.hasItem(c.id);
                const fits = cafe.fits(c.id);
                const noEquip = fits && !!cafe.missingEquipment(c.id);
                return `<li>${iconImg(c.id)}<div class="grow"><b>${c.name}</b>
                  <small>${itemTaste(c.id) ? `${itemTaste(c.id)} · ` : ''}от ${money(c.price)} · себестоимость ${money(c.cost)}</small></div>
                  ${
                    inMenu
                      ? '<span class="badge on">в меню</span>'
                      : !fits
                        ? `<span class="badge">не${NB}здесь</span>`
                        : noEquip
                          ? `<span class="badge">нужно оборудование</span>`
                          : `<button class="small" data-action="add-item" data-item="${c.id}" ${full ? 'disabled' : ''}>Добавить</button>`
                  }${compositionLine(c.id)}${inMenu || !fits || noEquip ? '' : warnLine(menuAddWarning(cafe, c.id))}</li>`;
              })
              .join('');
            const legal =
              kind === 'bar' ? `<small class="note">ИП может продавать только пиво и${NB}сидр. Вино и${NB}крепкое — с${NB}лицензией ООО, позже</small>` : '';
            // Оборудование под категорию: плита для обедов, кран для пива
            const need = equipmentFor(kind);
            const eq = need ? EQUIPMENT[need] : null;
            const fitsKind = cafe.premises.kinds.includes(kind);
            const equip =
              eq && fitsKind
                ? cafe.equipment.includes(eq.id)
                  ? `<p class="equip on"><b>${eq.name}</b> <span class="badge on">есть</span></p>`
                  : `<p class="equip"><span class="grow">Нужна покупка: <b>${eq.name}</b>. Свет и${NB}вода +${eq.utilitiesPerHour}${NB}₽ за${NB}час работы</span>
                      <button class="small" data-action="buy-equipment" data-item="${eq.id}" ${this.sim.cash < eq.cost ? 'disabled' : ''}>${money(eq.cost)}</button></p>`
                : '';
            return `<h5>${KIND_TITLE[kind]}</h5>${equip}<ul class="menu catalog">${rows}</ul>${legal}`;
          })
          .join('')
      : '';

    const opt = (list: number[], value: number) =>
      list.map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m)}</option>`).join('');
    const closeOpt = (h: DayHours) => {
      const allDay = h.closeAt - h.openAt >= MINUTES_PER_DAY;
      return (
        CLOSE_OPTIONS.filter((m) => m > h.openAt)
          .map((m) => {
            const label = m >= MINUTES_PER_DAY ? `${fmtMinute(m % MINUTES_PER_DAY)} ночи` : fmtMinute(m);
            return `<option value="${m}" ${!allDay && m === h.closeAt ? 'selected' : ''}>${label}</option>`;
          })
          .join('') + `<option value="${ALL_DAY}" ${allDay ? 'selected' : ''}>круглосуточно</option>`
      );
    };
    const hoursBlock = () => {
      if (!this.hoursByDay && cafe.sameEveryDay) {
        const h = cafe.week[0]!;
        return `<div class="row hours">
          <select data-action="open-at" aria-label="Открытие">${opt(OPEN_OPTIONS, h.openAt)}</select>
          <span>—</span>
          <select data-action="close-at" aria-label="Закрытие">${closeOpt(h)}</select>
        </div>
        <button class="link" data-action="hours-by-day">Свои часы и${NB}выходные по${NB}дням недели</button>`;
      }
      const rows = cafe.week
        .map((h, d) => {
          const open = `<select data-action="day-open" data-item="${d}" aria-label="${WEEKDAY_SHORT[d]}, открытие">
            <option value="${DAY_OFF}" ${h ? '' : 'selected'}>выходной</option>${opt(OPEN_OPTIONS, h?.openAt ?? -1)}</select>`;
          const close = h ? `<span>—</span><select data-action="day-close" data-item="${d}" aria-label="${WEEKDAY_SHORT[d]}, закрытие">${closeOpt(h)}</select>` : '';
          return `<li class="${d === cafe.weekday ? 'today' : ''}${h ? '' : ' off'}"><b>${WEEKDAY_SHORT[d]}</b>${open}${close}</li>`;
        })
        .join('');
      return `<ul class="week-hours">${rows}</ul>
        <button class="link" data-action="hours-same">Одинаково каждый день${NB}— как${NB}${WEEKDAY_SHORT[this.sameAsDay()].toLowerCase()}</button>`;
    };
    const staffRows = cafe.staff.map((st, i) => this.staffRow(st, i, open)).join('');
    const last = this.sim.reports.at(-1);

    const tabs: [CafeTab, string][] = [
      ['overview', 'Обзор'],
      ['menu', 'Меню'],
      ['stock', 'Склад'],
      ['staff', 'Персонал'],
      ['guests', 'Гости'],
      ...(this.sim.hasHall ? ([['hall', 'Зал']] as [CafeTab, string][]) : []),
      ...(cafe.premisesId === 'kiosk' ? ([['stand', 'Стойка']] as [CafeTab, string][]) : []),
      ['growth', 'Развитие'],
    ];
    const tabBar = `<nav class="tabs${tabs.length > 6 ? ' tabs-7' : ''}">${tabs
      .map(([id, label]) => `<button data-action="tab" data-item="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('')}</nav>`;

    let body = '';
    if (this.tab === 'overview') {
      this.live['stock-warn'] = this.stockWarning();
      body = `
      ${this.cashWarning()}
      ${this.eventBanner()}
      ${this.insightBlock()}
      <div class="kpis">
        <div><small>Гостей сегодня</small><b data-live="guests"></b></div>
        <div><small>Выручка</small><b data-live="revenue"></b></div>
        <div><small>Внутри сейчас</small><b data-live="queue"></b></div>
      </div>
      <p class="hint-line" data-live="stock-warn"></p>
      ${this.rivalCard()}
      <h4>Часы работы</h4>
      ${hoursBlock()}
      ${staffWarnings(cafe).map((w) => warnLine(w)).join('')}
      ${last ? `<button class="secondary" data-action="report">Итоги дня ${last.day}</button>` : ''}
      ${this.restartBlock()}`;
    } else if (this.tab === 'menu') {
      body = `
      <h4>Меню и${NB}цены · ${cafe.menu.length}${NB}из${NB}${MAX_MENU}</h4>
      <p class="hint-line">${this.focusLine()}</p>
      <ul class="menu">${items}</ul>
      <button class="secondary" data-action="toggle-catalog">${this.catalogOpen ? 'Скрыть каталог' : `Изменить меню${full ? ` — мест нет, сначала убери позицию` : ''}`}</button>
      <div class="catalog-wrap">${catalog}</div>
      ${this.ownDishesBlock()}`;
    } else if (this.tab === 'stock') {
      body = this.stockTab();
    } else if (this.tab === 'guests') {
      body = this.facesBlock() + this.marketingTab();
    } else if (this.tab === 'growth') {
      body = this.growthTab();
    } else if (this.tab === 'hall') {
      body = hallTab(this.sim, this.hallSlot);
    } else if (this.tab === 'stand') {
      body = standTab(this.sim, this.standPick);
    } else {
      body = `
      <small>Когда бариста нет, за${NB}стойкой ты сам${NB}— бесплатно, но${NB}${cafe.has('machine') ? '3' : '4'}${NB}мин на${NB}гостя и${NB}не${NB}больше ${ECONOMY.ownerHours}${NB}ч в${NB}день. С${NB}бариста${NB}— ${cafe.has('machine') ? '1,5' : '2'}${NB}мин, и${NB}обслуживают параллельно, а${NB}ты отдыхаешь.</small>
      <p class="hint-line">Сегодня ты за${NB}стойкой: <b data-live="owner-hours"></b> из${NB}${ECONOMY.ownerHours}${NB}ч</p>
      ${staffWarnings(cafe).map((w) => warnLine(w)).join('')}
      <ul class="menu staff">${staffRows}</ul>
      ${
        cafe.staff.length < cafe.premises.maxBaristas
          ? `<div class="hire">
        <button class="small" data-action="hire-shift">На${NB}смену · ${money(ECONOMY.shiftWage)}</button>
        <button class="small" data-action="hire-hourly">Почасово · ${money(ECONOMY.baristaWagePerHour)}/ч</button>
      </div>
      <small>Смена — до${NB}${ECONOMY.shiftHours}${NB}часов с${NB}открытия, платишь всю сумму в${NB}дни по${NB}графику. Почасовой работает в${NB}окне графика — сузь его до${NB}пиков.</small>`
          : ''
      }
      <p class="wages">Сегодня на${NB}зарплату: <b data-live="wages"></b> <small>ночью (22:00–6:00) +20${NB}%</small></p>`;
    }

    return `
      ${this.bizHeader(open)}
      ${tabBar}
      ${body}`;
  }

  /**
   * Шапка заведения. На телефоне в свёрнутом листе видна только она: название, статус,
   * итог дня на этот момент и кнопка «Открыть управление».
   */
  private bizHeader(open: boolean): string {
    const cafe = this.sim.cafe;
    const t = cafe.today;
    // Итог «на сейчас»: аренда и коммуналка за весь день уже вычтены, чтобы утренний плюс не обманывал
    const running = Math.round(
      t.revenue - t.purchases - cafe.wagesSoFar - t.revenue * ECONOMY.taxRate - t.marketing - (t.other ?? 0) - cafe.premises.rentPerDay - cafe.utilitiesPerDay,
    );
    this.live['biz-result'] = `${running > 0 ? '+' : ''}${money(running)}`;
    this.live['biz-guests'] = `${t.guests}${NB}${plural(t.guests, 'гость', 'гостя', 'гостей')}`;
    this.liveClass['biz-result'] = running >= 0 ? 'pos' : 'neg';
    const name = this.renaming
      ? `<div class="rename">
          <input data-action="rename-input" maxlength="${CAFE_NAME_MAX}" value="${escapeHtml(cafe.title)}" aria-label="Название заведения" enterkeyhint="done" />
          <button class="small" data-action="rename-save">Готово</button>
          <button class="icon" data-action="rename-cancel" aria-label="Отмена">✕</button>
        </div>`
      : `<div class="biz-name"><b>${escapeHtml(cafe.title)}</b><button class="icon" data-action="rename" aria-label="Переименовать" title="Переименовать">✎</button></div>`;
    return `<header class="biz">
      <small class="eyebrow">Твоё заведение</small>
      ${name}
      <div class="biz-line"><span class="biz-status ${open ? 'on' : ''}" data-live="status"></span></div>
      <div class="biz-line" title="Выручка минус закупки, зарплаты, налог, аренда и${NB}коммуналка за${NB}день">Сегодня пока <b data-live="biz-result"></b> · <span data-live="biz-guests"></span></div>
      <button class="link only-peek" data-action="expand">Открыть управление</button>
    </header>`;
  }

  /**
   * «Что происходит»: главное наблюдение за последние два часа и один следующий шаг.
   * Только факты — кто и почему не зашёл; вывод делает игрок.
   */
  private insightBlock(): string {
    const sim = this.sim;
    const cafe = sim.cafe;
    const t = cafe.today;
    const minute = sim.minute;
    const h = Math.floor(minute / 60) % 24;
    const from = (h + 23) % 24;
    const hours = [from, h];
    const span = `С${NB}${fmtMinute(from * 60)} до${NB}${fmtMinute(((h + 1) % 24) * 60)}`;
    // Гости — те, кто зашёл и купил. Кто пришёл и ушёл ни с чем — «люди», кто прошёл мимо — «прохожие»
    const persons = (n: number) => `${numWord(n)} ${plural(n, 'человек', 'человека', 'человек')}`;
    const passers = (n: number) => `${numWord(n)} ${plural(n, 'прохожий', 'прохожих', 'прохожих')}`;
    const count = (reason: RejectReason) => hours.reduce((n, x) => n + (t.lostHour?.[reason]?.[x] ?? 0), 0);
    const rules: { reasons: RejectReason[]; text: (n: number) => string; tab: CafeTab; action: string }[] = [
      { reasons: ['queue', 'no-time'], text: (n) => `${persons(n)} ушли из-за${NB}очереди`, tab: 'staff', action: 'Настроить смены' },
      { reasons: ['out-of-stock'], text: (n) => `${persons(n)} не${NB}получили заказ: кончились продукты`, tab: 'stock', action: 'Открыть склад' },
      { reasons: ['expensive'], text: (n) => `${persons(n)} решили, что дорого`, tab: 'menu', action: 'Посмотреть цены' },
      { reasons: ['rival'], text: (n) => `${persons(n)} ушли к${NB}конкуренту`, tab: 'menu', action: 'Сравнить цены' },
      { reasons: ['no-item'], text: (n) => `${persons(n)} не${NB}нашли нужного в${NB}меню`, tab: 'menu', action: 'Изменить меню' },
      { reasons: ['closed'], text: (n) => `${persons(n)} пришли, а${NB}было закрыто`, tab: 'overview', action: 'Часы работы' },
      { reasons: ['unaware'], text: (n) => `${passers(n)} прошли мимо: не${NB}знают о${NB}тебе`, tab: 'guests', action: 'Реклама' },
    ];
    let best: { n: number; rule: (typeof rules)[number] } | null = null;
    for (const rule of rules) {
      const n = rule.reasons.reduce((sum, r) => sum + count(r), 0);
      if (n >= 2 && (!best || n > best.n)) best = { n, rule };
    }
    // Время — отдельно, жирным
    let time = '';
    let text: string;
    let button = '';
    if (best) {
      time = span;
      text = `${best.rule.text(best.n)}.`;
      button = `<button class="primary" data-action="insight" data-item="${best.rule.tab}">${best.rule.action}</button>`;
    } else if (!cafe.isOpenAt(minute)) {
      text = `${this.statusText(minute, false)}.`;
    } else {
      const served = hours.reduce((n, x) => n + (t.servedHour?.[x] ?? 0), 0);
      time = span;
      text = served
        ? `обслужено ${served}${NB}${plural(served, 'гость', 'гостя', 'гостей')}, без${NB}заметных потерь.`
        : `гостей не${NB}было. Посмотри, кто сейчас на${NB}улице и${NB}куда идёт.`;
    }
    // Текст — «живой»: числа меняются каждую минуту, а пересобирать из-за них панель незачем
    this.live.insight = text.replace(/&nbsp;|\u00a0/g, NB);
    this.live['insight-time'] = time;
    return `<section class="insight-now"><h4>Что происходит</h4><p><b data-live="insight-time"></b> <span data-live="insight"></span></p>${button}</section>`;
  }

  /** Конкурент: кто, чем берёт, цены, часы, акции */
  private rivalCard(): string {
    const sim = this.sim;
    const rival = sim.rival;
    if (!rival) return '';
    const day = sim.today;
    const t = rival.t;
    const where = t.premises === 'kiosk' ? `в${NB}киоске у${NB}метро` : `в${NB}кафе напротив`;
    if (day < rival.opensDay) {
      const n = rival.opensDay - day;
      return `<div class="rival soon"><b>Через ${n}${NB}дн. ${where} откроется ${t.name}</b><small>${t.pitch}. Цены ниже твоих — подумай, чем ты будешь отличаться.</small></div>`;
    }
    const menu = rival.menu(day).map((m) => `${m.name} ${money(m.price)}`).join(' · ');
    const promo = rival.promo(day)
      ? `<span class="badge neg">акция −${Math.round(15)}${NB}% до${NB}конца недели</span>`
      : `<small>Следующая акция через ${rival.daysToPromo(day)}${NB}дн.</small>`;
    this.live['rival-today'] = String(rival.servedToday);
    return `<div class="rival"><div class="row"><b class="grow">Конкурент: ${t.name}</b>${rival.promo(day) ? promo : ''}</div>
      <small>${t.pitch}. ${fmtMinute(t.openAt)}–${fmtMinute(t.closeAt)}.</small>
      <small>${menu}</small>
      <small>Сегодня у${NB}него гостей: <b data-live="rival-today"></b>${rival.promo(day) ? '' : ` · ${promo.replace(/<\/?small>/g, '')}`}</small></div>`;
  }

  /** Понятность формата: узкое меню привлекает сильнее, «всё подряд» — слабее */
  /** Свои блюда: список придуманных и конструктор нового (основа + добавки → вкус, себестоимость, кому понравится) */
  private ownDishesBlock(): string {
    const cafe = this.sim.cafe;
    const own = cafe.own
      .map((m) => {
        const fans = this.sim.tasteFans(m.id).fans;
        const inMenu = cafe.hasItem(m.id);
        const taste = itemTaste(m.id);
        return `<li><div class="grow"><b>${escapeHtml(m.name)}</b>
            <small>${taste ? `${taste} · ` : ''}себестоимость ${money(m.cost)} · по${NB}вкусу ${fans}${NB}жителям</small></div>
          ${
            inMenu
              ? '<span class="badge on">в меню</span>'
              : `<button class="small" data-action="add-item" data-item="${m.id}" ${cafe.menu.length >= MAX_MENU ? 'disabled' : ''}>Вернуть</button>`
          }
          <button class="icon" data-action="dish-delete" data-item="${m.id}" aria-label="Забыть блюдо">✕</button></li>`;
      })
      .join('');
    const head = `<h4>Свои блюда · ${cafe.own.length}${NB}из${NB}${MAX_OWN}</h4>`;
    const list = own ? `<ul class="menu">${own}</ul>` : `<p class="hint-line">Собери блюдо под вкус своих гостей: основа и${NB}до${NB}двух добавок. Вкус блюда видно сразу, а${NB}в${NB}карточках жителей${NB}— что любят они.</p>`;
    if (!this.dish) {
      const can = cafe.own.length < MAX_OWN;
      return `${head}${list}<button class="secondary" data-action="dish-open" ${can ? '' : 'disabled'}>${can ? 'Придумать блюдо' : `Своих блюд уже ${MAX_OWN}${NB}— забудь одно, чтобы придумать новое`}</button>`;
    }
    return `${head}${list}${this.dishBuilder()}`;
  }

  private dishBuilder(): string {
    const cafe = this.sim.cafe;
    const d = this.dish!;
    const bases = BASES.map((b) => {
      const fits = cafe.premises.kinds.includes(b.kind);
      return `<button class="chip${d.base === b.id ? ' on' : ''}" data-action="dish-base" data-item="${b.id}" ${fits ? '' : 'disabled'}>${b.name}</button>`;
    }).join('');
    let body = '';
    if (d.base) {
      const b = dishBase(d.base);
      const addIns = b.addIns
        .map((id) => {
          const on = d.addIns.includes(id);
          const lock = !on && d.addIns.length >= MAX_ADDINS;
          return `<button class="chip${on ? ' on' : ''}" data-action="dish-addin" data-item="${id}" ${lock ? 'disabled' : ''}>${dishAddIn(id).name}</button>`;
        })
        .join('');
      const id = dishId(d.base, d.addIns);
      const p = profileOf(id);
      const bars = AXES.map(
        (a) => `<div class="axis"><span>${AXIS_LABEL[a]}</span><i><b style="width:${Math.round(p[a] * 100)}%"></b></i></div>`,
      ).join('');
      const cost = recipeCost(id);
      const price = d.price ?? this.suggestedPrice(id);
      const fans = this.sim.tasteFans(id);
      const who = fans.byKind
        .slice(0, 2)
        .map(([k]) => FANS_DATIVE[k])
        .join(` и${NB}`);
      const prep = dishPrep(id);
      const need = cafe.missingEquipment(id);
      const exists = cafe.own.some((m) => m.id === id);
      const full = cafe.menu.length >= MAX_MENU;
      const fresh = (Object.keys(recipeOf(id)) as IngredientId[]).filter((i) => cafe.stock.qty(i) <= 0 && cafe.stock.keep[i] <= 0);
      const block = exists
        ? `Такое блюдо уже есть`
        : need
          ? `Нужна покупка: ${EQUIPMENT[need].name.toLowerCase()}`
          : full
            ? `В${NB}меню нет места${NB}— убери позицию`
            : '';
      body = `
        <small>Добавки · до${NB}${MAX_ADDINS}</small>
        <div class="chips">${addIns}</div>
        <div class="profile">${bars}</div>
        <p class="hint-line">По${NB}вкусу <b>${fans.fans}</b>${NB}жителям из${NB}${fans.total}${who ? `, больше всего ${who}` : ''}.</p>
        <small>Себестоимость ${money(cost)}${prep > 0 ? ` · готовится на${NB}${String(Math.round(prep * 10) / 10).replace('.', ',')}${NB}мин дольше` : ''}</small>
        <input class="dish-name" data-action="dish-name" maxlength="${DISH_NAME_MAX}" value="${escapeHtml(d.name ?? defaultDishName(id))}" aria-label="Название блюда" enterkeyhint="done" />
        <div class="row">
          <span class="grow">Цена</span>
          <div class="stepper">
            <button data-action="dish-price-down" aria-label="Дешевле">−</button>
            <span>${money(price)}</span>
            <button data-action="dish-price-up" aria-label="Дороже">+</button>
          </div>
        </div>
        ${fresh.length ? `<small>${capitalize(fresh.map((i) => INGREDIENTS.find((x) => x.id === i)!.name.toLowerCase()).join(', '))}${NB}— на${NB}складе нет. Закажу по${NB}15${NB}порций, привезут утром</small>` : ''}
        <button class="primary" data-action="dish-create" ${block ? 'disabled' : ''}>${block || 'Добавить в меню'}</button>`;
    }
    return `<div class="dish-builder">
        <small>Основа</small>
        <div class="chips">${bases}</div>
        ${body}
        <button class="secondary" data-action="dish-close">Отмена</button>
      </div>`;
  }

  /** Игрок сам менял название в поле — тогда его не перезаписываем */
  private dishNamed(): boolean {
    const input = this.panel.querySelector<HTMLInputElement>('input[data-action="dish-name"]');
    if (!input || !this.dish?.base) return this.dish?.name != null;
    return input.value !== defaultDishName(dishId(this.dish.base, this.dish.addIns));
  }

  /** Запомнить, что набрано в поле названия, перед пересборкой панели */
  private keepDishName(): void {
    const input = this.panel.querySelector<HTMLInputElement>('input[data-action="dish-name"]');
    if (input && this.dish && this.dishNamed()) this.dish.name = input.value;
  }

  /** Предложенная цена: как у похожей позиции каталога плюс добавки с наценкой */
  private suggestedPrice(id: string): number {
    const d = this.dish!;
    const b = dishBase(d.base!);
    const extra = recipeCost(id) - recipeCost(dishId(d.base!, []));
    return Math.round((b.price + extra * 2.5) / 10) * 10;
  }

  private focusLine(): string {
    const n = new Set(this.sim.cafe.menu.map((m) => m.kind)).size;
    const word = n === 1 ? 'категория' : n <= 4 ? 'категории' : 'категорий';
    const slow = Math.round((this.sim.cafe.menuSlowdown - 1) * 100);
    const deep = `Где в${NB}категории 3+${NB}позиции, за${NB}ней заходят охотнее (+${Math.round((FOCUS.depth - 1) * 100)}${NB}%)${NB}— есть из${NB}чего выбрать.`;
    const pace =
      slow > 0
        ? `${n}${NB}${word} в${NB}меню: стойка работает медленнее на${NB}${slow}${NB}%${NB}— каждая категория сверх трёх добавляет 15${NB}%.`
        : `${n}${NB}${word} в${NB}меню. Больше трёх${NB}— и${NB}стойка начнёт работать медленнее.`;
    return `${pace} ${deep}`;
  }

  /** Бариста: статус, дни недели, для почасового — часы и разовый вызов */
  private staffRow(st: Barista, i: number, open: boolean): string {
    const cafe = this.sim.cafe;
    const working = cafe.isWorking(st);
    let status: string;
    if (st.contract === 'hourly') {
      const off = st.override && st.override.day === cafe.day;
      status = working
        ? open
          ? 'за стойкой'
          : `выйдет, когда кафе откроется`
        : off
          ? `отпущен до${NB}конца дня`
          : (() => {
              const w = windowOn(st.schedule, cafe.weekday);
              return w ? `по графику ${fmtMinute(w.from % MINUTES_PER_DAY)}–${fmtMinute(w.to % MINUTES_PER_DAY)}` : 'сегодня выходной';
            })();
    } else {
      const left = ECONOMY.shiftHours * 60 - st.shiftMinutes;
      status = !st.shiftActive
        ? 'сегодня выходной'
        : left <= 0
          ? `смена окончена`
          : open
            ? `на${NB}смене ещё ${Math.floor(left / 60)}${NB}ч ${left % 60}${NB}мин`
            : `выйдет к${NB}открытию`;
    }
    this.live[`staff-${st.id}`] = status;
    const days = WEEKDAY_SHORT.map(
      (d, wd) =>
        `<button class="chip ${st.schedule.days[wd] ? 'on' : ''} ${wd >= 5 ? 'we' : ''}" data-action="staff-day" data-item="${st.id}" data-day="${wd}" aria-pressed="${st.schedule.days[wd]}">${d}</button>`,
    ).join('');
    const hours = (list: number[], value: number, action: string, day?: number) =>
      `<select data-action="${action}" data-item="${st.id}"${day === undefined ? '' : ` data-day="${day}"`} aria-label="${
        day === undefined ? '' : `${WEEKDAY_SHORT[day]}, `
      }${action.endsWith('from') ? 'с' : 'до'}">${list
        .map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m % MINUTES_PER_DAY)}${m >= MINUTES_PER_DAY ? ' ночи' : ''}</option>`)
        .join('')}</select>`;
    const fromList = Array.from({ length: 18 }, (_, k) => hm(6) + k * 60); // 06:00…23:00
    const toList = Array.from({ length: 23 }, (_, k) => hm(7) + k * 60); // 07:00…05:00
    const s = st.schedule;
    const byDay = this.staffByDay.has(st.id) || !!s.windows?.some((w, d) => w && s.days[d]);
    const dayRows = byDay
      ? `<ul class="week-hours staff-days">${s.days
          .map((on, d) => {
            if (!on) return '';
            const w = windowOn(s, d)!;
            const own = !!s.windows?.[d];
            return `<li class="${d === cafe.weekday ? 'today' : ''}${own ? ' own' : ''}"><b>${WEEKDAY_SHORT[d]}</b>${hours(fromList, w.from, 'staff-wfrom', d)}<span>—</span>${hours(toList, w.to, 'staff-wto', d)}</li>`;
          })
          .join('')}</ul>
          <button class="link" data-action="staff-same" data-item="${st.id}">Одинаково каждый день</button>`
      : `<button class="link" data-action="staff-by-day" data-item="${st.id}">Свои часы по${NB}дням</button>`;
    const hourly =
      st.contract === 'hourly'
        ? `${byDay ? `<small>Обычные часы</small>` : ''}<div class="row hours staff-hours">${hours(fromList, s.from, 'staff-from')}<span>—</span>${hours(toList, s.to, 'staff-to')}</div>
           ${dayRows}
           <div class="row"><small class="grow">Разовый вызов — только на${NB}сегодня, график не${NB}меняется</small>
           <button class="small ${working ? 'ghost' : ''}" data-action="duty" data-item="${st.id}">${working ? 'Отпустить сейчас' : 'Вызвать сейчас'}</button></div>`
        : '';
    return `<li class="staff-card">
      <div class="row"><div class="grow"><b>Бариста ${i + 1} · ${st.contract === 'shift' ? 'на смене' : 'почасово'}</b>
        <small data-live="staff-${st.id}"></small></div>
        <button class="icon" data-action="fire" data-item="${st.id}" aria-label="Уволить">✕</button></div>
      <div class="chips">${days}</div>
      ${hourly}
    </li>`;
  }

  /** Первая неделя почти всегда в минусе — говорим об этом, чтобы не бросали на третий день */
  private firstWeekNote(r: DayReport): string {
    const first = this.sim.reports.find((x) => x.opened);
    if (!first || !r.opened || r.profit >= 0 || r.day - first.day >= 7) return '';
    return `<p class="first-week">Первая неделя почти всегда в${NB}минусе: вывеска, реклама и${NB}стартовые закупки${NB}— это вложения в${NB}известность. Смотри не${NB}на${NB}итог, а${NB}растёт ли число гостей и${NB}тех, кто о${NB}тебе знает.</p>`;
  }

  /** Событие ждёт решения — напоминание на обзоре */
  private eventBanner(): string {
    const e = this.sim.pendingEvent;
    if (!e) return '';
    const c = card(e);
    return `<div class="event-banner"><span>${c.icon}</span><div class="grow"><b>${c.title}</b><small>Ждёт решения до${NB}конца дня</small></div>
      <button class="small" data-action="event">Решить</button></div>`;
  }

  /** Знакомые лица: кто они, ходят ли к тебе, что любят */
  private facesBlock(): string {
    const sim = this.sim;
    const rows = sim.regulars
      .map((g) => {
        const r = sim.residents[g.residentId];
        const fav = itemName(r.favorites[g.usual]);
        const cls = g.status === 'regular' ? 'on' : g.status === 'lost' ? 'neg' : '';
        return `<li class="face" data-action="face" data-item="${r.id}">
          ${portrait(r, true, 'md')}
          <div class="grow"><b>${r.name}</b><small>${g.trait} · любит: ${fav.toLowerCase()}</small></div>
          <span class="badge ${cls}">${statusText(g.status, r.name)}</span>
        </li>`;
      })
      .join('');
    return `<h4>Знакомые лица</h4>
      <small>Шесть жителей, за${NB}которыми видно, как к${NB}тебе привыкают. На${NB}карте — со${NB}звёздочкой, золотой у${NB}постоянных.</small>
      <ul class="menu faces">${rows}</ul>
      <h4>Маркетинг</h4>`;
  }

  /** Вехи первой точки и улучшения, которые они открывают */
  private growthTab(): string {
    const sim = this.sim;
    const ctx = (id: (typeof MILESTONES)[number]['id']) => sim.milestoneProgress(id);
    const ms = MILESTONES.map((m) => {
      const reached = sim.milestones[m.id];
      const [done, target] = ctx(m.id);
      const now = m.now?.({
        reports: sim.reports,
        loyal: sim.loyalCount,
        aware: sim.awareCount,
        population: sim.residents.length,
        cash: sim.cash,
        startCash: ECONOMY.startCash,
      });
      const opens = UPGRADES.find((u) => u.unlock === m.id && u.premises.includes(sim.cafe.premisesId));
      const progress =
        reached !== undefined
          ? `<span class="badge on">день ${reached}</span>`
          : target > 1
            ? `<span class="badge">${m.id === 'cushion' ? `${Math.round((done / target) * 100)}${NB}%` : `${Math.min(done, target)}${NB}из${NB}${target}`}</span>`
            : '';
      const bar =
        reached === undefined && target > 1
          ? `<div class="meter"><i style="width:${Math.min(100, Math.round((done / target) * 100))}%"></i></div>`
          : '';
      return `<li class="milestone ${reached !== undefined ? 'done' : ''}">
        <div class="row">${namedIcon(`ms-${m.id}`, 'icon ms')}<b class="grow">${reached !== undefined ? '✓ ' : ''}${m.title}</b>${progress}</div>
        <small>${m.hint}${now && reached === undefined ? ` · ${now}` : ''}${opens ? ` · открывает: ${opens.name.toLowerCase()}` : ''}</small>
        ${bar}
      </li>`;
    }).join('');
    const kiosk = sim.cafe.premisesId === 'kiosk';
    const ups = UPGRADES.map((u) => {
      const st = sim.upgradeState(u.id);
      // У киоска улучшения живут во вкладке «Стойка»
      if (st === 'premises' || kiosk) return '';
      const badge = st === 'owned' ? '<span class="badge on">куплено</span>' : `<span class="badge">${money(u.cost)}</span>`;
      const control =
        st === 'owned'
          ? ''
          : st === 'locked'
            ? `<small class="lock">Откроется после вехи «${milestone(u.unlock!).title}»</small>`
            : `<button class="small" data-action="buy-upgrade" data-item="${u.id}" ${st === 'money' ? 'disabled' : ''}>${
                st === 'money' ? `Не${NB}хватает денег` : `Купить за${NB}${money(u.cost)}`
              }</button>`;
      return `<li class="upgrade"><div class="row">${namedIcon(`eq-${u.id}`)}<b class="grow">${u.name}</b>${badge}</div><small>${u.effect}</small>${control}</li>`;
    }).join('');
    const count = Object.keys(sim.milestones).length;
    return `
      <h4>Вехи первой точки · ${count}${NB}из${NB}${MILESTONES.length}</h4>
      <ul class="menu milestones">${ms}</ul>
      <h4>Улучшения</h4>
      ${
        kiosk
          ? `<small>Улучшения киоска${NB}— во${NB}вкладке «Стойка»: там видно, где что стоит.</small>
             <button class="secondary" data-action="tab" data-item="stand">Открыть стойку</button>`
          : `<small>Покупаются один раз и${NB}меняют возможности заведения. Это вложение: в${NB}прибыль дня не${NB}входит, но${NB}из${NB}кассы уходит.</small>
      <ul class="menu upgrades">${ups}</ul>`
      }
      ${this.loanBlock()}`;
  }

  /** Кредит: текущий долг и платежи или предложения банка и частника */
  private loanBlock(): string {
    const sim = this.sim;
    if (!sim.cafe.opened) return '';
    const head = `<h4 id="loan">Кредит</h4><small>Помощь, чтобы пережить трудную неделю или вложиться в${NB}рост. Один кредит за${NB}раз, проценты${NB}— расход дня.</small>`;
    const l = sim.loan;
    if (l) {
      const pay = weeklyPayment(l);
      const next = Math.min(l.left, pay.principal) + pay.interest;
      return `${head}<div class="loan on">
          <div class="row"><b class="grow">${LOAN_LABEL[l.source]} · ${money(l.amount)}</b><span class="badge">${l.paidWeeks}${NB}из${NB}${LOAN_TERMS[l.source].weeks}${NB}нед.</span></div>
          <small>Осталось вернуть ${money(l.left)}. Следующий платёж ${money(next)} (из${NB}них проценты ${money(pay.interest)})${NB}— в${NB}конце дня ${l.nextDue}.${
            l.late ? ` Просрочек: ${l.late}${NB}— каждая добавляет штраф к${NB}долгу.` : ''
          }</small>
          <button class="small" data-action="loan-repay" ${sim.cash < l.left ? 'disabled' : ''}>${sim.cash < l.left ? `На${NB}досрочное погашение нужно ${money(l.left)}` : `Погасить досрочно · ${money(l.left)}`}</button>
        </div>`;
    }
    const diag = cashDiagnosis(sim.reports);
    const span = `${diag.span}${NB}дн.`;
    const diagText =
      diag.kind === 'early'
        ? `Точка работает меньше трёх дней${NB}— пока не${NB}видно, хватит ли прибыли на${NB}платежи.`
        : diag.kind === 'profit'
          ? `За${NB}последние ${span} точка заработала <b>${money(diag.weekProfit)}</b>${
              diag.invested > 0 ? `, а${NB}${money(diag.invested)} ушло во${NB}вложения. Кредит поможет пережить разрыв, пока они окупаются.` : `${NB}— платить есть из${NB}чего.`
            }`
          : `За${NB}последние ${span} точка сама в${NB}минусе: <b>${money(diag.weekProfit)}</b>. Кредит отложит закрытие, но${NB}не${NB}исправит его${NB}— сначала посмотри в${NB}отчёте, почему гости не${NB}заходят.`;
    const diagBlock = `<p class="loan-diag ${diag.kind}">${diagText}</p>`;
    const offers = (['bank', 'private'] as LoanSource[])
      .map((src) => {
        const o = sim.loanOffer(src);
        const t = LOAN_TERMS[src];
        const terms = `${t.weeks}${NB}нед., ${Math.round(t.weeklyRate * 100)}${NB}% в${NB}неделю`;
        const about = src === 'bank' ? `Сумма зависит от${NB}истории: недели в${NB}плюсе, вехи, платежи вовремя.` : `Даёт сразу и${NB}всем, но${NB}дорого. Не${NB}больше ${LOAN.privateTimes}${NB}раз за${NB}игру, просрочка${NB}— штраф 10${NB}% долга.`;
        if (o.refusal) return `<li class="loan"><div class="row"><b class="grow">${LOAN_LABEL[src]}</b><span class="badge">${terms}</span></div><small>${o.refusal}</small></li>`;
        const amount = Math.min(o.max, Math.max(t.min, this.loanAmount[src] ?? Math.min(o.max, 30_000)));
        this.loanAmount[src] = amount;
        const extra = totalInterest(src, amount);
        const pay = weeklyPayment({ source: src, amount });
        const weekly = pay.principal + pay.interest;
        const left = paymentLeft(diag, weekly);
        const fit =
          left === null
            ? ''
            : left >= 0
              ? `<small>При${NB}прибыли как за${NB}последнюю неделю после платежа останется ${money(left)} в${NB}неделю.</small>`
              : warnLine(`Платёж ${money(weekly)} в${NB}неделю больше недельной прибыли (${money(left + weekly)})${NB}— платить придётся из${NB}кассы`);
        return `<li class="loan"><div class="row"><b class="grow">${LOAN_LABEL[src]}</b><span class="badge">${terms}</span></div>
            <small>${about} Сейчас дадут до${NB}${money(o.max)}.</small>
            <div class="row"><span class="grow">Сумма</span><div class="stepper">
              <button data-action="loan-down" data-item="${src}" aria-label="Меньше">−</button><span>${money(amount)}</span>
              <button data-action="loan-up" data-item="${src}" aria-label="Больше">+</button></div></div>
            <small>Вернёшь ${money(amount + extra)}: ${t.weeks}${NB}${t.weeks % 10 >= 2 && t.weeks % 10 <= 4 && (t.weeks < 10 || t.weeks > 20) ? 'платежа' : 'платежей'} по${NB}${money(weeklyPayment({ source: src, amount }).principal + weeklyPayment({ source: src, amount }).interest)}, переплата ${money(extra)}.</small>
            ${fit}
            <button class="small" data-action="loan-take" data-item="${src}">Взять ${money(amount)}</button></li>`;
      })
      .join('');
    return `${head}${diagBlock}<ul class="menu loans">${offers}</ul>`;
  }

  /** История знакомого лица для карточки жителя */
  private faceCard(g: Regular, r: Resident): string {
    const f = isFemale(r);
    const today = dayNumber(this.sim.time);
    const notes = g.history
      .slice(-6)
      .reverse()
      .map((n) => {
        const when = `${n.day === today ? 'сегодня' : `день ${n.day}`}, ${fmtMinute(n.minute)}`;
        const what = n.ok
          ? `${n.itemId ? itemName(n.itemId) : ''}`
          : `не${NB}${f ? 'зашла' : 'зашёл'}: ${REJECT_LABEL[n.reason!].toLowerCase()}`;
        return `<li class="${n.ok ? 'ok' : 'no'}"><span>${when}</span>${what}</li>`;
      })
      .join('');
    const fav = itemName(r.favorites[g.usual]);
    return `<div class="face-card">
        <div class="row"><b class="grow">★ ${g.trait}</b><span class="badge ${g.status === 'regular' ? 'on' : g.status === 'lost' ? 'neg' : ''}">${statusText(g.status, r.name)}</span></div>
        <small>Обычно берёт ${USUAL[g.usual]}, любимое — ${fav.toLowerCase()}.${
          g.status === 'lost' && g.lostReason ? ` Перестал${f ? 'а' : ''} заходить: ${REJECT_LABEL[g.lostReason].toLowerCase()}.` : ''
        }</small>
        ${notes ? `<ul class="history">${notes}</ul>` : `<small>${r.aware ? `Ещё ни${NB}разу не${NB}${f ? 'хотела' : 'хотел'} зайти` : `О${NB}кафе пока не${NB}знает`}</small>`}
      </div>`;
  }

  private marketingTab(): string {
    const { marketing: mk } = this.sim;
    const total = this.sim.residents.length;
    const aware = this.sim.awareCount;
    this.live.aware = `${aware} из ${total}`;
    this.liveWidth.awarebar = `${Math.round((aware / total) * 100)}%`;
    this.live.mkt = money(this.sim.cafe.today.marketing);
    const happy = mk.happy;
    const hours = Array.from({ length: 17 }, (_, i) => hm(7) + i * 60); // 07:00…23:00
    const opt = (v: number | undefined) =>
      hours.map((m) => `<option value="${m}" ${m === v ? 'selected' : ''}>${fmtMinute(m)}</option>`).join('');
    const disc = [0, 0.1, 0.2, 0.3]
      .map((d) => `<option value="${d}" ${(happy?.discount ?? 0) === d ? 'selected' : ''}>${d === 0 ? 'выкл.' : `−${d * 100}${NB}%`}</option>`)
      .join('');
    const channel = (title: string, note: string, control: string, icon: string) =>
      `<li>${namedIcon(icon)}<div class="grow"><b>${title}</b><small>${note}</small></div>${control}</li>`;
    return `
      <div class="aware">
        <div class="row"><span class="grow">Знают о${NB}кафе</span><b data-live="aware"></b></div>
        <div class="meter"><i data-live-width="awarebar"></i></div>
        <small>Кто не${NB}знает, тот не${NB}зайдёт, даже если очень хочет кофе.</small>
      </div>
      <h4>Как узнают</h4>
      <ul class="menu">
        ${channel(
          'Вывеска',
          `Прохожие замечают кафе втрое чаще. Разово ${money(MARKETING.signCost)}`,
          mk.sign ? '<span class="badge on">висит</span>' : `<button class="small" data-action="sign">Повесить</button>`,
          'mk-sign',
        )}
        ${channel(
          `Листовки у${NB}метро`,
          `Утром и${NB}вечером — узнают офисные. ${money(MARKETING.flyersPerDay)} в${NB}день`,
          `<button class="small ${mk.flyers ? 'ghost' : ''}" data-action="flyers">${mk.flyers ? 'Остановить' : 'Раздавать'}</button>`,
          'mk-flyers',
        )}
        ${channel(
          'Соцсети',
          `Узнают молодёжь и${NB}студенты. ${money(MARKETING.socialCampaign)} за${NB}${MARKETING.socialDays}${NB}дней`,
          mk.socialDaysLeft > 0
            ? `<span class="badge on">ещё ${mk.socialDaysLeft}${NB}дн.</span>`
            : `<button class="small" data-action="social">Запустить</button>`,
          'mk-social',
        )}
        ${channel('Сарафан', `Постоянные гости сами рассказывают соседям и${NB}коллегам. Бесплатно`, '<span class="badge on">работает</span>', 'mk-word')}
      </ul>
      <h4>Акции</h4>
      <ul class="menu">
        <li>${namedIcon('mk-happy')}<div class="grow"><b>Счастливые часы</b><small>Скидка на${NB}всё меню в${NB}выбранное время — чтобы заполнить пустые часы</small>
          <div class="row hours happy">
            <select data-action="happy-from" aria-label="С">${opt(happy?.from ?? hm(15))}</select><span>—</span>
            <select data-action="happy-to" aria-label="До">${opt(happy?.to ?? hm(17))}</select>
            <select data-action="happy-disc" aria-label="Скидка">${disc}</select>
          </div></div></li>
        ${channel(
          'Карта лояльности',
          `Каждый ${MARKETING.loyaltyEvery}-й кофе в${NB}подарок. Постоянные возвращаются чаще и${NB}охотнее рассказывают о${NB}тебе`,
          `<button class="small ${mk.loyaltyCard ? 'ghost' : ''}" data-action="card">${mk.loyaltyCard ? 'Выключить' : 'Включить'}</button>`,
          'mk-loyalty',
        )}
      </ul>
      <p class="wages">Сегодня на${NB}маркетинг: <b data-live="mkt"></b></p>`;
  }

  private restartBlock(): string {
    return this.confirmRestart
      ? `<div class="restart"><small>Кафе, деньги и${NB}весь прогресс сотрутся.</small>
          <div class="hire"><button class="small" data-action="restart-ask">Отмена</button>
          <button class="small danger" data-action="restart">Да, начать заново</button></div></div>`
      : `<div class="links">
           <button class="link" data-action="feedback">Предложить идею</button>
           <button class="link" data-action="tutorial">Как играть</button>
           <button class="link" data-action="restart-ask">Начать заново</button>
         </div>
         ${this.challenge ? '' : this.transferBlock()}
         ${
           this.challenge
             ? `<div class="links">${savedResult() ? `<button class="link" data-action="challenge-result">Мой итог испытания</button>` : ''}<button class="link" data-action="normal-game">К${NB}обычной игре</button></div>`
             : `<div class="links"><button class="link" data-action="challenge">🏆 ${CHALLENGE.title}</button></div>`
         }
         <small class="saved">Игра сохраняется автоматически в${NB}этом браузере</small>`;
  }

  /** Перенос игры файлом: на другой телефон или компьютер, на новый адрес игры. В испытании не нужен */
  private transferBlock(): string {
    if (!this.transfer) return `<div class="links"><button class="link" data-action="transfer">Перенести игру на${NB}другое устройство</button></div>`;
    return `<div class="restart transfer">
        <small>Скачай файл с${NB}игрой и${NB}открой его на${NB}другом устройстве или по${NB}новому адресу игры — кафе, деньги и${NB}жители будут на${NB}месте.</small>
        <div class="hire">
          <button class="small" data-action="save-export">Скачать файл</button>
          <label class="small button-like">Загрузить файл<input type="file" accept=".json,application/json" data-action="save-import" hidden /></label>
          <button class="small ghost" data-action="transfer">Закрыть</button>
        </div>
        <small class="transfer-note">Загрузка заменит текущую игру в${NB}этом браузере.</small>
        ${this.transferError ? `<small class="transfer-error">${escapeHtml(this.transferError)}</small>` : ''}
      </div>`;
  }

  /** На экране выбора помещения: что за испытание и как считается итог */
  private challengeBanner(): string {
    if (!this.challenge) return '';
    return `<div class="event-banner"><span>🏆</span><div class="grow"><b>${CHALLENGE.title}</b>
      <small>У${NB}всех тот же город: те же жители, погода и${NB}события. Итог${NB}— касса в${NB}конце ${CHALLENGE.days}-го дня.</small></div></div>`;
  }

  /** Что кончается или испортится — подсказка на обзоре */
  private stockWarning(): string {
    const { stock, menu } = this.sim.cafe;
    const cant = menu.filter((m) => !stock.canMake(m.id)).map((m) => m.name);
    if (cant.length) return `⚠ Нет в${NB}наличии: ${cant.join(', ')}. Закажи на${NB}складе`;
    return 'Склад в порядке';
  }

  private stockTab(): string {
    const cafe = this.sim.cafe;
    const { stock } = cafe;
    const day = dayNumber(this.sim.time);
    const menuIds = cafe.menu.map((m) => m.id);
    const use = dailyUse(this.sim.reports);

    // Сколько можно приготовить: каждая позиция отдельно, ингредиенты у них общие
    const cook = cafe.menu
      .map((m) => {
        const c = cookable(stock, m.id);
        const low = c.portions < 10;
        const why =
          c.limit === null
            ? ''
            : c.portions === 0
              ? c.afterDelivery > 0
                ? `нет — ${INGREDIENT_ACC[c.limit]} привезут к${NB}6:00`
                : `нет — кончилось: ${ingredient(c.limit).name.toLowerCase()}`
              : `упирается в${NB}${INGREDIENT_ACC[c.limit]}`;
        return `<li class="${c.portions === 0 ? 'out' : low ? 'low' : ''}">${iconImg(m.id)}<div class="grow"><b>${m.name}</b><small>${why}</small></div>
          <b class="n">${c.portions}</b></li>`;
      })
      .join('');

    const rows = ingredientOrder(menuIds).map((id) => {
      const ing = ingredient(id);
      const q = stock.qty(id);
      const exp = ing.shelfDays === null ? 0 : stock.expiringToday(id, day);
      const pend = stock.pending[id] ?? 0;
      const goes = usedIn(menuIds, id);
      const left = daysLeft(stock, id, use);
      this.live[`st-${id}`] = `${Math.floor(q)}`;
      this.live[`stx-${id}`] =
        [exp > 0 ? `испортится сегодня: ${Math.round(exp)}` : '', pend > 0 ? `едет к${NB}6:00: ${pend}` : '']
          .filter(Boolean)
          .join(' · ') || ' ';
      const step = id === 'bakery' ? 2 : 5;
      const keep = (weekend: boolean) => {
        const v = weekend ? stock.keepWeekend[id] : stock.keep[id];
        return `<div class="stepper mini">
          <button data-action="keep-down" data-item="${id}" data-weekend="${weekend}" data-step="${step}" aria-label="Меньше">−</button>
          <span>${v}</span>
          <button data-action="keep-up" data-item="${id}" data-weekend="${weekend}" data-step="${step}" aria-label="Больше">+</button>
        </div>`;
      };
      const life = ing.shelfDays === null ? `не${NB}портится` : `хранится ${ing.shelfDays}${NB}дн.`;
      // Главное число — на сколько рабочих дней хватит при нынешнем расходе
      const lasts =
        goes.length === 0
          ? `не${NB}нужно для${NB}меню`
          : left === null
            ? use
              ? `не${NB}расходовалось`
              : `расход пока неизвестен`
            : left < 1
              ? `<b class="bad">хватит меньше чем на${NB}день</b>`
              : `хватит на${NB}<b>${daysText(left)}</b>`;
      const u = use?.[id] ?? 0;
      const perDay = u > 0 ? ` · уходит ${u < 1 ? `меньше 1` : `~${Math.round(u)}`}${NB}в${NB}день` : '';
      return `<li class="${goes.length ? '' : 'unused'}${left !== null && left < 1 ? ' short' : ''}">
        <div class="row">${namedIcon(ingredientIcon(id))}<div class="grow"><b>${ing.name}</b>
          <small>${lasts}${perDay}</small></div>
          <div class="qty"><b data-live="st-${id}"></b><small>порц.</small></div></div>
        ${goes.length ? `<div class="goes"><small>идёт в</small>${goes.map((g) => iconImg(g, 'icon mini')).join('')}</div>` : ''}
        <small class="exp" data-live="stx-${id}"></small>
        <small>${life} · ${money(ing.unitCost)} за${NB}порцию</small>
        <div class="row keep"><small>Держать: будни</small>${keep(false)}<small>вых.</small>${keep(true)}</div>
        ${warnLine(orderWarning(cafe, id, this.sim.minute))}
        <div class="row orders">
          ${[20, 100, 300]
            .map((n) => `<button class="small" data-action="order" data-item="${id}" data-qty="${n}">+${n} · ${money(orderPrice(id, n))}</button>`)
            .join('')}
          <button class="icon" data-action="cancel-order" data-item="${id}" aria-label="Отменить заказ">✕</button>
        </div>
      </li>`;
    }).join('');
    return `
      <h4>Можно приготовить</h4>
      <small>Сколько порций выйдет, если готовить только эту позицию: ингредиенты у${NB}позиций общие, поэтому числа не${NB}складываются.</small>
      <ul class="menu cookable">${cook}</ul>
      <h4>Ингредиенты</h4>
      <small>«Хватит на» — с${NB}тем, что едет, при расходе последних ${USE_DAYS}${NB}рабочих дней. Поставщик привозит заказ в${NB}6:00. Опт: от${NB}100${NB}порций −10${NB}%, от${NB}300 — −20${NB}%.
        Скоропорт в${NB}конце срока списывается. Автозаказ каждую ночь добирает склад до${NB}уровня «держать» —
        отдельно на${NB}будни и${NB}выходные.</small>
      <ul class="menu stock">${rows}</ul>`;
  }

  /** Касса на исходе или в минусе: сколько осталось и что можно сделать */
  private cashWarning(): string {
    const sim = this.sim;
    if (!sim.cafe.opened || sim.bankrupt) return '';
    const o = sim.cashOutlook();
    let head: string;
    if (sim.cash < 0) {
      head =
        o.inRed > 0
          ? `Касса в${NB}минусе ${o.inRed}-й день. Если на${NB}${ECONOMY.bankruptDays}-й день не${NB}выйти в${NB}плюс — банкротство.`
          : `Касса в${NB}минусе. Если к${NB}концу дня не${NB}выйти в${NB}плюс, пойдёт отсчёт: ${ECONOMY.bankruptDays}${NB}дня подряд — банкротство.`;
    } else if (o.days <= 3) {
      head = `Денег хватит примерно на${NB}${o.days}${NB}дн. постоянных расходов — ${money(o.daily)} в${NB}день.`;
    } else return '';
    const options: string[] = [];
    if (!sim.loan) options.push(`<button class="small" data-action="goto-tab" data-item="growth">Кредит</button>`);
    if (sim.marketing.flyers) options.push(`<button class="small" data-action="flyers">Остановить листовки</button>`);
    if (sim.cafe.staff.length) options.push(`<button class="small" data-action="goto-tab" data-item="staff">Персонал</button>`);
    options.push(`<button class="small" data-action="goto-tab" data-item="stock">Снизить запасы</button>`);
    options.push(`<button class="small" data-action="goto-tab" data-item="overview">Часы работы</button>`);
    return `<div class="cash-warn"><b>${head}</b>
      <small>Что можно сделать: меньше часов в${NB}пустое время, отпустить бариста, не${NB}держать лишний запас, остановить платную рекламу. Пережить трудную неделю поможет кредит${NB}— вкладка «Развитие».</small>
      <div class="hire">${options.join('')}</div></div>`;
  }

  private changeRow(c: Change): string {
    const what = c.toggle || c.from === undefined ? `${c.text}${c.to ? ` — ${c.to}` : ''}` : `${c.text}: ${c.from} → ${c.to}`;
    return `<li><span class="t">${fmtMinute(c.minute)}</span><div><span>${what}</span>${c.when ? `<small>${c.when}</small>` : ''}</div></li>`;
  }

  /** Гости и потери по часам: зелёное — обслужены, красное — ушли (без «не сегодня») */
  private hourChart(r: DayReport): string {
    const served = r.servedHour;
    if (!served || !r.lostHour) return '';
    const lost = new Array<number>(24).fill(0);
    for (const [reason, hours] of Object.entries(r.lostHour) as [RejectReason, number[]][]) {
      if (reason === 'mood' || (r.opened && reason === 'not-open')) continue;
      hours.forEach((n, h) => (lost[h] += n));
    }
    const hours = Array.from({ length: 24 }, (_, i) => (i + 6) % 24); // с 06:00 до 05:00
    const max = Math.max(1, ...hours.map((h) => served[h] + lost[h]));
    const bars = hours
      .map((h) => {
        const g = Math.round((served[h] / max) * 56);
        const l = Math.round((lost[h] / max) * 56);
        const title = `${String(h).padStart(2, '0')}:00 — гостей ${served[h]}, ушли ${lost[h]}`;
        return `<div class="bar" title="${title}"><i class="lost" style="height:${l}px"></i><i class="served" style="height:${g}px"></i>${
          h % 3 === 0 ? `<span>${h}</span>` : ''
        }</div>`;
      })
      .join('');
    return `<div class="hours-chart">${bars}</div>
      <div class="legend-line"><span><i class="served"></i>${r.opened ? 'обслужены' : ''}</span><span><i class="lost"></i>${r.opened ? 'ушли' : `хотели зайти`}</span></div>`;
  }

  /** Чьи часы взять для «одинаково каждый день»: сегодняшние, а в выходной — ближайшего рабочего дня */
  private sameAsDay(): number {
    const cafe = this.sim.cafe;
    for (let i = 0; i < 7; i++) if (cafe.hoursOn(cafe.weekday + i)) return (cafe.weekday + i) % 7;
    return 0;
  }

  /** «Открыто до 20:00», «Закрыто до 08:00», «Выходной, откроемся в Пн в 08:00» */
  private statusText(minute: number, open: boolean): string {
    const cafe = this.sim.cafe;
    if (open) return cafe.allDay ? 'Круглосуточно' : `Открыто до ${fmtMinute(cafe.closeAt % MINUTES_PER_DAY)}`;
    const next = cafe.nextOpening(minute);
    if (!next) return 'Закрыто';
    const at = fmtMinute(next.at % MINUTES_PER_DAY);
    if (next.inDays === 0) return `Закрыто до ${at}`;
    const day = next.inDays === 1 ? 'завтра' : `в${NB}${WEEKDAY_SHORT[(cafe.weekday + next.inDays) % 7]}`;
    return `${cafe.dayOff ? 'Выходной' : 'Закрыто'}, откроемся ${day} в${NB}${at}`;
  }

  /** Какой отчёт открыт: [номер, первый, последний] — день или номер недели/месяца */
  private reportCursor(): [number, number, number] {
    const last = this.sim.reports.at(-1)!.day;
    if (this.reportPeriod === 'day') {
      const first = this.sim.reports[0].day;
      return [this.reportAt ?? last, first, last];
    }
    const max = periodOf(this.reportPeriod, last).index;
    return [this.reportAt ?? max, 1, max];
  }

  /** Отчёт: день, неделя или месяц */
  private reportScreen(): string {
    const [at] = this.reportCursor();
    if (this.reportPeriod === 'day') {
      const r = this.sim.reports.find((x) => x.day === at) ?? this.sim.reports.at(-1)!;
      return this.reportView(r);
    }
    return this.periodView(periodByIndex(this.reportPeriod, at));
  }

  /** Переключатель периода и стрелки назад-вперёд */
  private periodBar(): string {
    const [at, first, last] = this.reportCursor();
    const tabs = ([['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']] as const)
      .map(([id, label]) => `<button class="chip${this.reportPeriod === id ? ' on' : ''}" data-action="report-period" data-item="${id}">${label}</button>`)
      .join('');
    return `<div class="period-bar">
        <button class="icon" data-action="report-prev" aria-label="Раньше" ${at <= first ? 'disabled' : ''}>‹</button>
        <div class="chips">${tabs}</div>
        <button class="icon" data-action="report-next" aria-label="Позже" ${at >= last ? 'disabled' : ''}>›</button>
      </div>`;
  }

  /** «Итог недели: +18 024 ₽» — знак и цвет сразу, сравнение строкой ниже */
  private resultBlock(label: string, value: number, compare: string): string {
    const pos = value >= 0;
    return `<div class="result ${pos ? 'pos' : 'neg'}">
        <div><span>${label}:</span> <b>${pos ? '+' : '−'}${money(Math.abs(value))}</b></div>
        ${compare ? `<small>${compare}</small>` : ''}
      </div>`;
  }

  /** Неделя или месяц: итог, деньги по статьям, позиции, гости */
  private periodView(p: Period): string {
    const sim = this.sim;
    const priceOf = (id: string) => {
      const m = sim.cafe.menu.find((x) => x.id === id) ?? sim.cafe.own.find((x) => x.id === id) ?? CATALOG.find((x) => x.id === id);
      return m ? { price: m.price, cost: m.cost } : null;
    };
    const s = summarize(sim.reports, p, priceOf);
    const prev = p.index > 1 ? summarize(sim.reports, periodByIndex(p.kind, p.index - 1), priceOf) : null;
    const name = p.kind === 'week' ? `Неделя ${p.index}` : `Месяц ${p.index}`;
    const lastDay = s.days.at(-1)?.day ?? p.from;
    const head = `<div class="card-head"><div><b>${name}</b><small>${p.from}–${Math.min(p.to, lastDay)}${NB}день${
      s.complete ? '' : ` · идёт`
    } · ${num(s.guests)}${NB}гостей из${NB}${num(s.wanted)}, кто хотел зайти</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button></div>`;
    if (s.openDays === 0) return `${head}${this.periodBar()}<p class="hint-line">В${NB}этот период точка ещё не${NB}работала.</p>`;

    const avg = s.guests ? Math.round(s.revenue / s.guests) : 0;
    const kpis = `<div class="kpis">
        <div><small>Гостей</small><b>${num(s.guests)}</b></div>
        <div><small>Выручка</small><b>${money(s.revenue)}</b></div>
        ${p.kind === 'week' ? `<div><small>Средний чек</small><b>${money(avg)}</b></div>` : ''}
      </div>`;

    // Столбики: неделя — по дням, месяц — по неделям
    const short = (v: number) => `${v >= 0 ? '+' : '−'}${String(Math.round(Math.abs(v) / 100) / 10).replace('.', ',')}к`;
    const columns: [string, number][] =
      p.kind === 'week'
        ? s.days.map((r) => [WEEKDAY_SHORT[r.weekday ?? 0], r.profit])
        : [0, 1, 2, 3].map((i) => {
            const days = s.days.filter((r) => r.day >= p.from + i * 7 && r.day < p.from + (i + 1) * 7);
            return [`${i + 1}${NB}нед.`, days.reduce((x, r) => x + r.profit, 0)] as [string, number];
          }).filter((_, i) => s.days.some((r) => r.day >= p.from + i * 7));
    const top = Math.max(1, ...columns.map(([, v]) => Math.abs(v)));
    const bars = `<div class="bars">${columns
      .map(([label, v]) => `<div class="bar ${v >= 0 ? 'pos' : 'neg'}"><small>${short(v)}</small><i style="height:${Math.max(4, Math.round((Math.abs(v) / top) * 100))}%"></i><span>${label}</span></div>`)
      .join('')}</div>`;
    // Месяц: ещё итог каждого дня — над чертой плюс, под ней минус; выброс (день открытия) не ломает шкалу
    let daily = '';
    if (p.kind === 'month') {
      const vals = s.days.map((r) => r.profit);
      const sorted = vals.map(Math.abs).sort((a, b) => b - a);
      const scale = Math.max(1, sorted[1] ?? sorted[0] ?? 1);
      const clipped = (sorted[0] ?? 0) > scale * 1.5;
      daily = `<div class="split"><div class="spark">${vals
        .map((v) => {
          const h = Math.min(100, Math.round((Math.abs(v) / scale) * 100));
          return `<div><i class="up" style="height:${v >= 0 ? h : 0}%"></i><i class="down" style="height:${v < 0 ? h : 0}%"></i></div>`;
        })
        .join('')}</div><small>Итог каждого дня: над чертой${NB}— в${NB}плюсе, под${NB}ней${NB}— в${NB}минусе${
        clipped ? `. Самый большой день (${money(Math.round(vals.find((v) => Math.abs(v) === sorted[0])!))}) не${NB}влез в${NB}шкалу` : ''
      }.</small></div>`;
    }

    // Куда ушли деньги: из каждых 100 ₽ выручки
    const base = Math.max(1, s.revenue);
    const parts = COST_LINES.filter(([k]) => s.costs[k] > 0).map(([k, label]) => [k, label, s.costs[k]] as [string, string, number]);
    if (s.profit > 0) parts.push(['profit', 'Прибыль', s.profit]);
    const pct = (v: number) => Math.round((v / base) * 100);
    const split = `<div class="split"><small>Из каждых 100${NB}₽ выручки</small>
        <div class="split-bar">${parts.map(([k, , v]) => `<i class="c-${k}" style="flex:${Math.max(0.5, pct(v))}"></i>`).join('')}</div>
        <ul>${parts
          .map(([k, label, v]) => `<li><i class="c-${k}"></i><span>${label}</span><small>${pct(v)}${NB}%</small><b class="${k === 'profit' ? 'pos' : ''}">${k === 'profit' ? '+' : '−'}${money(v)}</b></li>`)
          .join('')}</ul>
        ${s.profit < 0 ? `<small class="neg">Расходы больше выручки: итог −${money(-s.profit)}</small>` : ''}
      </div>`;

    const notes = insights(s, itemName, (r) => REASON_BECAUSE[r] ?? REJECT_LABEL[r].toLowerCase());
    const maxMargin = Math.max(1, ...s.items.map((i) => i.margin));
    const items = s.items
      .map(
        (i) => `<li>${iconImg(i.id)}<div class="grow"><div class="row"><b class="grow">${escapeHtml(itemName(i.id))}</b><b class="pos">${money(i.margin)}</b></div>
          <i class="meter"><i style="width:${Math.max(2, Math.round((Math.max(0, i.margin) / maxMargin) * 100))}%"></i></i>
          <small>продано ${i.sold} · выручка ${money(i.revenue)}</small></div></li>`,
      )
      .join('');
    const fun = funnel(s);
    const funMax = Math.max(1, fun[0][1]);
    const funnelHtml = fun
      .map(([label, v]) => `<li><div class="row"><span class="grow">${label}</span><b>${num(v)}</b></div><i class="meter accent"><i style="width:${Math.round((v / funMax) * 100)}%"></i></i></li>`)
      .join('');
    const reasons = (Object.entries(s.missed) as [RejectReason, number][])
      .filter(([r]) => r !== 'not-open' && r !== 'mood')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const rMax = Math.max(1, reasons[0]?.[1] ?? 1);
    const reasonsHtml = reasons
      .map(([r, n]) => `<li><span>${REJECT_LABEL[r]}</span><i class="meter bad"><i style="width:${Math.round((n / rMax) * 100)}%"></i></i><b>${num(n)}</b></li>`)
      .join('');

    return `${head}
      ${this.periodBar()}
      ${this.resultBlock(p.kind === 'week' ? 'Итог недели' : 'Итог месяца', s.profit, compareLine(s, prev))}
      ${kpis}
      <h4>${p.kind === 'week' ? `Итог по${NB}дням` : `По${NB}неделям`}</h4>
      ${bars}
      ${daily}
      <h4>Куда ушли деньги</h4>
      ${split}
      ${notes.length ? `<h4>Главное</h4><ul class="observations">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${items ? `<h4>Что приносит деньги</h4><ul class="items-margin">${items}</ul><small>Зелёное${NB}— маржа: выручка минус себестоимость</small>` : ''}
      <h4>Гости: от${NB}желания до${NB}покупки</h4><ul class="funnel">${funnelHtml}</ul>
      ${reasonsHtml ? `<h4>Почему не${NB}зашли</h4><ul class="reason-bars">${reasonsHtml}</ul>` : ''}`;
  }

  private reportView(r: DayReport): string {
    const row = (label: string, value: number, cls = '') =>
      `<tr class="${cls}"><td>${label}</td><td>${money(value)}</td></tr>`;
    const a = analyzeDay(this.sim.reports, r);
    const missed = (Object.entries(r.missed) as [RejectReason, number][])
      .filter(([reason]) => r.opened || reason === 'not-open')
      .sort((x, y) => y[1] - x[1])
      .map(([reason, n]) => `<li><b>${n}</b><div><span>${REJECT_LABEL[reason]}</span><small>${REASON_HINT[reason]}</small></div></li>`)
      .join('');
    const missing = (Object.entries(r.missingKinds) as [ItemKind, number][])
      .sort((x, y) => y[1] - x[1])
      .map(([kind, n]) => {
        const need = equipmentFor(kind);
        const hint = need && !this.sim.cafe.equipment.includes(need) && this.sim.cafe.premises.kinds.includes(kind) ? `<small>нужно: ${EQUIPMENT[need].name.toLowerCase()}</small>` : '';
        return `<li><span>${KIND_TITLE[kind]}${hint}</span><b>${n}</b></li>`;
      })
      .join('');
    const sold = [...CATALOG, ...this.sim.cafe.own]
      .filter((m) => r.sold[m.id])
      .map((m) => `<li><span>${m.name}</span><b>${r.sold[m.id]}</b></li>`)
      .join('');
    const learnedEntries = (Object.entries(r.newAware) as [AwareSource, number][]).filter(([src]) => src !== 'start');
    const learnedTotal = learnedEntries.reduce((x, [, n]) => x + n, 0);
    const learned = learnedEntries.map(([src, n]) => `<li>${namedIcon(AWARE_ICON[src], 'icon mini')}<span>${AWARE_LABEL[src]}</span><b>${n}</b></li>`).join('');
    const spoiled = (Object.entries(r.writtenOffItems) as [IngredientId, number][])
      .map(([id, q]) => `${INGREDIENTS.find((i) => i.id === id)!.name.toLowerCase()} ${q}`)
      .join(', ');
    const kinds = a.byKind
      .slice(0, 5)
      .map(
        ([kind, n, reason]) =>
          `<li>${namedIcon(`job-${kind}`, 'icon mini')}<span>${KIND_LABEL[kind]}</span><small>${REJECT_LABEL[reason].toLowerCase()}</small><b>${n}</b></li>`,
      )
      .join('');
    const changes = (r.changes ?? []).map((c) => this.changeRow(c)).join('');
    const next = r.day + 1;
    const forecast = r.forecast
      ? `<div class="forecast"><small>Завтра · ${WEEKDAY_FULL[weekday(next)]}</small>
          <b>${weatherShort(r.forecast)} ${WEATHER_LABEL[r.forecast.kind]}</b>
          <span>${WEATHER_HINT[r.forecast.kind]}${
            isWeekend(next) ? `. Выходной: офисные не${NB}придут, зато больше гуляют` : ''
          }</span></div>`
      : '';

    return `
      <div class="card-head"><div><b>Итоги дня ${r.day}</b><small>${r.weekday !== undefined ? WEEKDAY_FULL[r.weekday] : ''}${
        r.weather ? ` · ${weatherShort(r.weather)} ${WEATHER_LABEL[r.weather.kind].toLowerCase()}` : ''
      } · ${r.guests} гостей из ${r.wanted}, кто хотел зайти</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button></div>
      ${this.cashWarning()}
      ${this.periodBar()}
      ${r.opened ? this.resultBlock('Итог дня', r.profit, a.compare) : ''}
      <div class="insight">
        ${r.opened ? '' : `<b>${a.headline}</b>`}
        ${a.factor ? `<p>${a.factor}</p>` : ''}
        ${this.firstWeekNote(r)}
      </div>
      ${(r.milestones ?? []).map((id) => `<div class="milestone-hit">Веха: <b>${milestone(id).title}</b>${
        UPGRADES.some((u) => u.unlock === id && u.premises.includes(this.sim.cafe.premisesId))
          ? ` · <button class="link" data-action="goto-tab" data-item="growth">открыто улучшение</button>`
          : ''
      }</div>`).join('')}
      ${r.events?.length ? `<h4>События дня</h4><ul class="news">${r.events.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${r.news?.length ? `<h4>Знакомые лица</h4><ul class="news">${r.news.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${this.hourChart(r)}
      ${r.rivalGuests !== undefined ? `<p class="rival-line">У${NB}конкурента сегодня гостей: <b>${r.rivalGuests}</b>${r.rivalPromo ? ` (шла акция)` : ''}${r.missed.rival ? ` · ушли к${NB}нему от${NB}тебя: <b>${r.missed.rival}</b>` : ''}</p>` : ''}
      ${a.lost ? `<p class="lost-line">${describeLost(a.lost)}</p>` : ''}
      ${a.observations.length ? `<h4>Стоит проверить</h4><ul class="observations">${a.observations.map((o) => `<li>${o}</li>`).join('')}</ul>` : ''}
      ${changes ? `<h4>Изменения за${NB}день</h4><ul class="changes">${changes}</ul>` : ''}
      ${forecast}
      ${
        r.opened
          ? `<h4>Деньги</h4><table class="pnl">
        ${row('Выручка', r.revenue)}
        ${row('Закупка продуктов', -r.purchases)}
        ${row('Аренда', -r.rent)}
        ${row('Коммуналка', -r.utilities)}
        ${r.wages ? row('Зарплата', -r.wages) : ''}
        ${row(`Налог 6${NB}%`, -r.tax)}
        ${r.marketing ? row('Маркетинг', -r.marketing) : ''}
        ${r.other ? row('События', -r.other) : ''}
        ${r.interest ? row('Проценты по${NB}кредиту', -r.interest) : ''}
        ${row('Итог дня', r.profit, r.profit >= 0 ? 'total pos' : 'total neg')}
        ${r.invested ? row('Вложено в улучшения', -r.invested) : ''}
        ${r.loanTaken ? row('Взят кредит', r.loanTaken) : ''}
        ${r.loanPaid ? row('Возврат долга', -r.loanPaid) : ''}
        ${r.loanFine ? row('Штраф за${NB}просрочку (к${NB}долгу)', -r.loanFine) : ''}
        ${row('В кассе', r.cashAfter, 'cash')}
      </table>
      <small>Себестоимость проданного: ${money(r.cogs)}${r.extras ? ` · дозаказов: ${r.extras}` : ''}${r.company ? ` · пришли с${NB}постоянными: ${r.company}` : ''}${
        r.writtenOff ? ` · списано (испортилось): ${money(r.writtenOff)} — ${spoiled}` : ''
      }</small>`
          : ''
      }
      ${kinds ? `<h4>${r.opened ? `Кто не${NB}зашёл` : `Кто хотел зайти`}</h4><ul class="kinds">${kinds}</ul>` : ''}
      ${missed ? `<h4>Не${NB}зашли — почему</h4><ul class="reasons">${missed}</ul>` : ''}
      ${learned ? `<h4>Узнали о${NB}кафе: +${learnedTotal} · всего ${r.awareCount} из ${this.sim.residents.length}</h4><ul class="sold">${learned}</ul>` : ''}
      ${r.giveaways ? `<small>По${NB}карте лояльности подарено кофе на${NB}${money(r.giveaways)}</small>` : ''}
      ${missing ? `<h4>Искали, но${NB}не${NB}нашли в${NB}меню</h4><ul class="sold">${missing}</ul>` : ''}
      ${sold ? `<h4>Продажи</h4><ul class="sold">${sold}</ul>` : ''}`;
  }

  private bankruptView(): string {
    const last = this.sim.reports.at(-1);
    return `
      <div class="row head"><b>Банкротство</b><span class="badge neg">День ${last?.day ?? ''}</span></div>
      <p>Касса была в${NB}минусе ${ECONOMY.bankruptDays}${NB}дня подряд. Кафе закрыто, имущество ушло в${NB}счёт долгов.</p>
      <p>Это не${NB}конец: посмотри итоги дней — кто не${NB}заходил и${NB}почему — и${NB}попробуй снова.</p>
      <button class="primary" data-action="restart">Начать заново</button>`;
  }

  private residentView(r: Resident): string {
    const minute = Math.floor(minuteOfDay(this.sim.time));
    const now = currentEntry(r.schedule, minute);
    const where = place(r.placeId).name;
    const status = r.visit
      ? r.visit.stage === 'going'
        ? `Идёт в${NB}кафе`
        : r.visit.stage === 'queued'
          ? `Ждёт заказ в${NB}кафе`
          : `Сидит в${NB}кафе`
      : r.walking
        ? `${ACTIVITY_LABEL[r.activity]} · в${NB}пути → ${where}`
        : `${ACTIVITY_LABEL[r.activity]} · ${where}`;
    const home = r.homeId === 'metro' ? `Приезжает на${NB}метро` : `Живёт: ${place(r.homeId).name}`;
    const work =
      r.workId === null
        ? ''
        : `<div>${r.kind === 'student' ? 'Учится' : 'Работает'}: ${
            r.workId === 'metro' ? `за${NB}пределами улицы` : place(r.workId).name
          }</div>`;
    const budget = (Object.keys(WANT_LABEL) as WantKind[])
      .map((k) => `${WANT_LABEL[k]} до${NB}${money(r.budget[k])}`)
      .join(' · ');

    let decision = '';
    const f = isFemale(r);
    const d = r.decision;
    if (d) {
      const item = d.itemId ? this.sim.cafe.menu.find((m) => m.id === d.itemId) : undefined;
      const when = `${d.day === dayNumber(this.sim.time) ? 'Сегодня' : `День ${d.day}`}, ${fmtMinute(d.minute)}`;
      decision = d.visited
        ? `<div class="decision ok"><small>${when}</small>${f ? 'Зашла' : 'Зашёл'} ${WANT_VISIT[d.want]}: ${item?.name ?? ''}, ${money(d.price ?? 0)}</div>`
        : `<div class="decision no"><small>${when} · ${f ? 'хотела' : 'хотел'} ${WANT_LABEL[d.want]}</small>Не${NB}${f ? 'зашла' : 'зашёл'}: ${REJECT_LABEL[d.reason!].toLowerCase()}${
            d.reason === 'expensive' && item ? ` — ${item.name} ${money(d.price ?? 0)}, ${f ? 'готова' : 'готов'} до${NB}${money(d.budget)}` : ''
          }</div>`;
    }

    const reg = this.sim.regularOf(r.id);
    const character = this.characterBlock(r);
    const rows = r.schedule
      .map(
        (s) =>
          `<li class="${s === now ? 'now' : ''}"><span>${fmtMinute(s.start)}</span>${ACTIVITY_LABEL[s.activity]} — ${place(s.placeId).name}</li>`,
      )
      .join('');
    return `
      <div class="card-head">
        ${portrait(r, !!reg, 'lg')}
        <div><b>${r.name}</b><small>${KIND_LABEL[r.kind]}</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button>
      </div>
      <div class="status">${status}</div>
      ${reg ? this.faceCard(reg, r) : ''}
      ${decision}
      <div class="facts"><div>${home}</div>${work}<div>${r.aware ? `Знает о${NB}твоём кафе` : `<b class="oos">Не${NB}знает о${NB}твоём кафе</b>`}</div><div>${f ? 'Готова' : 'Готов'} платить: ${budget}</div></div>
      ${character}
      <ul class="schedule">${rows}</ul>`;
  }

  /** Характер, вкус и память визитов: по ним игрок подбирает меню под своих гостей */
  private characterBlock(r: Resident): string {
    const c = r.character;
    const traits = traitWords(c);
    const { likes, dislikes } = tasteWords(c);
    const list = (axes: TasteAxis[]) => axes.map((a) => AXIS_LABEL[a]).join(` и${NB}`);
    const taste = [
      likes.length ? `любит ${list(likes)}` : '',
      dislikes.length ? `не${NB}любит ${list(dislikes)}` : '',
    ].filter(Boolean).join(' · ') || `ест всё`;
    const memory = r.memory
      .map((m) => {
        const mood = m.score >= 0.3 ? 'ok' : m.score <= -0.2 ? 'no' : '';
        const notes = m.notes.map((n) => NOTE_LABEL[n]).join(', ');
        return `<li class="${mood}"><span>День ${m.day}</span>${itemName(m.itemId)}${notes ? `${NB}— ${notes}` : ''}</li>`;
      })
      .join('');
    return `<div class="character">
        ${traits.length ? `<div class="traits">${traits.map((t) => `<span class="badge">${t}</span>`).join('')}</div>` : ''}
        <div class="taste"><span>Вкус:</span> ${taste}</div>
        ${memory ? `<div class="taste"><span>Помнит о${NB}твоём кафе:</span></div><ul class="memory">${memory}</ul>` : ''}
      </div>`;
  }
}
