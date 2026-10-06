import {
  CATALOG,
  KIND_TITLE,
  MAX_MENU,
  REJECT_LABEL,
  type Barista,
  type Change,
  type DayReport,
  type ItemKind,
  type RejectReason,
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
import { INGREDIENTS, orderPrice, RECIPES, type IngredientId } from '../sim/stock';
import { WEATHER_HINT, WEATHER_ICON, WEATHER_LABEL, type Weather } from '../sim/weather';
import { WANT_LABEL, type WantKind } from '../sim/demand';
import { ECONOMY, formatMoney, PREMISES, type PremisesId } from '../sim/economy';
import { ACTIVITY_LABEL, currentEntry, isFemale as femaleName, KIND_LABEL, type Resident, type ResidentKind } from '../sim/residents';
import { statusText, type Regular } from '../sim/regulars';
import { milestone, MILESTONES, UPGRADES, type UpgradeId } from '../sim/milestones';
import type { Simulation } from '../sim/simulation';
import { place } from '../sim/world';
import { RESIDENT_COLOR, toCss } from './palette';
import { clearSave } from './save';
import { openFeedback } from './feedback';
import { showTutorial } from './tutorial';
import { showEventCard } from './eventCard';
import { card } from '../sim/events';

// Интерфейс — обычный DOM поверх канваса: чёткий текст на любом экране
// и привычная вёрстка для правок дизайнера. Все кнопки — через data-action.

const NB = ' ';
export const SPEEDS = [0, 1, 2, 4] as const;

type View = 'cafe' | 'resident' | 'report';
type CafeTab = 'overview' | 'menu' | 'stock' | 'staff' | 'guests' | 'growth';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m) % 60).padStart(2, '0')}`;

const money = formatMoney;

const weatherShort = (w: Weather): string => `${WEATHER_ICON[w.kind]}${NB}${w.temp > 0 ? '+' : ''}${w.temp}°`;

const WANT_VISIT: Record<WantKind, string> = {
  coffee: `за${NB}кофе`,
  lunch: 'пообедать',
  tea: `на${NB}чай`,
  snack: 'перекусить',
  bar: 'выпить',
};

const isFemale = (r: Resident): boolean => femaleName(r.name);
const itemName = (id: string): string => CATALOG.find((c) => c.id === id)?.name ?? id;

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

export class Hud {
  speed = 1;
  private view: View = 'cafe';
  private selected: Resident | null = null;
  private lastRender = 0;
  private lastHtml = '';
  private lastView = '';
  private live: Record<string, string> = {};
  private liveWidth: Record<string, string> = {};
  private readonly clock = $('#clock');
  private readonly cash = $('#cash');
  private readonly panel = $('#panel');
  private catalogOpen = false;
  private confirmRestart = false;
  private tab: CafeTab = 'overview';
  /** Какое событие уже показали карточкой — второй раз сама не всплывает */
  private eventShown = '';

  constructor(
    private readonly sim: Simulation,
    private readonly onDeselect: () => void,
    private readonly selectInScene: (r: Resident) => void = () => {},
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
      if (ev.target instanceof HTMLSelectElement) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        this.setSpeed(this.speed === 0 ? 1 : 0);
      }
      const n = Number(ev.key);
      if (n >= 1 && n <= 3) this.setSpeed(SPEEDS[n]);
    });
    this.panel.addEventListener('click', (ev) => this.onClick(ev));
    this.panel.addEventListener('change', (ev) => this.onChange(ev));
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
    this.view = r ? 'resident' : 'cafe';
    this.render(true);
  }

  onDayEnd(): void {
    if (this.view !== 'resident') this.view = 'report';
    this.render(true);
  }

  onBankrupt(): void {
    this.setSpeed(0);
    this.render(true);
  }

  frame(): void {
    const now = performance.now();
    if (now - this.lastRender < 100) return;
    this.lastRender = now;
    const day = dayNumber(this.sim.time);
    const clock = `<b>${WEEKDAY_SHORT[weekday(day)]} · ${formatClock(this.sim.time)}</b><small>День ${day} · ${weatherShort(this.sim.weather)}</small>`;
    if (this.clock.innerHTML !== clock) this.clock.innerHTML = clock;
    this.cash.textContent = money(this.sim.cash);
    this.cash.classList.toggle('neg', this.sim.cash < 0);
    const e = this.sim.pendingEvent;
    const key = e ? `${e.id}:${e.day}` : '';
    if (e && key !== this.eventShown && !document.querySelector('.overlay')) {
      this.eventShown = key;
      showEventCard(this.sim, this, () => this.render(true));
    }
    this.render();
  }

  // ——— Действия ———

  private onClick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;
    const { action, item } = btn.dataset;
    const sim = this.sim;
    switch (action) {
      case 'open-cafe':
        sim.openCafe((item as PremisesId) ?? 'cafe');
        this.tab = 'overview';
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
      case 'toggle-catalog':
        this.catalogOpen = !this.catalogOpen;
        break;
      case 'tab':
        this.tab = item as CafeTab;
        this.panel.scrollTop = 0;
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
      case 'buy-upgrade':
        sim.buyUpgrade(item as UpgradeId);
        break;
      case 'skip-morning':
        sim.skipToMorning();
        break;
      case 'report':
        this.view = 'report';
        break;
      case 'goto-tab':
        this.view = 'cafe';
        this.tab = item as CafeTab;
        if (this.selected) this.onDeselect();
        break;
      case 'event':
        showEventCard(sim, this, () => this.render(true));
        return;
      case 'feedback':
        openFeedback(this.sim);
        return;
      case 'tutorial':
        showTutorial(this);
        return;
      case 'back':
        this.view = 'cafe';
        if (this.selected) this.onDeselect();
        break;
      case 'restart':
        this.restart();
        return;
      case 'restart-ask':
        this.confirmRestart = !this.confirmRestart;
        break;
    }
    this.render(true);
  }

  private onChange(ev: Event): void {
    const el = ev.target as HTMLSelectElement;
    const cafe = this.sim.cafe;
    if (el.dataset.action === 'open-at') {
      const open = Number(el.value);
      // Круглосуточный режим сохраняем; иначе не даём закрытию оказаться раньше открытия
      const close = cafe.allDay ? open + MINUTES_PER_DAY : Math.max(cafe.closeAt, open + 60);
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
    if (el.dataset.action === 'close-at') {
      this.sim.setHours(cafe.openAt, el.value === ALL_DAY ? cafe.openAt + MINUTES_PER_DAY : Number(el.value));
    }
    this.render(true);
  }

  /** Новая игра: стереть сохранение и перезапустить */
  private restart(): void {
    window.dispatchEvent(new Event('gorod-dela:reset'));
    clearSave();
    location.href = location.pathname;
  }

  // ——— Отрисовка панели ———

  private render(force = false): void {
    this.live = {};
    this.liveWidth = {};
    const html = this.sim.bankrupt
      ? this.bankruptView()
      : this.view === 'resident' && this.selected
        ? this.residentView(this.selected)
        : this.view === 'report' && this.sim.reports.length > 0
          ? this.reportView(this.sim.reports.at(-1)!)
          : this.cafeView();
    // Пересобираем DOM только когда изменилась структура — иначе обновляем «живые» числа.
    // Так не сбиваются клики, прокрутка и открытые списки.
    if (force || html !== this.lastHtml) {
      this.lastHtml = html;
      this.panel.innerHTML = html;
      const viewKey = this.sim.bankrupt ? 'bankrupt' : `${this.view}:${this.selected?.id ?? ''}`;
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
  }

  private cafeView(): string {
    const { cafe } = this.sim;
    const today = cafe.today;
    if (!cafe.opened) {
      this.live.wanted = String(today.wanted);
      const card = (id: PremisesId) => {
        const pr = PREMISES[id];
        const canAfford = this.sim.cash >= pr.openingCost;
        return `<li class="premises">
          <div class="row"><b class="grow">${pr.name}</b><span class="badge">аренда ${money(pr.rentPerDay * 30)}/мес</span></div>
          <small>${pr.about}. Коммуналка — за${NB}часы работы, налог 6${NB}% с${NB}выручки.</small>
          <button class="primary" data-action="open-cafe" data-item="${id}" ${canAfford ? '' : 'disabled'}>Открыть · ${money(pr.openingCost)}</button>
        </li>`;
      };
      return `
        <div class="row head"><b>Свободные помещения</b><span class="badge">Сдаются</span></div>
        <p class="demand">Сегодня зайти хотели: <b data-live="wanted"></b>. Посмотри, кто и${NB}когда, — нажми на${NB}жителя.</p>
        <ul class="menu premises-list">${card('kiosk')}${card('cafe')}</ul>
        <small>Формат начинается с${NB}места: у${NB}метро — поток пассажиров, в${NB}кафе с${NB}залом гости сидят и${NB}дозаказывают.</small>
        ${this.sim.time > hm(7) ? this.restartBlock() : ''}`;
    }

    const minute = this.sim.minute;
    const open = cafe.isOpenAt(minute);
    this.live.status = cafe.allDay
      ? 'Круглосуточно'
      : open
        ? `Открыто до ${fmtMinute(cafe.closeAt % MINUTES_PER_DAY)}`
        : `Закрыто до ${fmtMinute(cafe.openAt)}`;
    this.live.guests = String(today.guests);
    this.live.revenue = money(today.revenue);
    this.live.queue = String(this.sim.guestsInside);
    this.live.wages = money(cafe.wagesSoFar);

    const items = cafe.menu
      .map((m) => {
        this.live[`sold-${m.id}`] = String(today.sold[m.id] ?? 0);
        this.live[`oos-${m.id}`] = cafe.stock.canMake(m.id) ? '' : ` · нет в${NB}наличии`;
        return `
        <li>
          <div class="grow"><b>${m.name}</b>
            <small>себестоимость ${money(m.cost)} · продано <span data-live="sold-${m.id}"></span><span class="oos" data-live="oos-${m.id}"></span></small></div>
          <div class="stepper">
            <button data-action="price-down" data-item="${m.id}" aria-label="Дешевле">−</button>
            <span>${money(m.price)}</span>
            <button data-action="price-up" data-item="${m.id}" aria-label="Дороже">+</button>
          </div>
          <button class="icon" data-action="remove-item" data-item="${m.id}" ${cafe.menu.length <= 1 ? 'disabled' : ''}
            aria-label="Убрать из меню">✕</button>
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
                return `<li><div class="grow"><b>${c.name}</b>
                  <small>от ${money(c.price)} · себестоимость ${money(c.cost)}</small></div>
                  ${
                    inMenu
                      ? '<span class="badge on">в меню</span>'
                      : !fits
                        ? `<span class="badge">не${NB}здесь</span>`
                        : `<button class="small" data-action="add-item" data-item="${c.id}" ${full ? 'disabled' : ''}>Добавить</button>`
                  }</li>`;
              })
              .join('');
            const note =
              kind === 'bar' ? `<small class="note">ИП может продавать только пиво и${NB}сидр. Вино и${NB}крепкое — с${NB}лицензией ООО, позже</small>` : '';
            return `<h5>${KIND_TITLE[kind]}</h5><ul class="menu catalog">${rows}</ul>${note}`;
          })
          .join('')
      : '';

    const opt = (list: number[], value: number) =>
      list.map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m)}</option>`).join('');
    const closeOpt =
      CLOSE_OPTIONS.filter((m) => m > cafe.openAt)
        .map((m) => {
          const label = m > MINUTES_PER_DAY || m === MINUTES_PER_DAY ? `${fmtMinute(m % MINUTES_PER_DAY)} ночи` : fmtMinute(m);
          return `<option value="${m}" ${!cafe.allDay && m === cafe.closeAt ? 'selected' : ''}>${label}</option>`;
        })
        .join('') + `<option value="${ALL_DAY}" ${cafe.allDay ? 'selected' : ''}>круглосуточно</option>`;
    const staffRows = cafe.staff.map((st, i) => this.staffRow(st, i, open)).join('');
    const last = this.sim.reports.at(-1);

    const tabs: [CafeTab, string][] = [
      ['overview', 'Обзор'],
      ['menu', 'Меню'],
      ['stock', 'Склад'],
      ['staff', 'Персонал'],
      ['guests', 'Гости'],
      ['growth', 'Развитие'],
    ];
    const tabBar = `<nav class="tabs">${tabs
      .map(([id, label]) => `<button data-action="tab" data-item="${id}" class="${this.tab === id ? 'active' : ''}">${label}</button>`)
      .join('')}</nav>`;

    let body = '';
    if (this.tab === 'overview') {
      this.live['stock-warn'] = this.stockWarning();
      body = `
      ${this.cashWarning()}
      ${this.eventBanner()}
      <div class="kpis">
        <div><small>Гостей сегодня</small><b data-live="guests"></b></div>
        <div><small>Выручка</small><b data-live="revenue"></b></div>
        <div><small>Внутри сейчас</small><b data-live="queue"></b></div>
      </div>
      <p class="hint-line" data-live="stock-warn"></p>
      ${this.rivalCard()}
      <h4>Часы работы</h4>
      <div class="row hours">
        <select data-action="open-at" aria-label="Открытие">${opt(OPEN_OPTIONS, cafe.openAt)}</select>
        <span>—</span>
        <select data-action="close-at" aria-label="Закрытие">${closeOpt}</select>
      </div>
      ${last ? `<button class="secondary" data-action="report">Итоги дня ${last.day}</button>` : ''}
      ${this.restartBlock()}`;
    } else if (this.tab === 'menu') {
      body = `
      <h4>Меню и${NB}цены · ${cafe.menu.length}${NB}из${NB}${MAX_MENU}</h4>
      <p class="hint-line">${this.focusLine()}</p>
      <ul class="menu">${items}</ul>
      <button class="secondary" data-action="toggle-catalog">${this.catalogOpen ? 'Скрыть каталог' : `Изменить меню${full ? ` — мест нет, сначала убери позицию` : ''}`}</button>
      <div class="catalog-wrap">${catalog}</div>`;
    } else if (this.tab === 'stock') {
      body = this.stockTab();
    } else if (this.tab === 'guests') {
      body = this.facesBlock() + this.marketingTab();
    } else if (this.tab === 'growth') {
      body = this.growthTab();
    } else {
      body = `
      <small>Ты сам всегда за${NB}стойкой — бесплатно, но${NB}${cafe.has('machine') ? '3' : '4'}${NB}мин на${NB}гостя. С${NB}бариста — ${cafe.has('machine') ? '1,5' : '2'}${NB}мин, и${NB}обслуживают параллельно.</small>
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
      <div class="row head"><b>${cafe.premises.mine}</b><span class="badge ${open ? 'on' : ''}" data-live="status"></span></div>
      ${tabBar}
      ${body}`;
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
  private focusLine(): string {
    const n = new Set(this.sim.cafe.menu.map((m) => m.kind)).size;
    const word = n === 1 ? 'категория' : n <= 4 ? 'категории' : 'категорий';
    const deep = `Если в${NB}категории 3+${NB}позиции — к${NB}ней ещё +10${NB}%`;
    if (n <= 2) return `Формат понятный: ${n}${NB}${word} — гости заходят охотнее (+10${NB}%). ${deep}`;
    if (n === 3) return `Формат обычный: ${n}${NB}${word}. Узкое меню привлекает сильнее, «всё подряд» — слабее. ${deep}`;
    return `Формат размытый: ${n}${NB}${word} — гости заходят реже (−${n === 4 ? 10 : 20}${NB}%). ${deep}`;
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
          : st.schedule.days[cafe.weekday]
            ? `по графику с${NB}${fmtMinute(st.schedule.from % MINUTES_PER_DAY)}`
            : 'сегодня выходной';
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
    const hours = (list: number[], value: number, action: string) =>
      `<select data-action="${action}" data-item="${st.id}" aria-label="${action === 'staff-from' ? 'С' : 'До'}">${list
        .map((m) => `<option value="${m}" ${m === value ? 'selected' : ''}>${fmtMinute(m % MINUTES_PER_DAY)}${m >= MINUTES_PER_DAY ? ' ночи' : ''}</option>`)
        .join('')}</select>`;
    const fromList = Array.from({ length: 18 }, (_, k) => hm(6) + k * 60); // 06:00…23:00
    const toList = Array.from({ length: 23 }, (_, k) => hm(7) + k * 60); // 07:00…05:00
    const hourly =
      st.contract === 'hourly'
        ? `<div class="row hours staff-hours">${hours(fromList, st.schedule.from, 'staff-from')}<span>—</span>${hours(toList, st.schedule.to, 'staff-to')}</div>
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
          <i style="background:${toCss(RESIDENT_COLOR[r.kind])}"></i>
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
        <div class="row"><b class="grow">${reached !== undefined ? '✓ ' : ''}${m.title}</b>${progress}</div>
        <small>${m.hint}${now && reached === undefined ? ` · ${now}` : ''}${opens ? ` · открывает: ${opens.name.toLowerCase()}` : ''}</small>
        ${bar}
      </li>`;
    }).join('');
    const ups = UPGRADES.map((u) => {
      const st = sim.upgradeState(u.id);
      if (st === 'premises') return '';
      const badge = st === 'owned' ? '<span class="badge on">куплено</span>' : `<span class="badge">${money(u.cost)}</span>`;
      const control =
        st === 'owned'
          ? ''
          : st === 'locked'
            ? `<small class="lock">Откроется после вехи «${milestone(u.unlock).title}»</small>`
            : `<button class="small" data-action="buy-upgrade" data-item="${u.id}" ${st === 'money' ? 'disabled' : ''}>${
                st === 'money' ? `Не${NB}хватает денег` : `Купить за${NB}${money(u.cost)}`
              }</button>`;
      return `<li class="upgrade"><div class="row"><b class="grow">${u.name}</b>${badge}</div><small>${u.effect}</small>${control}</li>`;
    }).join('');
    const count = Object.keys(sim.milestones).length;
    return `
      <h4>Вехи первой точки · ${count}${NB}из${NB}${MILESTONES.length}</h4>
      <ul class="menu milestones">${ms}</ul>
      <h4>Улучшения</h4>
      <small>Покупаются один раз и${NB}меняют возможности заведения. Это вложение: в${NB}прибыль дня не${NB}входит, но${NB}из${NB}кассы уходит.</small>
      <ul class="menu upgrades">${ups}</ul>`;
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
    const channel = (title: string, note: string, control: string) =>
      `<li><div class="grow"><b>${title}</b><small>${note}</small></div>${control}</li>`;
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
        )}
        ${channel(
          `Листовки у${NB}метро`,
          `Утром и${NB}вечером — узнают офисные. ${money(MARKETING.flyersPerDay)} в${NB}день`,
          `<button class="small ${mk.flyers ? 'ghost' : ''}" data-action="flyers">${mk.flyers ? 'Остановить' : 'Раздавать'}</button>`,
        )}
        ${channel(
          'Соцсети',
          `Узнают молодёжь и${NB}студенты. ${money(MARKETING.socialCampaign)} за${NB}${MARKETING.socialDays}${NB}дней`,
          mk.socialDaysLeft > 0
            ? `<span class="badge on">ещё ${mk.socialDaysLeft}${NB}дн.</span>`
            : `<button class="small" data-action="social">Запустить</button>`,
        )}
        ${channel('Сарафан', `Постоянные гости сами рассказывают соседям и${NB}коллегам. Бесплатно`, '<span class="badge on">работает</span>')}
      </ul>
      <h4>Акции</h4>
      <ul class="menu">
        <li><div class="grow"><b>Счастливые часы</b><small>Скидка на${NB}всё меню в${NB}выбранное время — чтобы заполнить пустые часы</small>
          <div class="row hours happy">
            <select data-action="happy-from" aria-label="С">${opt(happy?.from ?? hm(15))}</select><span>—</span>
            <select data-action="happy-to" aria-label="До">${opt(happy?.to ?? hm(17))}</select>
            <select data-action="happy-disc" aria-label="Скидка">${disc}</select>
          </div></div></li>
        ${channel(
          'Карта лояльности',
          `Каждый ${MARKETING.loyaltyEvery}-й кофе в${NB}подарок. Постоянные возвращаются чаще и${NB}охотнее рассказывают о${NB}тебе`,
          `<button class="small ${mk.loyaltyCard ? 'ghost' : ''}" data-action="card">${mk.loyaltyCard ? 'Выключить' : 'Включить'}</button>`,
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
         <small class="saved">Игра сохраняется автоматически в${NB}этом браузере</small>`;
  }

  /** Что кончается или испортится — подсказка на обзоре */
  private stockWarning(): string {
    const { stock, menu } = this.sim.cafe;
    const cant = menu.filter((m) => !stock.canMake(m.id)).map((m) => m.name);
    if (cant.length) return `⚠ Нет в${NB}наличии: ${cant.join(', ')}. Закажи на${NB}складе`;
    return 'Склад в порядке';
  }

  private stockTab(): string {
    const { stock } = this.sim.cafe;
    const day = dayNumber(this.sim.time);
    const used = new Set<IngredientId>();
    for (const m of this.sim.cafe.menu) for (const id of Object.keys(RECIPES[m.id] ?? {}) as IngredientId[]) used.add(id);
    const rows = INGREDIENTS.map((ing) => {
      const q = stock.qty(ing.id);
      const exp = ing.shelfDays === null ? 0 : stock.expiringToday(ing.id, day);
      const pend = stock.pending[ing.id] ?? 0;
      this.live[`st-${ing.id}`] = `${Math.floor(q)}`;
      this.live[`stx-${ing.id}`] =
        [exp > 0 ? `испортится сегодня: ${Math.round(exp)}` : '', pend > 0 ? `едет к${NB}6:00: ${pend}` : '']
          .filter(Boolean)
          .join(' · ') || ' ';
      const step = ing.id === 'bakery' ? 2 : 5;
      const keep = (weekend: boolean) => {
        const v = weekend ? stock.keepWeekend[ing.id] : stock.keep[ing.id];
        return `<div class="stepper mini">
          <button data-action="keep-down" data-item="${ing.id}" data-weekend="${weekend}" data-step="${step}" aria-label="Меньше">−</button>
          <span>${v}</span>
          <button data-action="keep-up" data-item="${ing.id}" data-weekend="${weekend}" data-step="${step}" aria-label="Больше">+</button>
        </div>`;
      };
      const life = ing.shelfDays === null ? `не${NB}портится` : `хранится ${ing.shelfDays}${NB}дн.`;
      return `<li class="${used.has(ing.id) ? '' : 'unused'}">
        <div class="row"><div class="grow"><b>${ing.name}</b>
          <small>${life} · ${money(ing.unitCost)} за${NB}порцию${used.has(ing.id) ? '' : ` · не${NB}нужно для${NB}меню`}</small></div>
          <div class="qty"><b data-live="st-${ing.id}"></b><small>порц.</small></div></div>
        <small class="exp" data-live="stx-${ing.id}"></small>
        <div class="row keep"><small>Держать: будни</small>${keep(false)}<small>вых.</small>${keep(true)}</div>
        <div class="row orders">
          ${[20, 100, 300]
            .map(
              (n) =>
                `<button class="small" data-action="order" data-item="${ing.id}" data-qty="${n}">+${n} · ${money(orderPrice(ing.id, n))}</button>`,
            )
            .join('')}
          <button class="icon" data-action="cancel-order" data-item="${ing.id}" aria-label="Отменить заказ">✕</button>
        </div>
      </li>`;
    }).join('');
    return `
      <small>Поставщик привозит заказ в${NB}6:00. Опт: от${NB}100${NB}порций −10${NB}%, от${NB}300 — −20${NB}%.
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
    if (sim.marketing.flyers) options.push(`<button class="small" data-action="flyers">Остановить листовки</button>`);
    if (sim.cafe.staff.length) options.push(`<button class="small" data-action="goto-tab" data-item="staff">Персонал</button>`);
    options.push(`<button class="small" data-action="goto-tab" data-item="stock">Снизить запасы</button>`);
    options.push(`<button class="small" data-action="goto-tab" data-item="overview">Часы работы</button>`);
    return `<div class="cash-warn"><b>${head}</b>
      <small>Что можно сделать: меньше часов в${NB}пустое время, отпустить бариста, не${NB}держать лишний запас, остановить платную рекламу.</small>
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
      .map(([kind, n]) => `<li><span>${KIND_TITLE[kind]}</span><b>${n}</b></li>`)
      .join('');
    const sold = CATALOG
      .filter((m) => r.sold[m.id])
      .map((m) => `<li><span>${m.name}</span><b>${r.sold[m.id]}</b></li>`)
      .join('');
    const learnedEntries = (Object.entries(r.newAware) as [AwareSource, number][]).filter(([src]) => src !== 'start');
    const learnedTotal = learnedEntries.reduce((x, [, n]) => x + n, 0);
    const learned = learnedEntries.map(([src, n]) => `<li><span>${AWARE_LABEL[src]}</span><b>${n}</b></li>`).join('');
    const spoiled = (Object.entries(r.writtenOffItems) as [IngredientId, number][])
      .map(([id, q]) => `${INGREDIENTS.find((i) => i.id === id)!.name.toLowerCase()} ${q}`)
      .join(', ');
    const kinds = a.byKind
      .slice(0, 5)
      .map(
        ([kind, n, reason]) =>
          `<li><i style="background:${toCss(RESIDENT_COLOR[kind])}"></i><span>${KIND_LABEL[kind]}</span><small>${REJECT_LABEL[reason].toLowerCase()}</small><b>${n}</b></li>`,
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
      <div class="insight">
        <b>${a.headline}</b>
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
        ${row('Итог дня', r.profit, r.profit >= 0 ? 'total pos' : 'total neg')}
        ${r.invested ? row('Вложено в улучшения', -r.invested) : ''}
        ${row('В кассе', r.cashAfter, 'cash')}
      </table>
      <small>Себестоимость проданного: ${money(r.cogs)}${r.extras ? ` · дозаказов: ${r.extras}` : ''}${
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
    const rows = r.schedule
      .map(
        (s) =>
          `<li class="${s === now ? 'now' : ''}"><span>${fmtMinute(s.start)}</span>${ACTIVITY_LABEL[s.activity]} — ${place(s.placeId).name}</li>`,
      )
      .join('');
    return `
      <div class="card-head">
        <i style="background:${toCss(RESIDENT_COLOR[r.kind as ResidentKind])}"></i>
        <div><b>${r.name}</b><small>${KIND_LABEL[r.kind]}</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button>
      </div>
      <div class="status">${status}</div>
      ${reg ? this.faceCard(reg, r) : ''}
      ${decision}
      <div class="facts"><div>${home}</div>${work}<div>${r.aware ? `Знает о${NB}твоём кафе` : `<b class="oos">Не${NB}знает о${NB}твоём кафе</b>`}</div><div>${f ? 'Готова' : 'Готов'} платить: ${budget}</div></div>
      <ul class="schedule">${rows}</ul>`;
  }
}
