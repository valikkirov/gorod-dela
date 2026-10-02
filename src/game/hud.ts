import {
  CATALOG,
  KIND_TITLE,
  MAX_MENU,
  REJECT_LABEL,
  type DayReport,
  type ItemKind,
  type RejectReason,
} from '../sim/cafe';
import { dayNumber, formatClock, hm, MINUTES_PER_DAY, minuteOfDay } from '../sim/clock';
import { WANT_LABEL, type WantKind } from '../sim/demand';
import { ECONOMY, formatMoney } from '../sim/economy';
import { ACTIVITY_LABEL, currentEntry, KIND_LABEL, type Resident, type ResidentKind } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { place } from '../sim/world';
import { RESIDENT_COLOR, toCss } from './palette';

// Интерфейс — обычный DOM поверх канваса: чёткий текст на любом экране
// и привычная вёрстка для правок дизайнера. Все кнопки — через data-action.

const NB = ' ';
export const SPEEDS = [0, 1, 2, 4] as const;

type View = 'cafe' | 'resident' | 'report';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el;
};

const fmtMinute = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m) % 60).padStart(2, '0')}`;

const money = formatMoney;

const WANT_VISIT: Record<WantKind, string> = {
  coffee: `за${NB}кофе`,
  lunch: 'пообедать',
  tea: `на${NB}чай`,
  snack: 'перекусить',
  bar: 'выпить',
};

/** Фамилии в генераторе женского рода оканчиваются на «а» */
const isFemale = (r: Resident): boolean => r.name.endsWith('а');

const REASON_HINT: Record<RejectReason, string> = {
  'not-open': 'Хотели зайти, но кафе ещё не работает',
  closed: `Хотели зайти, когда было закрыто — подумай о${NB}часах работы`,
  expensive: 'Цена выше, чем готовы платить',
  'off-route': `Кафе не${NB}по${NB}пути — делать крюк не${NB}захотели`,
  'no-item': `Не${NB}нашли нужного в${NB}меню`,
  queue: `Не${NB}стали стоять в${NB}очереди — нужен бариста`,
  'no-time': `Не${NB}дождались заказа и${NB}ушли`,
  mood: `Цена и${NB}дорога устраивали, но${NB}не${NB}каждый день хочется в${NB}кафе. Постоянные гости заходят чаще`,
};

const OPEN_OPTIONS = Array.from({ length: 13 }, (_, i) => hm(6) + i * 30); // 06:00…12:00
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
  private readonly clock = $('#clock');
  private readonly cash = $('#cash');
  private readonly panel = $('#panel');
  private catalogOpen = false;

  constructor(
    private readonly sim: Simulation,
    private readonly onDeselect: () => void,
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
    this.clock.textContent = `День ${dayNumber(this.sim.time)} · ${formatClock(this.sim.time)}`;
    this.cash.textContent = money(this.sim.cash);
    this.cash.classList.toggle('neg', this.sim.cash < 0);
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
        sim.openCafe();
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
        if (st) sim.setOnDuty(st.id, !st.onDuty);
        break;
      }
      case 'report':
        this.view = 'report';
        break;
      case 'back':
        this.view = 'cafe';
        if (this.selected) this.onDeselect();
        break;
      case 'restart':
        location.reload();
        return;
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
    if (el.dataset.action === 'close-at') {
      this.sim.setHours(cafe.openAt, el.value === ALL_DAY ? cafe.openAt + MINUTES_PER_DAY : Number(el.value));
    }
    this.render(true);
  }

  // ——— Отрисовка панели ———

  private render(force = false): void {
    this.live = {};
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
      const canAfford = this.sim.cash >= ECONOMY.cafeOpeningCost;
      return `
        <div class="row head"><b>Свободное помещение</b><span class="badge">Сдаётся</span></div>
        <p>30${NB}м² на${NB}первой линии, рядом с${NB}метро и${NB}офисами. Аренда ${money(ECONOMY.rentPerDay * 30)} в${NB}месяц,
        коммуналка и${NB}налог 6${NB}% с${NB}выручки.</p>
        <p class="demand">Сегодня зайти хотели: <b data-live="wanted"></b>. Посмотри, кто и${NB}когда, — нажми на${NB}жителя.</p>
        <button class="primary" data-action="open-cafe" ${canAfford ? '' : 'disabled'}>
          Открыть кафе · ${money(ECONOMY.cafeOpeningCost)}
        </button>`;
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
        return `
        <li>
          <div class="grow"><b>${m.name}</b>
            <small>себестоимость ${money(m.cost)} · продано <span data-live="sold-${m.id}"></span></small></div>
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
                return `<li><div class="grow"><b>${c.name}</b>
                  <small>от ${money(c.price)} · себестоимость ${money(c.cost)}</small></div>
                  ${
                    inMenu
                      ? '<span class="badge on">в меню</span>'
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
    const staffRows = cafe.staff
      .map((st, i) => {
        let status: string;
        if (st.contract === 'hourly') {
          status = !st.onDuty ? 'отпущен' : open ? 'работает' : `выйдет к${NB}открытию`;
        } else {
          const left = ECONOMY.shiftHours * 60 - st.shiftMinutes;
          status =
            left <= 0
              ? `смена окончена, выйдет к${NB}открытию`
              : open
                ? `на${NB}смене ещё ${Math.floor(left / 60)}${NB}ч ${left % 60}${NB}мин`
                : `выйдет к${NB}открытию`;
        }
        this.live[`staff-${st.id}`] = status;
        return `<li>
          <div class="grow"><b>Бариста ${i + 1} · ${st.contract === 'shift' ? 'на смене' : 'почасово'}</b>
            <small data-live="staff-${st.id}"></small></div>
          ${
            st.contract === 'hourly'
              ? `<button class="small ${st.onDuty ? '' : 'ghost'}" data-action="duty" data-item="${st.id}">${st.onDuty ? 'Отпустить' : 'Вызвать'}</button>`
              : ''
          }
          <button class="icon" data-action="fire" data-item="${st.id}" aria-label="Уволить">✕</button>
        </li>`;
      })
      .join('');
    const last = this.sim.reports.at(-1);

    return `
      <div class="row head"><b>Твоё кафе</b><span class="badge ${open ? 'on' : ''}" data-live="status"></span></div>
      <div class="kpis">
        <div><small>Гостей сегодня</small><b data-live="guests"></b></div>
        <div><small>Выручка</small><b data-live="revenue"></b></div>
        <div><small>В${NB}кафе сейчас</small><b data-live="queue"></b></div>
      </div>
      <h4>Меню и${NB}цены · ${cafe.menu.length}${NB}из${NB}${MAX_MENU}</h4>
      <ul class="menu">${items}</ul>
      <button class="secondary" data-action="toggle-catalog">${this.catalogOpen ? 'Скрыть каталог' : `Изменить меню${full ? ` — мест нет, сначала убери позицию` : ''}`}</button>
      <div class="catalog-wrap">${catalog}</div>
      <h4>Часы работы</h4>
      <div class="row hours">
        <select data-action="open-at" aria-label="Открытие">${opt(OPEN_OPTIONS, cafe.openAt)}</select>
        <span>—</span>
        <select data-action="close-at" aria-label="Закрытие">${closeOpt}</select>
      </div>
      <h4>За${NB}стойкой</h4>
      <small>Ты сам всегда за${NB}стойкой — бесплатно, но${NB}4${NB}мин на${NB}гостя. С${NB}бариста — 2${NB}мин, и${NB}обслуживают параллельно.</small>
      <ul class="menu staff">${staffRows}</ul>
      ${
        cafe.staff.length < ECONOMY.maxBaristas
          ? `<div class="hire">
        <button class="small" data-action="hire-shift">На${NB}смену · ${money(ECONOMY.shiftWage)}</button>
        <button class="small" data-action="hire-hourly">Почасово · ${money(ECONOMY.baristaWagePerHour)}/ч</button>
      </div>
      <small>Смена — до${NB}${ECONOMY.shiftHours}${NB}часов с${NB}открытия, платишь всю сумму. Почасового вызываешь и${NB}отпускаешь сам.</small>`
          : ''
      }
      <p class="wages">Сегодня на${NB}зарплату: <b data-live="wages"></b> <small>ночью (22:00–6:00) +20${NB}%</small></p>
      ${last ? `<button class="secondary" data-action="report">Итоги дня ${last.day}</button>` : ''}`;
  }

  private reportView(r: DayReport): string {
    const row = (label: string, value: number, cls = '') =>
      `<tr class="${cls}"><td>${label}</td><td>${money(value)}</td></tr>`;
    const missed = (Object.entries(r.missed) as [RejectReason, number][])
      .filter(([reason]) => r.opened || reason === 'not-open')
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `<li><b>${n}</b><div><span>${REJECT_LABEL[reason]}</span><small>${REASON_HINT[reason]}</small></div></li>`)
      .join('');
    const missing = (Object.entries(r.missingKinds) as [ItemKind, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `<li><span>${KIND_TITLE[kind]}</span><b>${n}</b></li>`)
      .join('');
    const sold = CATALOG
      .filter((m) => r.sold[m.id])
      .map((m) => `<li><span>${m.name}</span><b>${r.sold[m.id]}</b></li>`)
      .join('');
    const warn =
      this.sim.daysInRed > 0
        ? `<p class="warn">Касса в${NB}минусе ${this.sim.daysInRed}${NB}дн. подряд. На${NB}${ECONOMY.bankruptDays}-й день — банкротство.</p>`
        : '';

    return `
      <div class="card-head"><div><b>Итоги дня ${r.day}</b><small>${r.guests} гостей из ${r.wanted}, кто хотел зайти</small></div>
        <button data-action="back" aria-label="Закрыть">✕</button></div>
      ${warn}
      ${
        r.opened
          ? `<table class="pnl">
        ${row('Выручка', r.revenue)}
        ${row('Продукты', -r.cogs)}
        ${row('Аренда', -r.rent)}
        ${row('Коммуналка', -r.utilities)}
        ${r.wages ? row('Зарплата', -r.wages) : ''}
        ${row(`Налог 6${NB}%`, -r.tax)}
        ${row('Итог дня', r.profit, r.profit >= 0 ? 'total pos' : 'total neg')}
        ${row('В кассе', r.cashAfter, 'cash')}
      </table>`
          : ''
      }
      ${missed ? `<h4>Не${NB}зашли — почему</h4><ul class="reasons">${missed}</ul>` : ''}
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
      ${decision}
      <div class="facts"><div>${home}</div>${work}<div>${f ? 'Готова' : 'Готов'} платить: ${budget}</div></div>
      <ul class="schedule">${rows}</ul>`;
  }
}
