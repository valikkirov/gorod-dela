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
  foodCost,
  foodLine,
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
import { menuAddWarning, orderWarning, priceWarning, staffWarnings, uncoveredMinutes } from '../sim/warnings';
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
import type { DistrictId, Place } from '../sim/world';
import { UNLOCK, type City } from '../sim/city';
import { clearSave, exportSave, importSave } from './save';
import { openFeedback } from './feedback';
import { IS_PORTAL, PLATFORM } from './platform';
import { switchLang } from './lang';
import { showTutorial } from './tutorial';
import { showEventCard } from './eventCard';
import { hallTab } from './hall';
import { hallStyle, type FurnitureId, type PresetId, type StyleId } from '../sim/interior';
import { goal } from './metrika';
import { sound } from './sound';
import { CHALLENGE, challengeUrl, resultIfFinished, savedResult, saveKeyFor, showChallengeResult } from './challenge';
import { card } from '../sim/events';
import cardKiosk from './art/cards/card-kiosk.webp';
import cardCafe from './art/cards/card-cafe.webp';

import { getLang, translit, L, tr } from '../sim/i18n';
import { FIRST_STEPS, type StepId } from '../sim/firstSteps';
const PREMISES_PIC: Record<PremisesId, string> = { kiosk: cardKiosk, cafe: cardCafe, bistro: cardCafe };

// Интерфейс — обычный DOM поверх канваса: чёткий текст на любом экране
// и привычная вёрстка для правок дизайнера. Все кнопки — через data-action.

const NB = ' ';
export const SPEEDS = [0, 1, 2, 4] as const;

type View = 'cafe' | 'resident' | 'report' | 'place';
type CafeTab = 'overview' | 'menu' | 'stock' | 'staff' | 'hours' | 'guests' | 'ads' | 'promo' | 'hall' | 'stand' | 'growth';

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
      ? [L('Ночь'), tr`Почти все спят. Ночью работать дорого: +20 % к зарплате.`]
      : h < 7
        ? [L('Город просыпается'), tr`Первые жители идут к метро.`]
        : weekend && h < 15
          ? [L('Выходной'), tr`Офисы закрыты, у метро тише. Жители гуляют и не спешат.`]
          : h < 10
            ? [L('Утренний поток'), tr`Офисные и студенты спешат: очередь их отпугивает.`]
            : h < 12
              ? [L('Затишье'), tr`На улице пенсионеры и фрилансеры, им не к спеху.`]
              : h < 15
                ? [L('Обед'), tr`Офисы выходят поесть: нужна еда, а не только кофе.`]
                : h < 18
                  ? [L('После обеда'), tr`Студенты возвращаются, молодёжь гуляет в сквере.`]
                  : h < 21
                    ? [L('Вечер'), tr`Все идут домой, молодёжь — гулять и в бар.`]
                    : [L('Поздний вечер'), tr`Улица пустеет: остаются ночные смены и молодёжь.`];
  return `<b>${title}</b> <span>${text}</span>`;
}

/** Сколько осталось до открытия делового квартала */
export function unlockText(city: City): string {
  const p = city.unlockProgress();
  const goal = formatMoney(UNLOCK.weeklyProfit).replace(' ', NB);
  const now = p.daysIntoWeek < 7 ? tr`за ${p.daysIntoWeek} дн. этой недели: ${money(p.lastWeek)}` : tr`за неделю: ${money(p.lastWeek)}`;
  return tr`<div><b>Деловой квартал</b> — за железной дорогой, туда ходит метро. Откроется, когда прибыль будет от ${goal} в неделю две недели подряд.</div>
    <div>Подряд: ${p.weeks} из ${UNLOCK.weeks} · ${now}</div>`;
}

/** Английские формы для plural: единственное и множественное число */
const PLURAL_EN: Record<string, [string, string]> = {
  гость: ['guest', 'guests'],
  человек: ['person', 'people'],
  прохожий: ['passer-by', 'passers-by'],
};

/** 1 гость, 2 гостя, 5 гостей */
const plural = (n: number, one: string, few: string, many: string): string => {
  if (getLang() === 'en') {
    const en = PLURAL_EN[one] ?? [translit(one), translit(many)];
    return Math.abs(n) === 1 ? en[0] : en[1];
  }
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

/** Маленькие числа словом — «два гостя», остальные цифрами */
const numWord = (n: number): string => ({ 2: L('два'), 3: L('три'), 4: L('четыре') })[n] ?? String(n);

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m) % 60).padStart(2, '0')}`;

const money = formatMoney;

const weatherShort = (w: Weather): string => `${WEATHER_ICON[w.kind]}${NB}${w.temp > 0 ? '+' : ''}${w.temp}°${w.wind === 2 ? tr` · 💨 ветрено` : ''}`;

const WANT_VISIT: Record<WantKind, string> = {
  coffee: tr`за кофе`,
  lunch: L('пообедать'),
  tea: tr`на чай`,
  snack: L('перекусить'),
  bar: L('выпить'),
};

const isFemale = (r: Resident): boolean => femaleName(r.name);
/** 1 186 → «1 186» с неразрывным пробелом */
const num = (n: number): string => Math.round(n).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US').replace(/\s/g, NB);
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Свои блюда игрока — для названий; обновляется при каждой отрисовке */
let OWN: MenuItem[] = [];
const itemName = (id: string): string => CATALOG.find((c) => c.id === id)?.name ?? OWN.find((m) => m.id === id)?.name ?? id;
/** «не зашли, потому что …» — для выводов отчёта за период */
const REASON_BECAUSE: Partial<Record<RejectReason, string>> = {
  closed: L('было закрыто'),
  'no-item': tr`не было нужного в меню`,
  expensive: L('дорого'),
  'off-route': tr`не по пути`,
  queue: L('очередь'),
  'no-time': L('долго ждать заказа'),
  'out-of-stock': L('закончились продукты'),
  rival: L('выбрали конкурента'),
  taste: tr`не по вкусу`,
  'no-staff': tr`некому было обслужить`,
};

/** «студентам», «молодёжи» — кому блюдо по вкусу */
const FANS_DATIVE: Record<ResidentKind, string> = {
  office: L('офисным'),
  student: L('студентам'),
  pensioner: L('пенсионерам'),
  shopkeeper: L('продавцам'),
  remote: L('фрилансерам'),
  youth: L('молодёжи'),
  nightworker: tr`ночной смене`,
  passenger: L('пассажирам'),
  visitor: tr`гостям района`,
};
/** Вкус позиции словами: «сладкое, необычное» — по нему подбирают меню под гостей */
const itemTaste = (id: string): string => {
  const p = profileOf(id);
  return AXES.filter((a) => p[a] >= 0.55).map((a) => AXIS_LABEL[a]).join(', ');
};

const REASON_HINT: Record<RejectReason, string> = {
  'not-open': L('Хотели зайти, но кафе ещё не работает'),
  closed: tr`Хотели зайти, когда было закрыто — подумай о часах работы`,
  expensive: L('Цена выше, чем готовы платить'),
  'off-route': tr`Кафе не по пути — делать крюк не захотели`,
  'no-item': tr`Не нашли нужного в меню`,
  queue: tr`Не стали стоять в очереди — нужен бариста`,
  'no-time': tr`Не дождались заказа и ушли`,
  unaware: tr`Хотели зайти куда-нибудь, но о твоём кафе не знают. Помогут вывеска, листовки и соцсети — вкладка «Гости»`,
  'out-of-stock': tr`Позиция закончилась на складе. Гость ушёл недовольным — закажи больше или подними автозаказ`,
  mood: tr`Цена и дорога устраивали, но не каждый день хочется в кафе. Постоянные гости заходят чаще`,
  rival: tr`Готовы были зайти, но выбрали конкурента: у него дешевле, ближе по пути или нужная позиция`,
  taste: tr`Цена и дорога устраивали, но в меню не нашлось ничего на их вкус. Посмотри, что любят твои гости, в их карточках`,
  'no-staff': tr`Точка открыта, но за стойкой никого: ты отстоял свои ${ECONOMY.ownerHours} ч, а бариста не было. Найми бариста на эти часы или сократи часы работы`,
};

const USUAL: Record<WantKind, string> = {
  coffee: L('кофе'),
  lunch: L('обед'),
  tea: L('чай'),
  snack: L('перекус'),
  bar: tr`пиво или сидр`,
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
  return list.length ? tr`<small class="comp">Состав: ${list.join(', ')}</small>` : '';
};
/** Предупреждение до решения: «⚠ …» отдельной строкой под пунктом */
const warnLine = (text: string | null): string => (text ? `<small class="warn">⚠ ${text}</small>` : '');
/** «упирается в …» */
const INGREDIENT_ACC: Record<IngredientId, string> = {
  beans: L('зерно'),
  milk: L('молоко'),
  bakery: L('выпечку'),
  kitchen: L('продукты для кухни'),
  drinks: L('чай и лимонад'),
  bar: L('пиво и сидр'),
  syrup: L('сиропы'),
  chocolate: L('шоколад'),
  honey: L('мёд'),
  spices: L('специи'),
  berries: L('ягоды'),
  cheese: L('сыр'),
  ham: L('ветчину'),
};
const BASE_INGREDIENTS: IngredientId[] = ['beans', 'milk', 'bakery', 'kitchen', 'drinks', 'bar'];
const ingredientIcon = (id: IngredientId): string => (BASE_INGREDIENTS.includes(id) ? `ing-${id}` : `add-${id}`);
/** 1,5 дня → «1,5 дня»; 4 → «4 дня»; 12 → «12 дней» */
const daysText = (d: number): string => {
  const v = d >= 10 ? Math.round(d) : Math.floor(d * 2) / 2;
  const whole = Number.isInteger(v);
  if (getLang() === 'en') return `${v}${NB}${v === 1 ? 'day' : 'days'}`;
  const word = !whole ? L('дня') : v % 10 === 1 && v % 100 !== 11 ? L('день') : [2, 3, 4].includes(v % 10) && ![12, 13, 14].includes(v % 100) ? L('дня') : L('дней');
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
  private readonly nightSkip = $('#night-skip') as HTMLButtonElement;
  private readonly district = $<HTMLButtonElement>('#district');
  /** Окно поверх игры: каталог меню и конструктор блюда — чтобы не открывались внизу длинной панели */
  private readonly modal = document.createElement('div');
  private modalHtml = '';
  private lastModal = '';
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
  /** Какая вкладка была открыта в каждом разделе — чтобы вернуться туда же */
  private lastInGroup = new Map<string, CafeTab>();
  /** Какая позиция меню раскрыта для правки цены */
  private openItem: string | null = null;
  /** Выбранное место в зале (свой дизайн) */
  private hallSlot: string | null = null;
  /** Какое событие уже показали карточкой — второй раз сама не всплывает */
  private eventShown = '';

  /** Точка, на которую сейчас смотрит игрок */
  private sim: Simulation;
  /** Перейти в другой район — подставляет main */
  onSwitch: (district: DistrictId) => void = () => {};

  constructor(
    private readonly city: City,
    private readonly onDeselect: () => void,
    private readonly selectInScene: (r: Resident) => void = () => {},
    private readonly challenge = false,
  ) {
    this.sim = city.main;
    // Скорость — одна тёмная кнопка из двух половин: пауза/пуск и ×1 → ×2 → ×4 по кругу (UI 2.1)
    const speeds = $('#speeds');
    const pill = document.createElement('div');
    pill.className = 'speed-pill';
    const pause = document.createElement('button');
    pause.dataset.role = 'pause';
    pause.addEventListener('click', () => this.setSpeed(this.speed === 0 ? this.lastSpeed : 0));
    const cycle = document.createElement('button');
    cycle.dataset.role = 'cycle';
    cycle.title = L('Скорость: ×1, ×2, ×4');
    cycle.addEventListener('click', () => {
      const run = SPEEDS.filter((v) => v > 0);
      // На паузе — просто продолжить; иначе — следующая скорость
      this.setSpeed(this.speed === 0 ? this.lastSpeed : run[(run.indexOf(this.speed as (typeof run)[number]) + 1) % run.length]);
    });
    pill.append(pause, cycle);
    speeds.append(pill);
    // Ночью, когда всё закрыто, — заметная кнопка над картой: новичок не ищет ⏭ в шапке
    this.nightSkip.innerHTML = tr`🌙 Всё закрыто до утра · <b>Промотать ⏭</b>`;
    this.nightSkip.addEventListener('click', () => {
      if (this.sim.bankrupt) return;
      goal('night_skip');
      this.city.skipToMorning();
      this.render(true);
    });
    // Промотать до 6:00 утра: ночь и пустые часы не нужно ждать
    const skip = document.createElement('button');
    skip.textContent = '⏭';
    skip.title = L('Промотать до 6:00 утра');
    skip.setAttribute('aria-label', L('Промотать до утра'));
    skip.className = 'skip';
    skip.addEventListener('click', () => {
      if (this.sim.bankrupt) return;
      this.city.skipToMorning();
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
    this.modal.className = 'modal-backdrop';
    this.modal.hidden = true;
    document.body.append(this.modal);
    this.modal.addEventListener('click', (ev) => {
      // Нажали мимо окна — закрыть
      if (ev.target === this.modal) {
        this.catalogOpen = false;
        this.dish = null;
        this.render(true);
        return;
      }
      this.onClick(ev);
    });
    this.modal.addEventListener('change', (ev) => this.onChange(ev));
    this.modal.addEventListener('focusout', () => setTimeout(() => this.render(), 0));
    this.panel.addEventListener('change', (ev) => this.onChange(ev));
    // Ушли со списка, ничего не выбрав, — догоняем отложенную пересборку
    this.panel.addEventListener('focusout', () => setTimeout(() => this.render(), 0));
    this.panel.addEventListener('keydown', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.dataset.action !== 'rename-input') return;
      if (ev.key === 'Enter') this.finishRename(true);
      if (ev.key === 'Escape') this.finishRename(false);
    });
    this.district.addEventListener('click', () => {
      const other: DistrictId = this.sim.district === 'klenovaya' ? 'delovoy' : 'klenovaya';
      if (this.city.unlocked) this.onSwitch(other);
      else {
        // Ещё закрыт: карточка метро — там условие и сколько осталось
        this.selectPlace(this.sim.at('metro'));
        this.onExpand();
      }
    });
    this.setSpeed(1);
    this.render(true);
  }

  /** Кнопка района над картой: где ты сейчас и куда можно поехать */
  private districtPill(): void {
    const el = this.district;
    const show = this.city.unlocked || this.sim.cafe.opened;
    el.hidden = !show;
    if (!show) return;
    let html: string;
    if (this.city.unlocked) {
      const there = this.sim.district === 'klenovaya' ? L('Деловой квартал') : L('Кленовая');
      html = `<small>${this.sim.district === 'klenovaya' ? L('Кленовая') : L('Деловой квартал')}</small><b>🚇 ${there}${NB}→</b>`;
    } else {
      const p = this.city.unlockProgress();
      html = tr`<small>Деловой квартал</small><b>🔒 ${p.weeks} из ${UNLOCK.weeks} нед.</b>`;
    }
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** Квартал только что открылся: карточка с предложением поехать */
  private unlockCard(): void {
    if (!this.city.justUnlocked || document.querySelector('.overlay')) return;
    this.city.justUnlocked = false;
    const resume = this.speed || 1;
    this.setSpeed(0);
    sound.play('ui-milestone');
    goal('district', { id: 'delovoy' });
    const root = document.createElement('div');
    root.className = 'overlay';
    root.innerHTML = tr`
      <div class="sheet event-card" role="dialog" aria-label="Деловой квартал открыт">
        <div class="event-icon">🏙️</div>
        <b>Деловой квартал открыт</b>
        <p>Две недели подряд прибыль от ${money(UNLOCK.weeklyProfit)} в неделю — первая точка встала на ноги. За железной дорогой деловой квартал: бизнес-центры, коворкинг и институт, около 160 офисных. Там сдаётся помещение под бистро с обедами.</p>
        <p class="event-stake">Ты стоишь за стойкой в первой точке, во второй нужен бариста. Касса общая.</p>
        <div class="event-options">
          <button class="event-option" data-choice="go"><span>Поехать на метро</span><small>Посмотреть квартал и бистро</small></button>
        </div>
        <div class="actions"><small>Переход — кнопкой над картой или через метро</small><button class="link" data-choice="later">Позже</button></div>
      </div>`;
    document.body.append(root);
    root.addEventListener('click', (ev) => {
      const id = (ev.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset.choice;
      if (!id) return;
      root.remove();
      this.setSpeed(resume);
      if (id === 'go') this.onSwitch('delovoy');
    });
  }

  /** Скорость сменилась — площадке нужно знать, идёт ли игра */
  onSpeedChange: () => void = () => {};

  setSpeed(s: number): void {
    this.speed = this.sim.bankrupt ? 0 : s;
    this.onSpeedChange();
    if (this.speed > 0) this.lastSpeed = this.speed;
    const pause = document.querySelector<HTMLButtonElement>('#speeds [data-role="pause"]');
    const cycle = document.querySelector<HTMLButtonElement>('#speeds [data-role="cycle"]');
    if (pause) {
      pause.textContent = this.speed === 0 ? '▶' : '❚❚';
      pause.title = this.speed === 0 ? L('Продолжить') : L('Пауза');
      pause.setAttribute('aria-label', pause.title);
      pause.classList.toggle('paused', this.speed === 0);
    }
    if (cycle) {
      cycle.textContent = `×${this.lastSpeed}`;
      cycle.setAttribute('aria-label', tr`Скорость ×${this.lastSpeed}, нажми, чтобы сменить`);
    }
  }

  /** Переключиться на точку в другом районе: панель — с обзора */
  show(sim: Simulation): void {
    this.sim = sim;
    this.selected = null;
    this.selectedPlace = null;
    this.view = 'cafe';
    this.tab = 'overview';
    this.openItem = null;
    this.hallSlot = null;
    this.standPick = null;
    this.catalogOpen = false;
    this.dish = null;
    this.render(true);
  }

  /** Скорость до паузы — с неё продолжаем */
  private lastSpeed = 1;

  select(r: Resident | null): void {
    this.selected = r;
    if (r && this.sim.cafe.opened) this.sim.markStep('resident');
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

  /** Ночь и все точки закрыты до утра: ждать нечего — предлагаем промотать */
  private isQuietNight(): boolean {
    const m = this.sim.minute;
    if (this.sim.bankrupt || this.speed === 0 || !(m >= 20 * 60 || m < 5 * 60)) return false;
    const points = this.city.points.filter((s) => s.cafe.opened);
    return points.length > 0 && points.every((s) => !s.cafe.isOpenAt(m));
  }

  /** Выполнен шаг «Первых шагов»: звук, цель Метрики и обновлённая карточка */
  onStep(id: StepId): void {
    goal('first_step', { id });
    sound.play('ui-milestone', 0.6);
    if (FIRST_STEPS.every((s) => this.sim.steps[s.id] !== undefined)) goal('first_steps_done');
    this.stepsJustDone = FIRST_STEPS.every((s) => this.sim.steps[s.id] !== undefined);
    this.render(true);
  }

  /** Все шаги только что пройдены: один раз показываем поздравление вместо карточки */
  private stepsJustDone = false;

  /** Карточка «Первые шаги» в обзоре: пока новичок их не прошёл */
  private firstStepsCard(): string {
    const sim = this.sim;
    if (sim.isBranch || !sim.cafe.opened) return '';
    const done = FIRST_STEPS.filter((s) => sim.steps[s.id] !== undefined).length;
    if (done === FIRST_STEPS.length) {
      if (!this.stepsJustDone) return '';
      return `<div class="first-steps done"><b>${L('Первые шаги пройдены!')}</b> ${L('Дальше — вехи во вкладке «Развитие».')}</div>`;
    }
    const items = FIRST_STEPS.map((s) => {
      const ok = sim.steps[s.id] !== undefined;
      return `<li class="${ok ? 'ok' : ''}"><span class="mark">${ok ? '✓' : ''}</span><div><b>${s.title}</b>${ok ? '' : `<small>${s.hint}</small>`}</div></li>`;
    }).join('');
    return `<div class="first-steps"><h4>${tr`Первые шаги · ${done} из ${FIRST_STEPS.length}`}</h4><ul>${items}</ul></div>`;
  }

  onDayEnd(): void {
    this.stepsJustDone = false;
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
    const dayText = !this.challenge ? tr`День ${day}` : day <= CHALLENGE.days ? tr`День ${day} из ${CHALLENGE.days}` : tr`День ${day} · итог записан`;
    const clock = `<b>${WEEKDAY_SHORT[weekday(day)]} · ${formatClock(this.sim.time)}</b><small>${dayText} · ${weatherShort(this.sim.weather)}</small>`;
    if (this.clock.innerHTML !== clock) this.clock.innerHTML = clock;
    // Касса нейтральная: цветом только минус (UI 2.1, «касса не равна прибыли»)
    const cash = tr`<small>В кассе</small><b>${money(this.sim.cash)}</b>`;
    if (this.cash.innerHTML !== cash) this.cash.innerHTML = cash;
    const note = streetNote(this.sim.minute, isWeekend(day));
    if (this.note.innerHTML !== note) this.note.innerHTML = note;
    const night = this.isQuietNight();
    if (this.nightSkip.hidden === night) this.nightSkip.hidden = !night;
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
    this.districtPill();
    this.unlockCard();
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
      case 'go-district':
        this.onSwitch(item as DistrictId);
        return;
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
      case 'item-toggle':
        this.openItem = this.openItem === item ? null : item ?? null;
        break;
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
      case 'hall-style':
        if (sim.applyStyle(item as StyleId)) sound.play('ui-upgrade');
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
      case 'owner-on':
        sim.setOwnerShift({ days: [true, true, true, true, true, false, false], from: hm(8), to: hm(10) });
        break;
      case 'owner-off':
        sim.setOwnerShift(null);
        break;
      case 'owner-day': {
        const sh = sim.cafe.ownerShift;
        if (!sh) break;
        const days = [...sh.days];
        const d = Number(btn.dataset.day);
        days[d] = !days[d];
        sim.setOwnerShift({ ...sh, days });
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
      case 'lang':
        switchLang();
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
        exportSave(this.city);
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
    if (el.dataset.action === 'owner-from' || el.dataset.action === 'owner-to') {
      const sh = cafe.ownerShift;
      const get = (a: string) => Number(this.panel.querySelector<HTMLSelectElement>(`select[data-action="${a}"]`)!.value);
      if (sh) {
        let from = get('owner-from');
        let to = get('owner-to');
        if (to <= from) to = from + 60;
        if (to - from > ECONOMY.ownerHours * 60) from = to - ECONOMY.ownerHours * 60;
        this.sim.setOwnerShift({ ...sh, from, to });
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
    // В Яндекс Играх адрес не трогаем: в нём параметры площадки
    if (IS_PORTAL) location.reload();
    else location.href = this.challenge ? challengeUrl() : location.pathname;
  }

  // ——— Отрисовка панели ———

  private render(force = false): void {
    OWN = this.sim.cafe.own;
    this.modalHtml = '';
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
    const editing =
      !force &&
      active instanceof HTMLElement &&
      (this.panel.contains(active) || this.modal.contains(active)) &&
      (active.tagName === 'SELECT' || active.tagName === 'INPUT');
    if (!editing && (force || this.modalHtml !== this.lastModal)) {
      this.lastModal = this.modalHtml;
      this.modal.innerHTML = this.modalHtml;
      this.modal.hidden = !this.modalHtml;
    }
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
    return tr`<li class="premises">
      <img class="premises-pic" src="${PREMISES_PIC[id]}" alt="" width="300" height="100" />
      <div class="row"><b class="grow">${pr.name}</b><span class="badge">аренда ${money(pr.rentPerDay * 30)}/мес</span></div>
      <small>${pr.about}. Коммуналка — за часы работы, налог 6 % с выручки.</small>
      <button class="primary" data-action="open-cafe" data-item="${id}" ${canAfford ? '' : 'disabled'}>Открыть · ${money(pr.openingCost)}</button>
    </li>`;
  }

  private placeView(p: Place): string {
    const sim = this.sim;
    const residents = sim.residents;
    const inside = residents.filter((r) => r.placeId === p.id && !r.walking);
    const head = (title: string, sub: string) => tr`
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
            .join('')}${list.length > 24 ? tr`<small>и ещё ${list.length - 24}</small>` : ''}</div>`
        : '';
    const awareLine = (list: Resident[], what: string) => {
      if (!sim.cafe.opened || !list.length) return '';
      const n = list.filter((r) => r.aware).length;
      return tr`<div>О твоём кафе знают ${n} из ${list.length} ${what}</div>`;
    };

    // Свободное, своё или конкурента помещение
    if (p.kind === 'cafe') {
      const id = p.id as PremisesId;
      const mine = sim.cafe.opened && sim.shopId === p.id;
      const rival = sim.rival && sim.cafe.opened && sim.rival.placeId === p.id ? sim.rival : null;
      if (mine) {
        const open = sim.cafe.isOpenAt(sim.minute);
        return tr`${head(sim.cafe.title, open ? L('открыто') : L('закрыто'))}
          <div class="facts"><div>Гостей сегодня: ${sim.cafe.today.guests} · выручка ${money(sim.cafe.today.revenue)}</div></div>
          ${people(inside, L('Сейчас внутри'))}
          <button class="primary" data-action="back">К управлению кафе</button>`;
      }
      if (rival) {
        const opened = sim.today >= rival.opensDay;
        return tr`${head(rival.t.name, opened ? L('конкурент') : tr`конкурент откроется через ${rival.opensDay - sim.today} дн.`)}
          <div class="facts"><div>${rival.t.pitch}</div><div>Часы: ${fmtMinute(rival.t.openAt)}–${fmtMinute(rival.t.closeAt)}</div><div>Цены: ${Object.entries(
            rival.t.prices,
          )
            .map(([item, price]) => `${itemName(item)} ${money(price)}`)
            .join(' · ')}</div></div>
          ${people(inside, tr`Сейчас у него`)}`;
      }
      if (PREMISES[id]?.district !== sim.district) {
        return tr`${head(p.name, L('не сдаётся'))}
          <div class="facts"><div>Помещение уже арендовала сеть «Кофе на бегу». Откроется через несколько дней после твоего бистро.</div></div>`;
      }
      return `${head(p.name, sim.cafe.opened ? L('свободно') : L('сдаётся'))}
        ${sim.cafe.opened ? tr`<div class="facts"><div>Помещение пустует.</div></div>` : `<ul class="menu premises-list">${this.premisesCard(id)}</ul>`}`;
    }

    if (p.kind === 'home') {
      const live = residents.filter((r) => r.homeId === p.id);
      return tr`${head(p.name, L('жилой дом'))}
        <div class="facts"><div>Живут: ${live.length} · дома сейчас: ${inside.length}</div>${awareLine(live, L('жильцов'))}</div>
        ${people(inside, L('Сейчас дома'))}`;
    }
    if (p.kind === 'office') {
      const work = residents.filter((r) => r.workId === p.id);
      return tr`${head(p.name, L('офис'))}
        <div class="facts"><div>Работают: ${work.length} · сейчас на месте: ${inside.length}</div>${awareLine(work, L('сотрудников'))}</div>
        ${people(inside, tr`Сейчас в офисе`)}`;
    }
    if (p.kind === 'metro' && p.closed) {
      return tr`${head(p.name, L('закрыт'))}
        <div class="facts"><div>Выход на Садовую пока закрыт. Все пассажиры выходят на Кленовую, к киоску.</div></div>`;
    }
    if (p.kind === 'metro') {
      const come = residents.filter((r) => r.homeId === 'metro');
      return tr`${head(p.name, tr`выход из метро`)}
        <div class="facts"><div>Приезжают на улицу на метро: ${come.length}</div>${awareLine(come, tr`из них`)}</div>
        ${this.metroTrip()}`;
    }
    if (p.kind === 'school') {
      const study = residents.filter((r) => r.workId === p.id);
      return tr`${head(p.name, tr`школа на Садовой`)}
        <div class="facts"><div>Учатся: ${study.length} · сейчас на уроках: ${inside.length}</div>${awareLine(study, L('учеников'))}</div>
        ${people(inside, tr`Сейчас в школе`)}`;
    }
    if (p.kind === 'vacant') {
      return tr`${head(p.name, L('сдаётся'))}
        <div class="facts"><div>Второе помещение на жилой улице. Откроется для аренды позже — когда кафе на Кленовой встанет на ноги.</div></div>`;
    }
    const sub = p.kind === 'shop' ? L('магазин') : p.kind === 'park' ? tr`здесь гуляют и отдыхают` : L('остановка автобуса');
    const here = p.kind === 'park' ? residents.filter((r) => r.placeId === p.id && r.visible) : inside;
    return `${head(p.name, sub)}${people(here, p.kind === 'park' ? L('Сейчас гуляют') : L('Сейчас здесь'))}`;
  }

  /** Метро: поездка в другой район или сколько осталось до открытия квартала */
  private metroTrip(): string {
    if (this.sim.isBranch) return tr`<button class="primary" data-action="go-district" data-item="klenovaya">Вернуться на Кленовую</button>`;
    if (this.city.unlocked) return tr`<button class="primary" data-action="go-district" data-item="delovoy">Поехать в Деловой квартал</button>`;
    return `<div class="facts">${unlockText(this.city)}</div>`;
  }

  private cafeView(): string {
    const { cafe } = this.sim;
    const today = cafe.today;
    if (!cafe.opened) {
      this.live.wanted = String(today.wanted);
      const card = (id: PremisesId) => this.premisesCard(id);
      if (this.sim.isBranch) {
        return tr`
        <div class="row head"><b>Деловой квартал</b><span class="badge">Вторая точка</span></div>
        <p class="demand">Сегодня зайти хотели: <b data-live="wanted"></b>. Здесь работают и учатся: утром кофе, в обед очередь за едой, после 19:00 и в выходные пусто.</p>
        <ul class="menu premises-list">${card('bistro')}</ul>
        <small>Ты стоишь за стойкой в первой точке. Во второй нужен бариста — найми его сразу после открытия. Касса общая.</small>`;
      }
      return tr`
        <div class="row head"><b>Свободные помещения</b><span class="badge">Сдаются</span></div>
        <p class="demand">Сегодня зайти хотели: <b data-live="wanted"></b>. Посмотри, кто и когда, — нажми на жителя.</p>
        ${this.challengeBanner()}
        <ul class="menu premises-list">${card('kiosk')}${card('cafe')}</ul>
        <small>Формат начинается с места: у метро — поток пассажиров, в кафе с залом гости сидят и дозаказывают.</small>
        ${this.sim.time > hm(7) ? this.restartBlock() : (this.challenge || IS_PORTAL ? '' : this.transferBlock()) + this.langLink()}`;
    }

    const minute = this.sim.minute;
    const open = cafe.isOpenAt(minute);
    this.live.status = this.statusText(minute, open);
    this.live.guests = String(today.guests);
    this.live.revenue = money(today.revenue);
    this.live.queue = String(this.sim.guestsInside);
    this.live.wages = money(cafe.wagesSoFar);
    this.live['owner-hours'] = (Math.floor(cafe.ownerMinutes / 6) / 10).toFixed(1).replace('.', ',');
    this.live['owner-status'] = !cafe.isOpenAt(this.sim.minute)
      ? L('кафе закрыто')
      : cafe.ownerAtCounter
        ? cafe.baristas > 0
          ? L('за стойкой вместе с персоналом')
          : L('за стойкой')
        : cafe.ownerTired
          ? L('отработал своё на сегодня')
          : L('отдыхаешь');

    const items = cafe.menu
      .map((m) => {
        this.live[`sold-${m.id}`] = String(today.sold[m.id] ?? 0);
        this.live[`oos-${m.id}`] = cafe.stock.canMake(m.id) ? '' : tr` · нет в наличии`;
        const isOpen = this.openItem === m.id;
        const margin = m.price - m.cost;
        const marginCls = margin <= 0 ? ' neg' : margin < m.price * 0.3 ? ' thin' : '';
        const taste = itemTaste(m.id);
        return tr`
        <li class="item${isOpen ? ' open' : ''}">
          <button class="item-head" data-action="item-toggle" data-item="${m.id}" aria-expanded="${isOpen}">
            <span class="tile">${iconImg(m.id)}</span>
            <span class="info"><b>${m.name}</b>
              <small>Продано <span data-live="sold-${m.id}"></span> · себест. ${money(m.cost)}<span class="oos" data-live="oos-${m.id}"></span></small></span>
            <span class="price">${money(m.price)}</span>
            <span class="chev" aria-hidden="true">${isOpen ? '⌃' : '⌄'}</span>
          </button>
          ${
            isOpen
              ? tr`<div class="item-body">
            <div class="price-row"><b>Цена продажи</b>
              <div class="stepper">
                <button data-action="price-down" data-item="${m.id}" aria-label="Дешевле">−</button>
                <span>${money(m.price)}</span>
                <button data-action="price-up" data-item="${m.id}" aria-label="Дороже">+</button>
              </div></div>
            <p class="margin${marginCls}"><span>Маржа с ${m.kind === 'coffee' ? L('чашки') : L('продажи')}: <b>${margin > 0 ? '+' : ''}${money(margin)}</b></span><span>Шаг цены ${money(ECONOMY.priceStep)}</span></p>
            <small class="comp">${taste ? `${taste} · ` : ''}по вкусу ${this.sim.tasteFans(m.id).fans}</small>
            ${compositionLine(m.id)}${warnLine(priceWarning(m))}
            <div class="item-actions"><button class="link" data-action="remove-item" data-item="${m.id}" ${cafe.menu.length <= 1 ? 'disabled' : ''}>Убрать из меню</button></div>
          </div>`
              : ''
          }
        </li>`;
      })
      .join('');

    const full = cafe.menu.length >= MAX_MENU;
    const catalog = this.catalogOpen
      ? (Object.keys(KIND_TITLE) as ItemKind[])
          .map((kind) => {
            // Сезонное видно только в свой сезон (или если уже стоит в меню)
            const rows = CATALOG.filter((c) => c.kind === kind && (!c.seasonal || this.sim.holiday || cafe.hasItem(c.id)))
              .map((c) => {
                const inMenu = cafe.hasItem(c.id);
                const fits = cafe.fits(c.id);
                const noEquip = fits && !!cafe.missingEquipment(c.id);
                return tr`<li>${iconImg(c.id)}<div class="grow"><b>${c.name}</b>${c.seasonal ? L(' <span class="badge season">🎄 сезон</span>') : ''}
                  <small>${itemTaste(c.id) ? `${itemTaste(c.id)} · ` : ''}от ${money(c.price)} · себестоимость ${money(c.cost)}</small></div>
                  ${
                    inMenu
                      ? L('<span class="badge on">в меню</span>')
                      : !fits
                        ? tr`<span class="badge">не здесь</span>`
                        : noEquip
                          ? tr`<span class="badge warn">нужно оборудование</span>`
                          : tr`<button class="small" data-action="add-item" data-item="${c.id}" ${full ? 'disabled' : ''}>Добавить</button>`
                  }${compositionLine(c.id)}${inMenu || !fits || noEquip ? '' : warnLine(menuAddWarning(cafe, c.id))}</li>`;
              })
              .join('');
            const legal =
              kind === 'bar' ? tr`<small class="note">ИП может продавать только пиво и сидр. Вино и крепкое — с лицензией ООО, позже</small>` : '';
            // Оборудование под категорию: плита для обедов, кран для пива
            const need = equipmentFor(kind);
            const eq = need ? EQUIPMENT[need] : null;
            const fitsKind = cafe.premises.kinds.includes(kind);
            const equip =
              eq && fitsKind
                ? cafe.equipment.includes(eq.id)
                  ? tr`<p class="equip on"><b>${eq.name}</b> <span class="badge on">установлено</span></p>`
                  : tr`<p class="equip"><span class="grow">Нужна покупка: <b>${eq.name}</b>. Свет и вода +${eq.utilitiesPerHour} ₽ за час работы</span>
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
            const label = m >= MINUTES_PER_DAY ? tr`${fmtMinute(m % MINUTES_PER_DAY)} ночи` : fmtMinute(m);
            return `<option value="${m}" ${!allDay && m === h.closeAt ? 'selected' : ''}>${label}</option>`;
          })
          .join('') + tr`<option value="${ALL_DAY}" ${allDay ? 'selected' : ''}>круглосуточно</option>`
      );
    };
    const hoursBlock = () => {
      if (!this.hoursByDay && cafe.sameEveryDay) {
        const h = cafe.week[0]!;
        return tr`<div class="row hours">
          <select data-action="open-at" aria-label="Открытие">${opt(OPEN_OPTIONS, h.openAt)}</select>
          <span>—</span>
          <select data-action="close-at" aria-label="Закрытие">${closeOpt(h)}</select>
        </div>
        <button class="link" data-action="hours-by-day">Свои часы и выходные по дням недели</button>`;
      }
      const rows = cafe.week
        .map((h, d) => {
          const open = tr`<select data-action="day-open" data-item="${d}" aria-label="${WEEKDAY_SHORT[d]}, открытие">
            <option value="${DAY_OFF}" ${h ? '' : 'selected'}>выходной</option>${opt(OPEN_OPTIONS, h?.openAt ?? -1)}</select>`;
          const close = h ? tr`<span>—</span><select data-action="day-close" data-item="${d}" aria-label="${WEEKDAY_SHORT[d]}, закрытие">${closeOpt(h)}</select>` : '';
          return `<li class="${d === cafe.weekday ? 'today' : ''}${h ? '' : ' off'}"><b>${WEEKDAY_SHORT[d]}</b>${open}${close}</li>`;
        })
        .join('');
      return tr`<ul class="week-hours">${rows}</ul>
        <button class="link" data-action="hours-same">Одинаково каждый день — как ${WEEKDAY_SHORT[this.sameAsDay()].toLowerCase()}</button>`;
    };
    const staffRows = cafe.staff.map((st, i) => this.staffRow(st, i, open)).join('');
    const last = this.sim.reports.at(-1);

    // Меню управления: пять разделов, в разделе — свои вкладки (подменю). Сгруппированы по смыслу:
    // что продаём (меню, склад), кто работает (персонал, часы), кто приходит (гости, реклама, акции), как растём
    const groups: { label: string; tabs: [CafeTab, string][] }[] = [
      { label: L('Обзор'), tabs: [['overview', L('Обзор')]] },
      { label: L('Меню'), tabs: [['menu', L('Меню и цены')], ['stock', L('Склад')]] },
      { label: L('Команда'), tabs: [['staff', L('Персонал')], ['hours', L('Часы работы')]] },
      { label: L('Гости'), tabs: [['guests', L('Знакомые')], ['ads', L('Реклама')], ['promo', L('Акции')]] },
      {
        label: L('Развитие'),
        tabs: [
          ...(this.sim.hasHall ? ([['hall', L('Зал')]] as [CafeTab, string][]) : []),
          ...(cafe.premisesId === 'kiosk' ? ([['stand', L('Стойка')]] as [CafeTab, string][]) : []),
          ['growth', L('Вехи и улучшения')],
        ],
      },
    ];
    const group = groups.find((g) => g.tabs.some(([id]) => id === this.tab)) ?? groups[0];
    if (!group.tabs.some(([id]) => id === this.tab)) this.tab = group.tabs[0][0];
    const groupBtn = (g: (typeof groups)[number]) => {
      const target = g === group ? this.tab : (this.lastInGroup.get(g.label) ?? g.tabs[0][0]);
      return `<button data-action="tab" data-item="${target}" class="${g === group ? 'active' : ''}">${g.label}</button>`;
    };
    const subBtn = ([id, label]: [CafeTab, string]) =>
      `<button data-action="tab" data-item="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`;
    this.lastInGroup.set(group.label, this.tab);
    const tabBar = `<nav class="tabs">${groups.map(groupBtn).join('')}</nav>${
      group.tabs.length > 1 ? `<nav class="subtabs">${group.tabs.map(subBtn).join('')}</nav>` : ''
    }`;

    let body = '';
    if (this.tab === 'overview') {
      this.live['stock-warn'] = this.stockWarning();
      body = this.firstStepsCard() + tr`
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
      ${staffWarnings(cafe).map((w) => warnLine(w)).join('')}
      ${last ? tr`<button class="secondary" data-action="report">Итоги дня ${last.day}</button>` : ''}
      ${this.restartBlock()}`;
    } else if (this.tab === 'menu') {
      body = tr`
      <div class="menu-head"><h4>Меню и цены</h4>
        <button class="small" data-action="toggle-catalog">${L('+ Добавить')}</button></div>
      <p class="hint-line">${cafe.menu.length} из ${MAX_MENU} позиций${full ? tr` — мест нет, сначала убери позицию` : ''} · нажми позицию, чтобы поменять цену</p>
      <p class="hint-line">${this.focusLine()}</p>
      <ul class="menu items">${items}</ul>
      ${this.ownDishesBlock()}`;
      if (this.catalogOpen) this.modalHtml = this.modalSheet(L('Каталог'), `<div class="catalog-wrap">${catalog}</div>`, 'toggle-catalog');
    } else if (this.tab === 'stock') {
      body = this.stockTab();
    } else if (this.tab === 'hours') {
      body = tr`<h4>Часы работы</h4>
      ${hoursBlock()}
      ${staffWarnings(cafe).map((w) => warnLine(w)).join('')}`;
    } else if (this.tab === 'guests') {
      body = this.facesBlock();
    } else if (this.tab === 'ads') {
      body = this.adsTab();
    } else if (this.tab === 'promo') {
      body = this.promoTab();
    } else if (this.tab === 'growth') {
      body = this.growthTab();
    } else if (this.tab === 'hall') {
      body = hallTab(this.sim, this.hallSlot);
    } else if (this.tab === 'stand') {
      body = standTab(this.sim, this.standPick);
    } else {
      const ownerLine = this.ownerCard();
      body = tr`
      ${ownerLine}
      ${staffWarnings(cafe).map((w) => warnLine(w)).join('')}
      <ul class="menu staff">${staffRows}</ul>
      ${
        cafe.staff.length < cafe.premises.maxBaristas
          ? tr`<div class="hire">
        <button class="small" data-action="hire-shift">На смену · ${money(ECONOMY.shiftWage)}</button>
        <button class="small" data-action="hire-hourly">Почасово · ${money(ECONOMY.baristaWagePerHour)}/ч</button>
      </div>
      <small>Смена — до ${ECONOMY.shiftHours} часов с открытия, платишь всю сумму в дни по графику. Почасовой работает в окне графика — сузь его до пиков.</small>`
          : ''
      }
      <p class="wages">Сегодня на зарплату: <b data-live="wages"></b> <small>ночью (22:00–6:00) +20 %</small></p>`;
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
      t.revenue - foodCost(t) - cafe.wagesSoFar - t.revenue * ECONOMY.taxRate - t.marketing - (t.other ?? 0) - cafe.premises.rentPerDay - cafe.utilitiesPerDay,
    );
    this.live['biz-result'] = `${running > 0 ? '+' : ''}${money(running)}`;
    this.live['biz-guests'] = `${t.guests}${NB}${plural(t.guests, 'гость', 'гостя', 'гостей')}`;
    this.liveClass['biz-result'] = running >= 0 ? 'pos' : 'neg';
    const name = this.renaming
      ? tr`<div class="rename">
          <input data-action="rename-input" maxlength="${CAFE_NAME_MAX}" value="${escapeHtml(cafe.title)}" aria-label="Название заведения" enterkeyhint="done" />
          <button class="small" data-action="rename-save">Готово</button>
          <button class="icon" data-action="rename-cancel" aria-label="Отмена">✕</button>
        </div>`
      : tr`<div class="biz-name"><b>${escapeHtml(cafe.title)}</b><button class="icon" data-action="rename" aria-label="Переименовать" title="Переименовать">✎</button></div>`;
    return tr`<header class="biz">
      <small class="eyebrow">Твоё заведение</small>
      ${name}
      <div class="biz-line"><span class="biz-status ${open ? 'on' : ''}" data-live="status"></span></div>
      <div class="biz-line" title="Выручка минус проданные продукты по себестоимости, зарплаты, налог, аренда и коммуналка за день">Сегодня пока <b data-live="biz-result"></b> · <span data-live="biz-guests"></span></div>
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
    const span = tr`С ${fmtMinute(from * 60)} до ${fmtMinute(((h + 1) % 24) * 60)}`;
    // Гости — те, кто зашёл и купил. Кто пришёл и ушёл ни с чем — «люди», кто прошёл мимо — «прохожие»
    const persons = (n: number) => `${numWord(n)} ${plural(n, 'человек', 'человека', 'человек')}`;
    const passers = (n: number) => `${numWord(n)} ${plural(n, 'прохожий', 'прохожих', 'прохожих')}`;
    const count = (reason: RejectReason) => hours.reduce((n, x) => n + (t.lostHour?.[reason]?.[x] ?? 0), 0);
    const rules: { reasons: RejectReason[]; text: (n: number) => string; tab: CafeTab; action: string }[] = [
      { reasons: ['queue', 'no-time'], text: (n) => tr`${persons(n)} ушли из-за очереди`, tab: 'staff', action: L('Настроить смены') },
      { reasons: ['out-of-stock'], text: (n) => tr`${persons(n)} не получили заказ: кончились продукты`, tab: 'stock', action: L('Открыть склад') },
      { reasons: ['expensive'], text: (n) => tr`${persons(n)} решили, что дорого`, tab: 'menu', action: L('Посмотреть цены') },
      { reasons: ['rival'], text: (n) => tr`${persons(n)} ушли к конкуренту`, tab: 'menu', action: L('Сравнить цены') },
      { reasons: ['no-item'], text: (n) => tr`${persons(n)} не нашли нужного в меню`, tab: 'menu', action: L('Изменить меню') },
      { reasons: ['closed'], text: (n) => tr`${persons(n)} пришли, а было закрыто`, tab: 'hours', action: L('Часы работы') },
      { reasons: ['unaware'], text: (n) => tr`${passers(n)} прошли мимо: не знают о тебе`, tab: 'ads', action: L('Реклама') },
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
        ? tr`обслужено ${served} ${plural(served, 'гость', 'гостя', 'гостей')}, без заметных потерь.`
        : tr`гостей не было. Посмотри, кто сейчас на улице и куда идёт.`;
    }
    // Текст — «живой»: числа меняются каждую минуту, а пересобирать из-за них панель незачем
    this.live.insight = text.replace(/&nbsp;|\u00a0/g, NB);
    this.live['insight-time'] = time;
    return tr`<section class="insight-now"><h4>Что происходит</h4><p><b data-live="insight-time"></b> <span data-live="insight"></span></p>${button}</section>`;
  }

  /** Конкурент: кто, чем берёт, цены, часы, акции */
  private rivalCard(): string {
    const sim = this.sim;
    const rival = sim.rival;
    if (!rival) return '';
    const day = sim.today;
    const t = rival.t;
    const where = t.premises === 'kiosk' ? tr`в киоске у метро` : tr`в кафе напротив`;
    if (day < rival.opensDay) {
      const n = rival.opensDay - day;
      return tr`<div class="rival soon"><b>Через ${n} дн. ${where} откроется ${t.name}</b><small>${t.pitch}. Цены ниже твоих — подумай, чем ты будешь отличаться.</small></div>`;
    }
    const menu = rival.menu(day).map((m) => `${m.name} ${money(m.price)}`).join(' · ');
    const promo = rival.promo(day)
      ? tr`<span class="badge neg">акция −${Math.round(15)} % до конца недели</span>`
      : tr`<small>Следующая акция через ${rival.daysToPromo(day)} дн.</small>`;
    this.live['rival-today'] = String(rival.servedToday);
    return tr`<div class="rival"><div class="row"><b class="grow">Конкурент: ${t.name}</b>${rival.promo(day) ? promo : ''}</div>
      <small>${t.pitch}. ${fmtMinute(t.openAt)}–${fmtMinute(t.closeAt)}.</small>
      <small>${menu}</small>
      <small>Сегодня у него гостей: <b data-live="rival-today"></b>${rival.promo(day) ? '' : ` · ${promo.replace(/<\/?small>/g, '')}`}</small></div>`;
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
        return tr`<li><div class="grow"><b>${escapeHtml(m.name)}</b>
            <small>${taste ? `${taste} · ` : ''}себестоимость ${money(m.cost)} · по вкусу ${fans} жителям</small></div>
          ${
            inMenu
              ? L('<span class="badge on">в меню</span>')
              : tr`<button class="small" data-action="add-item" data-item="${m.id}" ${cafe.menu.length >= MAX_MENU ? 'disabled' : ''}>Вернуть</button>`
          }
          <button class="icon" data-action="dish-delete" data-item="${m.id}" aria-label="Забыть блюдо">✕</button></li>`;
      })
      .join('');
    const head = tr`<h4>Свои блюда · ${cafe.own.length} из ${MAX_OWN}</h4>`;
    const list = own ? `<ul class="menu">${own}</ul>` : tr`<p class="hint-line">Собери блюдо под вкус своих гостей: основа и до двух добавок. Вкус блюда видно сразу, а в карточках жителей — что любят они.</p>`;
    if (!this.dish) {
      const can = cafe.own.length < MAX_OWN;
      return `${head}${list}<button class="secondary" data-action="dish-open" ${can ? '' : 'disabled'}>${can ? L('Придумать блюдо') : tr`Своих блюд уже ${MAX_OWN} — забудь одно, чтобы придумать новое`}</button>`;
    }
    this.modalHtml = this.modalSheet(L('Придумать блюдо'), this.dishBuilder(), 'dish-close');
    return `${head}${list}`;
  }

  /** Окно поверх игры с заголовком и крестиком */
  private modalSheet(title: string, body: string, close: string): string {
    return `<div class="modal-sheet" role="dialog" aria-label="${title}">
      <div class="modal-head"><b>${title}</b><button data-action="${close}" aria-label="${L('Закрыть')}">✕</button></div>
      <div class="modal-body">${body}</div></div>`;
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
        .join(tr` и `);
      const prep = dishPrep(id);
      const need = cafe.missingEquipment(id);
      const exists = cafe.own.some((m) => m.id === id);
      const full = cafe.menu.length >= MAX_MENU;
      const fresh = (Object.keys(recipeOf(id)) as IngredientId[]).filter((i) => cafe.stock.qty(i) <= 0 && cafe.stock.keep[i] <= 0);
      const block = exists
        ? tr`Такое блюдо уже есть`
        : need
          ? tr`Нужна покупка: ${EQUIPMENT[need].name.toLowerCase()}`
          : full
            ? tr`В меню нет места — убери позицию`
            : '';
      body = tr`
        <small>Добавки · до ${MAX_ADDINS}</small>
        <div class="chips">${addIns}</div>
        <div class="profile">${bars}</div>
        <p class="hint-line">По вкусу <b>${fans.fans}</b> жителям из ${fans.total}${who ? tr`, больше всего ${who}` : ''}.</p>
        <small>Себестоимость ${money(cost)}${prep > 0 ? tr` · готовится на ${String(Math.round(prep * 10) / 10).replace('.', ',')} мин дольше` : ''}</small>
        <input class="dish-name" data-action="dish-name" maxlength="${DISH_NAME_MAX}" value="${escapeHtml(d.name ?? defaultDishName(id))}" aria-label="Название блюда" enterkeyhint="done" />
        <div class="row">
          <span class="grow">Цена</span>
          <div class="stepper">
            <button data-action="dish-price-down" aria-label="Дешевле">−</button>
            <span>${money(price)}</span>
            <button data-action="dish-price-up" aria-label="Дороже">+</button>
          </div>
        </div>
        ${fresh.length ? tr`<small>${capitalize(fresh.map((i) => INGREDIENTS.find((x) => x.id === i)!.name.toLowerCase()).join(', '))} — на складе нет. Закажу по 15 порций, привезут утром</small>` : ''}
        <button class="primary" data-action="dish-create" ${block ? 'disabled' : ''}>${block || L('Добавить в меню')}</button>`;
    }
    return tr`<div class="dish-builder">
        <small>Основа</small>
        <div class="chips">${bases}</div>
        ${body}
        <button class="secondary" data-action="dish-close">Отмена</button>
      </div>`;
  }

  /** Игрок сам менял название в поле — тогда его не перезаписываем */
  private dishNamed(): boolean {
    const input = this.modal.querySelector<HTMLInputElement>('input[data-action="dish-name"]');
    if (!input || !this.dish?.base) return this.dish?.name != null;
    return input.value !== defaultDishName(dishId(this.dish.base, this.dish.addIns));
  }

  /** Запомнить, что набрано в поле названия, перед пересборкой панели */
  private keepDishName(): void {
    const input = this.modal.querySelector<HTMLInputElement>('input[data-action="dish-name"]');
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
    const word = n === 1 ? L('категория') : n <= 4 ? L('категории') : L('категорий');
    const slow = Math.round((this.sim.cafe.menuSlowdown - 1) * 100);
    const deep = tr`Где в категории 3+ позиции, за ней заходят охотнее (+${Math.round((FOCUS.depth - 1) * 100)} %) — есть из чего выбрать.`;
    const pace =
      slow > 0
        ? tr`${n} ${word} в меню: стойка работает медленнее на ${slow} % — каждая категория сверх трёх добавляет 15 %.`
        : tr`${n} ${word} в меню. Больше трёх — и стойка начнёт работать медленнее.`;
    return `${pace} ${deep}`;
  }

  /**
   * Ты за стойкой. Без персонала — всё время работы (до ECONOMY.ownerHours), отдельные часы не нужны.
   * С персоналом — когда никого нет, плюс свои часы вместе с ними (например, утренний пик)
   */
  private ownerCard(): string {
    const cafe = this.sim.cafe;
    if (cafe.ownerAway)
      return tr`<small>Ты стоишь за стойкой в первой точке. Здесь работают только бариста: найми их на все часы работы.</small>`;
    const pace = tr`${cafe.has('machine') ? '3' : '4'} мин на гостя`;
    const alone = !cafe.staff.length;
    // Если и так стоишь весь день (персонала нет или он не закрывает ни часа), свои часы не добавить
    const busyAllDay = alone || [0, 1, 2, 3, 4, 5, 6].every((d) => !cafe.hoursOn(d) || uncoveredMinutes(cafe, d) >= ECONOMY.ownerHours * 60);
    const s = cafe.ownerShift;
    const hours = (list: number[], value: number, action: string) =>
      `<select data-action="${action}" ${busyAllDay ? 'disabled' : ''} aria-label="${action.endsWith('from') ? L('с') : L('до')}">${list
        .map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m % MINUTES_PER_DAY)}${m >= MINUTES_PER_DAY ? L(' ночи') : ''}</option>`)
        .join('')}</select>`;
    const fromList = Array.from({ length: 18 }, (_, k) => hm(6) + k * 60);
    const toList = Array.from({ length: 23 }, (_, k) => hm(7) + k * 60);
    const days = WEEKDAY_SHORT.map(
      (d, wd) =>
        `<button class="chip ${s?.days[wd] ? 'on' : ''} ${wd >= 5 ? 'we' : ''}" data-action="owner-day" data-day="${wd}" aria-pressed="${!!s?.days[wd]}" ${busyAllDay ? 'disabled' : ''}>${d}</button>`,
    ).join('');
    const extra = busyAllDay
      ? alone
        ? tr`<small>Пока персонала нет, ты за стойкой всё время работы — отдельные часы не нужны.</small>`
        : tr`<small>Ты и так стоишь за стойкой весь день — добавить часы некуда.</small>`
      : s
        ? tr`<small>Твои часы вместе с персоналом — в пик две стойки вместо одной:</small>
          <div class="chips">${days}</div>
          <div class="row hours staff-hours">${hours(fromList, s.from, 'owner-from')}<span>—</span>${hours(toList, s.to, 'owner-to')}
          <button class="small ghost" data-action="owner-off">Убрать</button></div>`
        : tr`<div class="row"><small class="grow">Встань за стойку вместе с персоналом в час пик — две стойки вместо одной.</small>
          <button class="small" data-action="owner-on">Добавить часы</button></div>`;
    return tr`<ul class="menu staff"><li class="staff-card owner">
      <div class="row"><div class="grow"><b>Ты · владелец</b><small data-live="owner-status"></small></div></div>
      <small>Бесплатно, ${pace}, не больше ${ECONOMY.ownerHours} ч в день. ${alone ? '' : L('По умолчанию — когда никого из персонала нет.')}</small>
      <p class="hint-line">Сегодня за стойкой: <b data-live="owner-hours"></b> из ${ECONOMY.ownerHours} ч</p>
      ${extra}
    </li></ul>`;
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
          ? L('за стойкой')
          : tr`выйдет, когда кафе откроется`
        : off
          ? tr`отпущен до конца дня`
          : (() => {
              const w = windowOn(st.schedule, cafe.weekday);
              return w ? tr`по графику ${fmtMinute(w.from % MINUTES_PER_DAY)}–${fmtMinute(w.to % MINUTES_PER_DAY)}` : L('сегодня выходной');
            })();
    } else {
      const left = ECONOMY.shiftHours * 60 - st.shiftMinutes;
      status = !st.shiftActive
        ? L('сегодня выходной')
        : left <= 0
          ? tr`смена окончена`
          : open
            ? tr`на смене ещё ${Math.floor(left / 60)} ч ${left % 60} мин`
            : tr`выйдет к открытию`;
    }
    this.live[`staff-${st.id}`] = status;
    const days = WEEKDAY_SHORT.map(
      (d, wd) =>
        `<button class="chip ${st.schedule.days[wd] ? 'on' : ''} ${wd >= 5 ? 'we' : ''}" data-action="staff-day" data-item="${st.id}" data-day="${wd}" aria-pressed="${st.schedule.days[wd]}">${d}</button>`,
    ).join('');
    const hours = (list: number[], value: number, action: string, day?: number) =>
      `<select data-action="${action}" data-item="${st.id}"${day === undefined ? '' : ` data-day="${day}"`} aria-label="${
        day === undefined ? '' : `${WEEKDAY_SHORT[day]}, `
      }${action.endsWith('from') ? L('с') : L('до')}">${list
        .map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m % MINUTES_PER_DAY)}${m >= MINUTES_PER_DAY ? L(' ночи') : ''}</option>`)
        .join('')}</select>`;
    const fromList = Array.from({ length: 18 }, (_, k) => hm(6) + k * 60); // 06:00…23:00
    const toList = Array.from({ length: 23 }, (_, k) => hm(7) + k * 60); // 07:00…05:00
    const s = st.schedule;
    const byDay = this.staffByDay.has(st.id) || !!s.windows?.some((w, d) => w && s.days[d]);
    const dayRows = byDay
      ? tr`<ul class="week-hours staff-days">${s.days
          .map((on, d) => {
            if (!on) return '';
            const w = windowOn(s, d)!;
            const own = !!s.windows?.[d];
            return `<li class="${d === cafe.weekday ? 'today' : ''}${own ? ' own' : ''}"><b>${WEEKDAY_SHORT[d]}</b>${hours(fromList, w.from, 'staff-wfrom', d)}<span>—</span>${hours(toList, w.to, 'staff-wto', d)}</li>`;
          })
          .join('')}</ul>
          <button class="link" data-action="staff-same" data-item="${st.id}">Одинаково каждый день</button>`
      : tr`<button class="link" data-action="staff-by-day" data-item="${st.id}">Свои часы по дням</button>`;
    const hourly =
      st.contract === 'hourly'
        ? tr`${byDay ? tr`<small>Обычные часы</small>` : ''}<div class="row hours staff-hours">${hours(fromList, s.from, 'staff-from')}<span>—</span>${hours(toList, s.to, 'staff-to')}</div>
           ${dayRows}
           <div class="row"><small class="grow">Разовый вызов — только на сегодня, график не меняется</small>
           <button class="small ${working ? 'ghost' : ''}" data-action="duty" data-item="${st.id}">${working ? L('Отпустить сейчас') : L('Вызвать сейчас')}</button></div>`
        : '';
    return tr`<li class="staff-card">
      <div class="row"><div class="grow"><b>Бариста ${i + 1} · ${st.contract === 'shift' ? L('на смене') : L('почасово')}</b>
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
    return tr`<p class="first-week">Первая неделя почти всегда в минусе: вывеска, реклама и стартовые закупки — это вложения в известность. Смотри не на итог, а растёт ли число гостей и тех, кто о тебе знает.</p>`;
  }

  /** Событие ждёт решения — напоминание на обзоре */
  private eventBanner(): string {
    const e = this.sim.pendingEvent;
    if (!e) return '';
    const c = card(e);
    return tr`<div class="event-banner"><span>${c.icon}</span><div class="grow"><b>${c.title}</b><small>Ждёт решения до конца дня</small></div>
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
        return tr`<li class="face" data-action="face" data-item="${r.id}">
          ${portrait(r, true, 'md')}
          <div class="grow"><b>${r.name}</b><small>${g.trait} · любит: ${fav.toLowerCase()}</small></div>
          <span class="badge ${cls}">${statusText(g.status, r.name)}</span>
        </li>`;
      })
      .join('');
    return tr`<h4>Знакомые лица</h4>
      <small>Шесть жителей, за которыми видно, как к тебе привыкают. На карте — со звёздочкой, золотой у постоянных.</small>
      <ul class="menu faces">${rows}</ul>`;
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
          ? tr`<span class="badge on">день ${reached}</span>`
          : target > 1
            ? `<span class="badge">${m.id === 'cushion' ? `${Math.round((done / target) * 100)}${NB}%` : tr`${Math.min(done, target)} из ${target}`}</span>`
            : '';
      const bar =
        reached === undefined && target > 1
          ? `<div class="meter"><i style="width:${Math.min(100, Math.round((done / target) * 100))}%"></i></div>`
          : '';
      return `<li class="milestone ${reached !== undefined ? 'done' : ''}">
        <div class="row">${namedIcon(`ms-${m.id}`, 'icon ms')}<b class="grow">${reached !== undefined ? '✓ ' : ''}${m.title}</b>${progress}</div>
        <small>${m.hint}${now && reached === undefined ? ` · ${now}` : ''}${opens ? tr` · открывает: ${opens.name.toLowerCase()}` : ''}</small>
        ${bar}
      </li>`;
    }).join('');
    const kiosk = sim.cafe.premisesId === 'kiosk';
    const ups = UPGRADES.map((u) => {
      const st = sim.upgradeState(u.id);
      // У киоска улучшения живут во вкладке «Стойка»
      if (st === 'premises' || kiosk) return '';
      const badge = st === 'owned' ? L('<span class="badge on">установлено</span>') : `<span class="badge">${money(u.cost)}</span>`;
      const control =
        st === 'owned'
          ? ''
          : st === 'locked'
            ? tr`<small class="lock">Откроется после вехи «${milestone(u.unlock!).title}»</small>`
            : `<button class="small" data-action="buy-upgrade" data-item="${u.id}" ${st === 'money' ? 'disabled' : ''}>${
                st === 'money' ? tr`Не хватает денег` : tr`Купить за ${money(u.cost)}`
              }</button>`;
      return `<li class="upgrade"><div class="row">${namedIcon(`eq-${u.id}`)}<b class="grow">${u.name}</b>${badge}</div><small>${u.effect}</small>${control}</li>`;
    }).join('');
    const count = Object.keys(sim.milestones).length;
    return tr`
      <h4>Вехи первой точки · ${count} из ${MILESTONES.length}</h4>
      <ul class="menu milestones">${ms}</ul>
      <h4>Улучшения</h4>
      ${
        kiosk
          ? tr`<small>Улучшения киоска — во вкладке «Стойка»: там видно, где что стоит.</small>
             <button class="secondary" data-action="tab" data-item="stand">Открыть стойку</button>`
          : tr`<small>Покупаются один раз и меняют возможности заведения. Это вложение: в прибыль дня не входит, но из кассы уходит.</small>
      <ul class="menu upgrades">${ups}</ul>`
      }
      ${this.loanBlock()}`;
  }

  /** Кредит: текущий долг и платежи или предложения банка и частника */
  private loanBlock(): string {
    const sim = this.sim;
    if (!sim.cafe.opened) return '';
    const head = tr`<h4 id="loan">Кредит</h4><small>Помощь, чтобы пережить трудную неделю или вложиться в рост. Один кредит за раз, проценты — расход дня.</small>`;
    const l = sim.loan;
    if (l) {
      const pay = weeklyPayment(l);
      const next = Math.min(l.left, pay.principal) + pay.interest;
      return tr`${head}<div class="loan on">
          <div class="row"><b class="grow">${LOAN_LABEL[l.source]} · ${money(l.amount)}</b><span class="badge">${l.paidWeeks} из ${LOAN_TERMS[l.source].weeks} нед.</span></div>
          <small>Осталось вернуть ${money(l.left)}. Следующий платёж ${money(next)} (из них проценты ${money(pay.interest)}) — в конце дня ${l.nextDue}.${
            l.late ? tr` Просрочек: ${l.late} — каждая добавляет штраф к долгу.` : ''
          }</small>
          <button class="small" data-action="loan-repay" ${sim.cash < l.left ? 'disabled' : ''}>${sim.cash < l.left ? tr`На досрочное погашение нужно ${money(l.left)}` : tr`Погасить досрочно · ${money(l.left)}`}</button>
        </div>`;
    }
    const diag = cashDiagnosis(sim.reports);
    const span = tr`${diag.span} дн.`;
    const diagText =
      diag.kind === 'early'
        ? tr`Точка работает меньше трёх дней — пока не видно, хватит ли прибыли на платежи.`
        : diag.kind === 'profit'
          ? tr`За последние ${span} точка заработала <b>${money(diag.weekProfit)}</b>${
              diag.invested > 0 ? tr`, а ${money(diag.invested)} ушло во вложения. Кредит поможет пережить разрыв, пока они окупаются.` : tr` — платить есть из чего.`
            }`
          : tr`За последние ${span} точка сама в минусе: <b>${money(diag.weekProfit)}</b>. Кредит отложит закрытие, но не исправит его — сначала посмотри в отчёте, почему гости не заходят.`;
    const diagBlock = `<p class="loan-diag ${diag.kind}">${diagText}</p>`;
    const offers = (['bank', 'private'] as LoanSource[])
      .map((src) => {
        const o = sim.loanOffer(src);
        const t = LOAN_TERMS[src];
        const terms = tr`${t.weeks} нед., ${Math.round(t.weeklyRate * 100)} % в неделю`;
        const about = src === 'bank' ? tr`Сумма зависит от истории: недели в плюсе, вехи, платежи вовремя.` : tr`Даёт сразу и всем, но дорого. Не больше ${LOAN.privateTimes} раз за игру, просрочка — штраф 10 % долга.`;
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
              ? tr`<small>При прибыли как за последнюю неделю после платежа останется ${money(left)} в неделю.</small>`
              : warnLine(tr`Платёж ${money(weekly)} в неделю больше недельной прибыли (${money(left + weekly)}) — платить придётся из кассы`);
        return tr`<li class="loan"><div class="row"><b class="grow">${LOAN_LABEL[src]}</b><span class="badge">${terms}</span></div>
            <small>${about} Сейчас дадут до ${money(o.max)}.</small>
            <div class="row"><span class="grow">Сумма</span><div class="stepper">
              <button data-action="loan-down" data-item="${src}" aria-label="Меньше">−</button><span>${money(amount)}</span>
              <button data-action="loan-up" data-item="${src}" aria-label="Больше">+</button></div></div>
            <small>Вернёшь ${money(amount + extra)}: ${t.weeks} ${t.weeks % 10 >= 2 && t.weeks % 10 <= 4 && (t.weeks < 10 || t.weeks > 20) ? L('платежа') : L('платежей')} по ${money(weeklyPayment({ source: src, amount }).principal + weeklyPayment({ source: src, amount }).interest)}, переплата ${money(extra)}.</small>
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
        const when = `${n.day === today ? L('сегодня') : tr`день ${n.day}`}, ${fmtMinute(n.minute)}`;
        const what = n.ok
          ? `${n.itemId ? itemName(n.itemId) : ''}`
          : tr`не ${f ? L('зашла') : L('зашёл')}: ${REJECT_LABEL[n.reason!].toLowerCase()}`;
        return `<li class="${n.ok ? 'ok' : 'no'}"><span>${when}</span>${what}</li>`;
      })
      .join('');
    const fav = itemName(r.favorites[g.usual]);
    return tr`<div class="face-card">
        <div class="row"><b class="grow">★ ${g.trait}</b><span class="badge ${g.status === 'regular' ? 'on' : g.status === 'lost' ? 'neg' : ''}">${statusText(g.status, r.name)}</span></div>
        <small>Обычно берёт ${USUAL[g.usual]}, любимое — ${fav.toLowerCase()}.${
          g.status === 'lost' && g.lostReason ? tr` Перестал${f ? L('а') : ''} заходить: ${REJECT_LABEL[g.lostReason].toLowerCase()}.` : ''
        }</small>
        ${notes ? `<ul class="history">${notes}</ul>` : `<small>${r.aware ? tr`Ещё ни разу не ${f ? L('хотела') : L('хотел')} зайти` : tr`О кафе пока не знает`}</small>`}
      </div>`;
  }

  private adsTab(): string {
    return this.marketingTab('ads');
  }

  private promoTab(): string {
    return this.marketingTab('promo');
  }

  private marketingTab(part: 'ads' | 'promo'): string {
    const { marketing: mk } = this.sim;
    const total = this.sim.residents.length;
    const aware = this.sim.awareCount;
    this.live.aware = tr`${aware} из ${total}`;
    this.liveWidth.awarebar = `${Math.round((aware / total) * 100)}%`;
    this.live.mkt = money(this.sim.cafe.today.marketing);
    const happy = mk.happy;
    const hours = Array.from({ length: 17 }, (_, i) => hm(7) + i * 60); // 07:00…23:00
    const opt = (v: number | undefined) =>
      hours.map((m) => `<option value="${m}" ${m === v ? 'selected' : ''}>${fmtMinute(m)}</option>`).join('');
    const disc = [0, 0.1, 0.2, 0.3]
      .map((d) => `<option value="${d}" ${(happy?.discount ?? 0) === d ? 'selected' : ''}>${d === 0 ? L('выкл.') : `−${d * 100}${NB}%`}</option>`)
      .join('');
    const channel = (title: string, note: string, control: string, icon: string) =>
      `<li>${namedIcon(icon)}<div class="grow"><b>${title}</b><small>${note}</small></div>${control}</li>`;
    const ads = tr`
      <div class="aware">
        <div class="row"><span class="grow">Знают о кафе</span><b data-live="aware"></b></div>
        <div class="meter"><i data-live-width="awarebar"></i></div>
        <small>Кто не знает, тот не зайдёт, даже если очень хочет кофе.</small>
      </div>
      <h4>Как узнают</h4>
      <ul class="menu">
        ${channel(
          L('Вывеска'),
          tr`Прохожие замечают кафе втрое чаще. Разово ${money(MARKETING.signCost)}`,
          mk.sign ? L('<span class="badge on">висит</span>') : tr`<button class="small" data-action="sign">Повесить</button>`,
          'mk-sign',
        )}
        ${channel(
          tr`Листовки у метро`,
          tr`Утром и вечером — узнают офисные. ${money(MARKETING.flyersPerDay)} в день`,
          `<button class="small ${mk.flyers ? 'ghost' : ''}" data-action="flyers">${mk.flyers ? L('Остановить') : L('Раздавать')}</button>`,
          'mk-flyers',
        )}
        ${channel(
          L('Соцсети'),
          tr`Узнают молодёжь и студенты. ${money(MARKETING.socialCampaign)} за ${MARKETING.socialDays} дней`,
          mk.socialDaysLeft > 0
            ? tr`<span class="badge on">ещё ${mk.socialDaysLeft} дн.</span>`
            : tr`<button class="small" data-action="social">Запустить</button>`,
          'mk-social',
        )}
        ${channel(L('Сарафан'), tr`Постоянные гости сами рассказывают соседям и коллегам. Бесплатно`, L('<span class="badge on">работает</span>'), 'mk-word')}
      </ul>
    `;
    const promo = tr`
      <h4>Акции</h4>
      <ul class="menu">
        <li>${namedIcon('mk-happy')}<div class="grow"><b>Счастливые часы</b><small>Скидка на всё меню в выбранное время — чтобы заполнить пустые часы</small>
          <div class="row hours happy">
            <select data-action="happy-from" aria-label="С">${opt(happy?.from ?? hm(15))}</select><span>—</span>
            <select data-action="happy-to" aria-label="До">${opt(happy?.to ?? hm(17))}</select>
            <select data-action="happy-disc" aria-label="Скидка">${disc}</select>
          </div></div></li>
        ${channel(
          L('Карта лояльности'),
          tr`Каждый ${MARKETING.loyaltyEvery}-й кофе в подарок. Постоянные возвращаются чаще и охотнее рассказывают о тебе`,
          `<button class="small ${mk.loyaltyCard ? 'ghost' : ''}" data-action="card">${mk.loyaltyCard ? L('Выключить') : L('Включить')}</button>`,
          'mk-loyalty',
        )}
      </ul>
      `;
    const spent = tr`<p class="wages">Сегодня на рекламу и акции: <b data-live="mkt"></b></p>`;
    return (part === 'ads' ? ads : promo) + spent;
  }

  private restartBlock(): string {
    return this.restartLinks() + this.langLink();
  }

  /** Язык игры: подпись — на том языке, на который переключаем */
  private langLink(): string {
    if (PLATFORM === 'vk') return '';
    const other = getLang() === 'ru' ? 'English' : /* i18n-skip */ 'Русский';
    return `<div class="links"><button class="link" data-action="lang">🌐 ${other}</button></div>`;
  }

  private restartLinks(): string {
    return this.confirmRestart
      ? tr`<div class="restart"><small>Кафе, деньги и весь прогресс сотрутся.</small>
          <div class="hire"><button class="small" data-action="restart-ask">Отмена</button>
          <button class="small danger" data-action="restart">Да, начать заново</button></div></div>`
      : IS_PORTAL
        ? tr`<div class="links">
           <button class="link" data-action="tutorial">Как играть</button>
           <button class="link" data-action="restart-ask">Начать заново</button>
         </div>
         <small class="saved">Игра сохраняется автоматически</small>`
        : tr`<div class="links">
           <button class="link" data-action="feedback">Предложить идею</button>
           <button class="link" data-action="tutorial">Как играть</button>
           <button class="link" data-action="restart-ask">Начать заново</button>
         </div>
         ${this.challenge ? '' : this.transferBlock()}
         ${
           this.challenge
             ? tr`<div class="links">${savedResult() ? tr`<button class="link" data-action="challenge-result">Мой итог испытания</button>` : ''}<button class="link" data-action="normal-game">К обычной игре</button></div>`
             : `<div class="links"><button class="link" data-action="challenge">🏆 ${CHALLENGE.title}</button></div>`
         }
         <small class="saved">Игра сохраняется автоматически в этом браузере</small>`;
  }

  /** Перенос игры файлом: на другой телефон или компьютер, на новый адрес игры. В испытании не нужен */
  private transferBlock(): string {
    if (!this.transfer) return tr`<div class="links"><button class="link" data-action="transfer">Перенести игру на другое устройство</button></div>`;
    return tr`<div class="restart transfer">
        <small>Скачай файл с игрой и открой его на другом устройстве или по новому адресу игры — кафе, деньги и жители будут на месте.</small>
        <div class="hire">
          <button class="small" data-action="save-export">Скачать файл</button>
          <label class="small button-like">Загрузить файл<input type="file" accept=".json,application/json" data-action="save-import" hidden /></label>
          <button class="small ghost" data-action="transfer">Закрыть</button>
        </div>
        <small class="transfer-note">Загрузка заменит текущую игру в этом браузере.</small>
        ${this.transferError ? `<small class="transfer-error">${escapeHtml(this.transferError)}</small>` : ''}
      </div>`;
  }

  /** На экране выбора помещения: что за испытание и как считается итог */
  private challengeBanner(): string {
    if (!this.challenge) return '';
    return tr`<div class="event-banner"><span>🏆</span><div class="grow"><b>${CHALLENGE.title}</b>
      <small>У всех тот же город: те же жители, погода и события. Итог — касса в конце ${CHALLENGE.days}-го дня.</small></div></div>`;
  }

  /** Что кончается или испортится — подсказка на обзоре */
  private stockWarning(): string {
    const { stock, menu } = this.sim.cafe;
    const cant = menu.filter((m) => !stock.canMake(m.id)).map((m) => m.name);
    if (cant.length) return tr`⚠ Нет в наличии: ${cant.join(', ')}. Закажи на складе`;
    return L('Склад в порядке');
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
                ? tr`нет — ${INGREDIENT_ACC[c.limit]} привезут к 6:00`
                : tr`нет — кончилось: ${ingredient(c.limit).name.toLowerCase()}`
              : tr`упирается в ${INGREDIENT_ACC[c.limit]}`;
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
        [exp > 0 ? tr`испортится сегодня: ${Math.round(exp)}` : '', pend > 0 ? tr`едет к 6:00: ${pend}` : '']
          .filter(Boolean)
          .join(' · ') || ' ';
      const step = id === 'bakery' ? 2 : 5;
      const keep = (weekend: boolean) => {
        const v = weekend ? stock.keepWeekend[id] : stock.keep[id];
        return tr`<div class="stepper mini">
          <button data-action="keep-down" data-item="${id}" data-weekend="${weekend}" data-step="${step}" aria-label="Меньше">−</button>
          <span>${v}</span>
          <button data-action="keep-up" data-item="${id}" data-weekend="${weekend}" data-step="${step}" aria-label="Больше">+</button>
        </div>`;
      };
      const life = ing.shelfDays === null ? tr`не портится` : tr`хранится ${ing.shelfDays} дн.`;
      // Главное число — на сколько рабочих дней хватит при нынешнем расходе
      const lasts =
        goes.length === 0
          ? tr`не нужно для меню`
          : left === null
            ? use
              ? tr`не расходовалось`
              : tr`расход пока неизвестен`
            : left < 1
              ? tr`<b class="bad">хватит меньше чем на день</b>`
              : tr`хватит на <b>${daysText(left)}</b>`;
      const u = use?.[id] ?? 0;
      const perDay = u > 0 ? tr` · уходит ${u < 1 ? tr`меньше 1` : `~${Math.round(u)}`} в день` : '';
      return tr`<li class="${goes.length ? '' : 'unused'}${left !== null && left < 1 ? ' short' : ''}">
        <div class="row">${namedIcon(ingredientIcon(id))}<div class="grow"><b>${ing.name}</b>
          <small>${lasts}${perDay}</small></div>
          <div class="qty"><b data-live="st-${id}"></b><small>порц.</small></div></div>
        ${goes.length ? tr`<div class="goes"><small>идёт в</small>${goes.map((g) => iconImg(g, 'icon mini')).join('')}</div>` : ''}
        <small class="exp" data-live="stx-${id}"></small>
        <small>${life} · ${money(ing.unitCost)} за порцию</small>
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
    return tr`
      <h4>Можно приготовить</h4>
      <small>Сколько порций выйдет, если готовить только эту позицию: ингредиенты у позиций общие, поэтому числа не складываются.</small>
      <ul class="menu cookable">${cook}</ul>
      <h4>Ингредиенты</h4>
      <small>«Хватит на» — с тем, что едет, при расходе последних ${USE_DAYS} рабочих дней. Поставщик привозит заказ в 6:00. Опт: от 100 порций −10 %, от 300 — −20 %.
        Скоропорт в конце срока списывается. Автозаказ каждую ночь добирает склад до уровня «держать» —
        отдельно на будни и выходные.</small>
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
          ? tr`Касса в минусе ${o.inRed}-й день. Если на ${ECONOMY.bankruptDays}-й день не выйти в плюс — банкротство.`
          : tr`Касса в минусе. Если к концу дня не выйти в плюс, пойдёт отсчёт: ${ECONOMY.bankruptDays} дня подряд — банкротство.`;
    } else if (o.days <= 3) {
      head = tr`Денег хватит примерно на ${o.days} дн. постоянных расходов — ${money(o.daily)} в день.`;
    } else return '';
    const options: string[] = [];
    if (!sim.loan) options.push(tr`<button class="small" data-action="goto-tab" data-item="growth">Кредит</button>`);
    if (sim.marketing.flyers) options.push(tr`<button class="small" data-action="flyers">Остановить листовки</button>`);
    if (sim.cafe.staff.length) options.push(tr`<button class="small" data-action="goto-tab" data-item="staff">Персонал</button>`);
    options.push(tr`<button class="small" data-action="goto-tab" data-item="stock">Снизить запасы</button>`);
    options.push(tr`<button class="small" data-action="goto-tab" data-item="overview">Часы работы</button>`);
    return tr`<div class="cash-warn"><b>${head}</b>
      <small>Что можно сделать: меньше часов в пустое время, отпустить бариста, не держать лишний запас, остановить платную рекламу. Пережить трудную неделю поможет кредит — вкладка «Развитие».</small>
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
        const title = tr`${String(h).padStart(2, '0')}:00 — гостей ${served[h]}, ушли ${lost[h]}`;
        return `<div class="bar" title="${title}"><i class="lost" style="height:${l}px"></i><i class="served" style="height:${g}px"></i>${
          h % 3 === 0 ? `<span>${h}</span>` : ''
        }</div>`;
      })
      .join('');
    return `<div class="hours-chart">${bars}</div>
      <div class="legend-line"><span><i class="served"></i>${r.opened ? L('обслужены') : ''}</span><span><i class="lost"></i>${r.opened ? L('ушли') : tr`хотели зайти`}</span></div>`;
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
    if (open) return cafe.allDay ? L('Круглосуточно') : tr`Открыто до ${fmtMinute(cafe.closeAt % MINUTES_PER_DAY)}`;
    const next = cafe.nextOpening(minute);
    if (!next) return L('Закрыто');
    const at = fmtMinute(next.at % MINUTES_PER_DAY);
    if (next.inDays === 0) return tr`Закрыто до ${at}`;
    const day = next.inDays === 1 ? L('завтра') : tr`в ${WEEKDAY_SHORT[(cafe.weekday + next.inDays) % 7]}`;
    return tr`${cafe.dayOff ? L('Выходной') : L('Закрыто')}, откроемся ${day} в ${at}`;
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
    const tabs = ([['day', L('День')], ['week', L('Неделя')], ['month', L('Месяц')]] as const)
      .map(([id, label]) => `<button class="chip${this.reportPeriod === id ? ' on' : ''}" data-action="report-period" data-item="${id}">${label}</button>`)
      .join('');
    return tr`<div class="period-bar">
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
    const name = p.kind === 'week' ? tr`Неделя ${p.index}` : tr`Месяц ${p.index}`;
    const lastDay = s.days.at(-1)?.day ?? p.from;
    const head = tr`<div class="card-head"><div><b>${name}</b><small>${p.from}–${Math.min(p.to, lastDay)} день${
      s.complete ? '' : tr` · идёт`
    } · ${num(s.guests)} гостей из ${num(s.wanted)}, кто хотел зайти</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button></div>`;
    if (s.openDays === 0) return tr`${head}${this.periodBar()}<p class="hint-line">В этот период точка ещё не работала.</p>`;

    const avg = s.guests ? Math.round(s.revenue / s.guests) : 0;
    const kpis = tr`<div class="kpis">
        <div><small>Гостей</small><b>${num(s.guests)}</b></div>
        <div><small>Выручка</small><b>${money(s.revenue)}</b></div>
        ${p.kind === 'week' ? tr`<div><small>Средний чек</small><b>${money(avg)}</b></div>` : ''}
      </div>`;

    // Столбики: неделя — по дням, месяц — по неделям
    const short = (v: number) => tr`${v >= 0 ? '+' : '−'}${String(Math.round(Math.abs(v) / 100) / 10).replace('.', ',')}к`;
    const columns: [string, number][] =
      p.kind === 'week'
        ? s.days.map((r) => [WEEKDAY_SHORT[r.weekday ?? 0], r.profit])
        : [0, 1, 2, 3].map((i) => {
            const days = s.days.filter((r) => r.day >= p.from + i * 7 && r.day < p.from + (i + 1) * 7);
            return [tr`${i + 1} нед.`, days.reduce((x, r) => x + r.profit, 0)] as [string, number];
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
      daily = tr`<div class="split"><div class="spark">${vals
        .map((v) => {
          const h = Math.min(100, Math.round((Math.abs(v) / scale) * 100));
          return `<div><i class="up" style="height:${v >= 0 ? h : 0}%"></i><i class="down" style="height:${v < 0 ? h : 0}%"></i></div>`;
        })
        .join('')}</div><small>Итог каждого дня: над чертой — в плюсе, под ней — в минусе${
        clipped ? tr`. Самый большой день (${money(Math.round(vals.find((v) => Math.abs(v) === sorted[0])!))}) не влез в шкалу` : ''
      }.</small></div>`;
    }

    // Куда ушли деньги: из каждых 100 ₽ выручки
    const base = Math.max(1, s.revenue);
    const parts = COST_LINES.filter(([k]) => s.costs[k] > 0).map(([k, label]) => [k, label, s.costs[k]] as [string, string, number]);
    if (s.profit > 0) parts.push(['profit', L('Прибыль'), s.profit]);
    const pct = (v: number) => Math.round((v / base) * 100);
    const split = tr`<div class="split"><small>Из каждых 100 ₽ выручки</small>
        <div class="split-bar">${parts.map(([k, , v]) => `<i class="c-${k}" style="flex:${Math.max(0.5, pct(v))}"></i>`).join('')}</div>
        <ul>${parts
          .map(([k, label, v]) => `<li><i class="c-${k}"></i><span>${label}</span><small>${pct(v)}${NB}%</small><b class="${k === 'profit' ? 'pos' : ''}">${k === 'profit' ? '+' : '−'}${money(v)}</b></li>`)
          .join('')}</ul>
        ${s.profit < 0 ? tr`<small class="neg">Расходы больше выручки: итог −${money(-s.profit)}</small>` : ''}
      </div>`;

    const notes = insights(s, itemName, (r) => REASON_BECAUSE[r] ?? REJECT_LABEL[r].toLowerCase());
    const maxMargin = Math.max(1, ...s.items.map((i) => i.margin));
    const items = s.items
      .map(
        (i) => tr`<li>${iconImg(i.id)}<div class="grow"><div class="row"><b class="grow">${escapeHtml(itemName(i.id))}</b><b class="pos">${money(i.margin)}</b></div>
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

    return tr`${head}
      ${this.periodBar()}
      ${this.resultBlock(p.kind === 'week' ? L('Итог недели') : L('Итог месяца'), s.profit, compareLine(s, prev))}
      ${kpis}
      <h4>${p.kind === 'week' ? tr`Итог по дням` : tr`По неделям`}</h4>
      ${bars}
      ${daily}
      <h4>Куда ушли деньги</h4>
      ${split}
      ${notes.length ? tr`<h4>Главное</h4><ul class="observations">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${items ? tr`<h4>Что приносит деньги</h4><ul class="items-margin">${items}</ul><small>Зелёное — маржа: выручка минус себестоимость</small>` : ''}
      <h4>Гости: от желания до покупки</h4><ul class="funnel">${funnelHtml}</ul>
      ${reasonsHtml ? tr`<h4>Почему не зашли</h4><ul class="reason-bars">${reasonsHtml}</ul>` : ''}`;
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
        const hint = need && !this.sim.cafe.equipment.includes(need) && this.sim.cafe.premises.kinds.includes(kind) ? tr`<small>нужно: ${EQUIPMENT[need].name.toLowerCase()}</small>` : '';
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
      ? tr`<div class="forecast"><small>Завтра · ${WEEKDAY_FULL[weekday(next)]}</small>
          <b>${weatherShort(r.forecast)} ${WEATHER_LABEL[r.forecast.kind]}</b>
          <span>${WEATHER_HINT[r.forecast.kind]}${
            isWeekend(next) ? tr`. Выходной: офисные не придут, зато больше гуляют` : ''
          }</span></div>`
      : '';

    return tr`
      <div class="card-head"><div><b>Итоги дня ${r.day}</b><small>${r.weekday !== undefined ? WEEKDAY_FULL[r.weekday] : ''}${
        r.weather ? ` · ${weatherShort(r.weather)} ${WEATHER_LABEL[r.weather.kind].toLowerCase()}` : ''
      } · ${r.guests} гостей из ${r.wanted}, кто хотел зайти</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button></div>
      ${this.cashWarning()}
      ${this.periodBar()}
      ${r.opened ? this.resultBlock(L('Итог дня'), r.profit, a.compare) : ''}
      <div class="insight">
        ${r.opened ? '' : `<b>${a.headline}</b>`}
        ${a.factor ? `<p>${a.factor}</p>` : ''}
        ${this.firstWeekNote(r)}
      </div>
      ${(r.milestones ?? []).map((id) => tr`<div class="milestone-hit">Веха: <b>${milestone(id).title}</b>${
        UPGRADES.some((u) => u.unlock === id && u.premises.includes(this.sim.cafe.premisesId))
          ? tr` · <button class="link" data-action="goto-tab" data-item="growth">открыто улучшение</button>`
          : ''
      }</div>`).join('')}
      ${r.events?.length ? tr`<h4>События дня</h4><ul class="news">${r.events.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${r.news?.length ? tr`<h4>Знакомые лица</h4><ul class="news">${r.news.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${this.hourChart(r)}
      ${r.rivalGuests !== undefined ? tr`<p class="rival-line">У конкурента сегодня гостей: <b>${r.rivalGuests}</b>${r.rivalPromo ? tr` (шла акция)` : ''}${r.missed.rival ? tr` · ушли к нему от тебя: <b>${r.missed.rival}</b>` : ''}</p>` : ''}
      ${a.lost ? `<p class="lost-line">${describeLost(a.lost)}</p>` : ''}
      ${a.observations.length ? tr`<h4>Стоит проверить</h4><ul class="observations">${a.observations.map((o) => `<li>${o}</li>`).join('')}</ul>` : ''}
      ${changes ? tr`<h4>Изменения за день</h4><ul class="changes">${changes}</ul>` : ''}
      ${forecast}
      ${
        r.opened
          ? tr`<h4>Деньги</h4><table class="pnl">
        ${row(L('Выручка'), r.revenue)}
        ${row(L('Расход на продукты'), -foodLine(r))}
        ${row(L('Аренда'), -r.rent)}
        ${row(L('Коммуналка'), -r.utilities)}
        ${r.wages ? row(L('Зарплата'), -r.wages) : ''}
        ${row(tr`Налог 6 %`, -r.tax)}
        ${r.marketing ? row(L('Маркетинг'), -r.marketing) : ''}
        ${r.other ? row(L('События'), -r.other) : ''}
        ${r.interest ? row(L('Проценты по${NB}кредиту'), -r.interest) : ''}
        ${row(L('Итог дня'), r.profit, r.profit >= 0 ? 'total pos' : 'total neg')}
        ${r.food !== undefined && r.purchases ? row(L('Закуплено на склад'), -r.purchases) : ''}
        ${r.invested ? row(L('Вложено в улучшения'), -r.invested) : ''}
        ${r.loanTaken ? row(L('Взят кредит'), r.loanTaken) : ''}
        ${r.loanPaid ? row(L('Возврат долга'), -r.loanPaid) : ''}
        ${r.loanFine ? row(L('Штраф за${NB}просрочку (к${NB}долгу)'), -r.loanFine) : ''}
        ${row(L('В кассе'), r.cashAfter, 'cash')}
      </table>
      <small>Себестоимость проданного: ${money(r.cogs)}${r.extras ? tr` · дозаказов: ${r.extras}` : ''}${r.company ? tr` · пришли с постоянными: ${r.company}` : ''}${r.styleGuests ? tr` · сели ради стиля зала: ${r.styleGuests}` : ''}${
        r.writtenOff ? tr` · списано (испортилось): ${money(r.writtenOff)} — ${spoiled}` : ''
      }</small>`
          : ''
      }
      ${kinds ? `<h4>${r.opened ? tr`Кто не зашёл` : tr`Кто хотел зайти`}</h4><ul class="kinds">${kinds}</ul>` : ''}
      ${missed ? tr`<h4>Не зашли — почему</h4><ul class="reasons">${missed}</ul>` : ''}
      ${learned ? tr`<h4>Узнали о кафе: +${learnedTotal} · всего ${r.awareCount} из ${this.sim.residents.length}</h4><ul class="sold">${learned}</ul>` : ''}
      ${r.giveaways ? tr`<small>По карте лояльности подарено кофе на ${money(r.giveaways)}</small>` : ''}
      ${missing ? tr`<h4>Искали, но не нашли в меню</h4><ul class="sold">${missing}</ul>` : ''}
      ${sold ? tr`<h4>Продажи</h4><ul class="sold">${sold}</ul>` : ''}`;
  }

  private bankruptView(): string {
    const last = this.sim.reports.at(-1);
    return tr`
      <div class="row head"><b>Банкротство</b><span class="badge neg">День ${last?.day ?? ''}</span></div>
      <p>Касса была в минусе ${ECONOMY.bankruptDays} дня подряд. Кафе закрыто, имущество ушло в счёт долгов.</p>
      <p>Это не конец: посмотри итоги дней — кто не заходил и почему — и попробуй снова.</p>
      <button class="primary" data-action="restart">Начать заново</button>`;
  }

  private residentView(r: Resident): string {
    const minute = Math.floor(minuteOfDay(this.sim.time));
    const now = currentEntry(r.schedule, minute);
    const where = this.sim.at(r.placeId).name;
    const status = r.visit
      ? r.visit.stage === 'going'
        ? tr`Идёт в кафе`
        : r.visit.stage === 'queued'
          ? tr`Ждёт заказ в кафе`
          : tr`Сидит в кафе`
      : r.walking
        ? tr`${ACTIVITY_LABEL[r.activity]} · в пути → ${where}`
        : `${ACTIVITY_LABEL[r.activity]} · ${where}`;
    const home = r.homeId === 'metro' ? tr`Приезжает на метро` : tr`Живёт: ${this.sim.at(r.homeId).name}`;
    const work =
      r.workId === null
        ? ''
        : `<div>${r.kind === 'student' ? L('Учится') : L('Работает')}: ${
            r.workId === 'metro' ? tr`за пределами улицы` : this.sim.at(r.workId).name
          }</div>`;
    const budget = (Object.keys(WANT_LABEL) as WantKind[])
      .map((k) => tr`${WANT_LABEL[k]} до ${money(r.budget[k])}`)
      .join(' · ');

    let decision = '';
    const f = isFemale(r);
    const d = r.decision;
    if (d) {
      const item = d.itemId ? this.sim.cafe.menu.find((m) => m.id === d.itemId) : undefined;
      const when = `${d.day === dayNumber(this.sim.time) ? L('Сегодня') : tr`День ${d.day}`}, ${fmtMinute(d.minute)}`;
      decision = d.visited
        ? `<div class="decision ok"><small>${when}</small>${f ? L('Зашла') : L('Зашёл')} ${WANT_VISIT[d.want]}: ${item?.name ?? ''}, ${money(d.price ?? 0)}</div>`
        : tr`<div class="decision no"><small>${when} · ${f ? L('хотела') : L('хотел')} ${WANT_LABEL[d.want]}</small>Не ${f ? L('зашла') : L('зашёл')}: ${REJECT_LABEL[d.reason!].toLowerCase()}${
            d.reason === 'expensive' && item ? tr` — ${item.name} ${money(d.price ?? 0)}, ${f ? L('готова') : L('готов')} до ${money(d.budget)}` : ''
          }</div>`;
    }

    const reg = this.sim.regularOf(r.id);
    const character = this.characterBlock(r);
    const rows = r.schedule
      .map(
        (s) =>
          `<li class="${s === now ? 'now' : ''}"><span>${fmtMinute(s.start)}</span>${ACTIVITY_LABEL[s.activity]} — ${this.sim.at(s.placeId).name}</li>`,
      )
      .join('');
    return tr`
      <div class="card-head">
        ${portrait(r, !!reg, 'lg')}
        <div><b>${r.name}</b><small>${KIND_LABEL[r.kind]}</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button>
      </div>
      <div class="status">${status}</div>
      ${reg ? this.faceCard(reg, r) : ''}
      ${decision}
      <div class="facts"><div>${home}</div>${work}<div>${r.aware ? tr`Знает о твоём кафе` : tr`<b class="oos">Не знает о твоём кафе</b>`}</div>${this.hallTaste(r)}<div>${f ? L('Готова') : L('Готов')} платить: ${budget}</div></div>
      ${character}
      <ul class="schedule">${rows}</ul>`;
  }

  /** Нравится ли жителю стиль зала — видно в карточке */
  private hallTaste(r: Resident): string {
    if (!this.sim.hasHall) return '';
    const hall = this.sim.cafe.interior;
    const id = hall.style;
    if (!id) return '';
    const name = hallStyle(id).name;
    return hall.styleFit(r.kind) > 0 ? tr`<div>Зал по душе: ${name}</div>` : tr`<div>Зал «${name}» — не по вкусу</div>`;
  }

  /** Характер, вкус и память визитов: по ним игрок подбирает меню под своих гостей */
  private characterBlock(r: Resident): string {
    const c = r.character;
    const traits = traitWords(c);
    const { likes, dislikes } = tasteWords(c);
    const list = (axes: TasteAxis[]) => axes.map((a) => AXIS_LABEL[a]).join(tr` и `);
    const taste = [
      likes.length ? tr`любит ${list(likes)}` : '',
      dislikes.length ? tr`не любит ${list(dislikes)}` : '',
    ].filter(Boolean).join(' · ') || tr`ест всё`;
    const memory = r.memory
      .map((m) => {
        const mood = m.score >= 0.3 ? 'ok' : m.score <= -0.2 ? 'no' : '';
        const notes = m.notes.map((n) => NOTE_LABEL[n]).join(', ');
        return tr`<li class="${mood}"><span>День ${m.day}</span>${itemName(m.itemId)}${notes ? `${NB}— ${notes}` : ''}</li>`;
      })
      .join('');
    return tr`<div class="character">
        ${traits.length ? `<div class="traits">${traits.map((t) => `<span class="badge">${t}</span>`).join('')}</div>` : ''}
        <div class="taste"><span>Вкус:</span> ${taste}</div>
        ${memory ? tr`<div class="taste"><span>Помнит о твоём кафе:</span></div><ul class="memory">${memory}</ul>` : ''}
      </div>`;
  }
}
