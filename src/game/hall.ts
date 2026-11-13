// Вкладка «Зал»: картинка зала с мебелью на местах, готовые комплектации и свой дизайн.
// Только отрисовка: покупки идут через публичные методы Simulation.
import {
  canPlace,
  FURNITURE,
  furniture,
  hallSlots,
  presetsOf,
  type HallKind,
  Interior,
  FINISH_SLOTS,
  INTERIOR,
  SEASON_SLOTS,
  STYLES,
  styleSet,
  styleName,
  type FurnitureId,
  type StyleId,
} from '../sim/interior';
import { formatMoney } from '../sim/economy';
import type { ResidentKind } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import cafeRoomUrl from './art/hall3/room.webp';
import { HALL_FRAMES as CAFE_FRAMES, HALL_ROOM as CAFE_ROOM } from './hallFrames';
import bistroRoomUrl from './art/bistro/room.webp';
import { BISTRO_FRAMES, BISTRO_ROOM } from './bistroFrames';
import { HALL_ITEMS } from './hallItems';

import { L, tr } from '../sim/i18n';
const money = formatMoney;

// Зал нарисован целиком в одном ракурсе, мебель вырезана из него же (scripts/cut_hall.py):
// каждый кусочек ложится в свои координаты комнаты, поэтому размеры и перспектива совпадают
const ART = import.meta.glob('./art/hall3/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const BISTRO_ART = import.meta.glob('./art/bistro/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

// Зал кафе и зал бистро рисуются одинаково, только картинки свои (scripts/cut_bistro.py).
// Какой зал сейчас рисуем — решает точка; переключается в начале hallTab/hallPicker
let kind: HallKind = 'cafe';
let HALL_FRAMES: Record<string, [number, number, number, number]> = CAFE_FRAMES;
let HALL_ROOM = CAFE_ROOM;
let roomUrl = cafeRoomUrl;
function useHall(k: HallKind): void {
  kind = k;
  HALL_FRAMES = k === 'bistro' ? BISTRO_FRAMES : CAFE_FRAMES;
  HALL_ROOM = k === 'bistro' ? BISTRO_ROOM : CAFE_ROOM;
  roomUrl = k === 'bistro' ? bistroRoomUrl : cafeRoomUrl;
}
// Отделка бистро: «bwalls-loft» лежит в art/bistro/walls-loft.webp
const art = (id: string): string =>
  kind === 'bistro' ? (BISTRO_ART[`./art/bistro/${id.replace(/^b(walls|floor)-/, '$1-')}.webp`] ?? '') : ART[`./art/hall3/${id}.webp`];

/** Кнопка «+» пустого места: точка на полу или стене, в пикселях комнаты */
const SLOT_AT: Record<string, { x: number; y: number }> = {
  rug: { x: 420, y: 470 },
  'wall-1': { x: 320, y: 145 },
  'wall-2': { x: 365, y: 85 },
  corner: { x: 300, y: 235 },
  shelf: { x: 425, y: 200 },
  nook: { x: 200, y: 225 },
  window: { x: 140, y: 360 },
  'table-1': { x: 420, y: 395 },
  'small-1': { x: 75, y: 455 },
  'table-2': { x: 300, y: 500 },
  'table-3': { x: 520, y: 500 },
  'table-4': { x: 735, y: 500 },
  feature: { x: 355, y: 125 },
  touch: { x: 460, y: 60 },
  tree: { x: 770, y: 450 },
  garland: { x: 110, y: 200 },
  // Бистро
  'b-wall-l': { x: 255, y: 105 },
  'b-wall-c': { x: 420, y: 70 },
  'b-wall-r': { x: 640, y: 100 },
  'b-corner': { x: 230, y: 260 },
  'b-window': { x: 120, y: 330 },
  'b-center': { x: 440, y: 370 },
  'b-side': { x: 770, y: 430 },
  'b-door': { x: 905, y: 420 },
  'b-front-1': { x: 290, y: 470 },
  'b-front-2': { x: 540, y: 470 },
};
const SEATED: FurnitureId[] = ['table2', 'table4', 'sofa', 'bar', 'stools', 'commune', 'pair4', 'booth'];

// ——— Стиль зала: стены и пол — слои размером с комнату, вещи — кусочки на своих местах (scripts/pack_hall_style.py,
// scripts/cut_hall_items.py). Отделку и вещи можно сочетать как угодно: все правки сделаны поверх одной комнаты ———

const isFinish = (f: FurnitureId): boolean => /^b?(walls|floor)-/.test(f);

/** Светильники «штриха» висят вместо штатных ламп: те прячет заплатка стены без ламп */
const LIGHTS: FurnitureId[] = ['paperlamp', 'pendants', 'chandelier'];

function finishHtml(layout: Partial<Record<string, FurnitureId>>): string {
  const layers = ['walls', 'floor']
    .map((slot) => layout[slot])
    .filter((f): f is FurnitureId => !!f && !!art(f))
    .map((f) => `<img class="hall-finish" src="${art(f)}" alt="">`);
  if (layout.touch && LIGHTS.includes(layout.touch)) {
    const walls = layout.walls?.replace('walls-', '') ?? 'default';
    const patch = art(`nolamp-${walls}`) ?? art('nolamp-default');
    layers.push(`<img class="hall-finish" src="${patch}" alt="">`);
  }
  return layers.join('');
}

/** Висят над залом — поверх стены и вещей на стене; остальное стоит на полу и сортируется по глубине */
const HANGING: FurnitureId[] = ['neon', 'rack', 'mirror', 'samovar', 'pendants', 'paperlamp', 'chandelier', 'garland'];

/** Где вещь висит на особой отделке: на стене с панелями неон — внутри средней панели, не поверх молдинга */
const ON_WALLS: Partial<Record<string, Partial<Record<FurnitureId, [number, number, number, number]>>>> = {
  'walls-classic': { neon: [322, 60, 84, 54] },
};

function itemHtml(slot: string, f: FurnitureId, sel: boolean, live: boolean, walls?: FurnitureId): string {
  const fr = (walls && ON_WALLS[walls]?.[f]) ?? HALL_ITEMS[f];
  if (!fr) return '';
  const [x, y, w, h] = fr;
  // Светильники висят под потолком перед стеной и шкафом; вещи на стене — за мебелью
  const z = LIGHTS.includes(f) ? 900 : HANGING.includes(f) ? 3 : 10 + y + h;
  const act = live ? ` data-action="hall-slot" data-item="${slot}"` : '';
  return `<img class="hall-piece${sel ? ' selected' : ''}" src="${art(`item-${f}`)}" alt="${live ? furniture(f).name : ''}"${act}
    style="left:${pct(x, HALL_ROOM.w)};top:${pct(y, HALL_ROOM.h)};width:${pct(w, HALL_ROOM.w)};z-index:${z}">`;
}

/** Акцент на стене висит там же, где картина и часы: пока он есть, их не видно (уют они дают по-прежнему) */
const coveredByFeature = (layout: Partial<Record<string, FurnitureId>>, slot: string): boolean =>
  !!layout.feature && (slot === 'wall-1' || slot === 'wall-2');

/** Где на картинке видно отделку: кусок стены и пола для образца в списке */
const SWATCH_AT = { walls: { x: 205, y: 200 }, floor: { x: 470, y: 470 } };
const BISTRO_SWATCH_AT = { walls: { x: 761, y: 140 }, floor: { x: 470, y: 520 } };
const SWATCH_SPAN = 80;

/** Картинка вещи для списка; у отделки — кусок стены или пола, у вещей стиля — сама вещь */
function swatch(id: FurnitureId): string {
  if (isFinish(id)) {
    const at = (kind === 'bistro' ? BISTRO_SWATCH_AT : SWATCH_AT)[/^b?walls-/.test(id) ? 'walls' : 'floor'];
    const k = 44 / SWATCH_SPAN;
    const pos = `${-(at.x - SWATCH_SPAN / 2) * k}px ${-(at.y - SWATCH_SPAN / 2) * k}px`;
    // Базовая отделка бистро нарисована в самой комнате — образец из неё
    const src = art(id) || (kind === 'bistro' ? roomUrl : '');
    return `<span class="swatch" style="background:url(${src}) ${pos}/${HALL_ROOM.w * k}px auto no-repeat #efe7da"></span>`;
  }
  if (HALL_ITEMS[id]) return `<span class="swatch icon"><img src="${art(`thumb-${id}`) ?? art(`item-${id}`)}" alt=""></span>`;
  return `<img src="${thumb(id)}" alt="">`;
}

/** Картинка вещи для списка: вырезанная отдельно, целиком (scripts/cut_hall.py, THUMBS); иначе — первый кусок с ней */
function thumb(id: FurnitureId): string {
  const own = art(`thumb-${id}`);
  if (own) return own;
  const key = Object.keys(HALL_FRAMES).find((k) => k.endsWith(`-${id}`));
  return key ? art(key) : '';
}

const SLOT_TITLE: Record<string, string> = {
  rug: L('Пол в\u00a0центре'),
  'wall-1': L('Стена над диваном'),
  'wall-2': L('Стена повыше'),
  corner: L('У\u00a0стены слева'),
  shelf: L('У\u00a0стены справа'),
  nook: L('Угол у\u00a0окна'),
  window: L('Под окном'),
  'small-1': L('Угол у\u00a0входа в\u00a0зал'),
  'table-1': L('Стол у\u00a0стойки'),
  'table-2': L('Стол слева'),
  'table-3': L('Стол в\u00a0центре'),
  'table-4': L('Стол у\u00a0витрины'),
  walls: L('Стены'),
  floor: L('Пол'),
  feature: L('Акцент на\u00a0стене'),
  touch: L('Деталь'),
  tree: L('Угол у\u00a0двери'),
  garland: L('Окно'),
  'b-wall-l': L('Стена слева'),
  'b-wall-c': L('Над раздачей'),
  'b-wall-r': L('Стена справа'),
  'b-corner': L('Угол у\u00a0раздачи'),
  'b-window': L('Под окном'),
  'b-center': L('Центр зала'),
  'b-side': L('У\u00a0правой стены'),
  'b-door': L('У\u00a0двери'),
  'b-front-1': L('Столик слева'),
  'b-front-2': L('Столик справа'),
};

const LIKE_LABEL: Record<ResidentKind, string> = {
  office: L('офисным'),
  student: L('студентам'),
  pensioner: L('пенсионерам'),
  shopkeeper: L('продавцам'),
  remote: L('фрилансерам'),
  youth: L('молодёжи'),
  nightworker: L('ночной смене'),
  passenger: L('пассажирам'),
  visitor: L('гостям района'),
};

function pct(v: number, of: number): string {
  return `${((v / of) * 100).toFixed(2)}%`;
}

function facts(seats: number, cozy: number): string {
  const parts: string[] = [];
  if (seats) parts.push(tr`${seats} мест${seats === 1 ? L('о') : seats < 5 ? L('а') : ''}`);
  if (cozy) parts.push(tr`уют +${cozy}`);
  return parts.join(' · ') || L('для вида');
}

/** Насколько зал полон: гости рисуются вместе с мебелью, одним уровнем на весь зал */
function fullness(sim: Simulation): '' | 'half' | 'full' {
  const seats = sim.cafe.interior.seats;
  const now = sim.seated();
  if (!seats || !now) return '';
  return now * 2 <= seats ? 'half' : 'full';
}

function pieceHtml(slot: string, f: FurnitureId, state: string, rug: boolean, sel: boolean, live = true): string {
  const base = `${slot}-${f}`;
  const withState = state && SEATED.includes(f) && HALL_FRAMES[`${base}-${state}`] ? `${base}-${state}` : base;
  const name = rug && HALL_FRAMES[`${withState}~rug`] ? `${withState}~rug` : withState;
  const frame = HALL_FRAMES[name];
  if (!frame) return '';
  const [x, y, w, h] = frame;
  // Слой: коврик внизу, стены за мебелью, остальное — чем ниже на полу, тем ближе
  const z = slot === 'rug' ? 1 : slot.startsWith('wall') || slot.startsWith('b-wall') ? 2 : 10 + y + h;
  const style = `left:${pct(x, HALL_ROOM.w)};top:${pct(y, HALL_ROOM.h)};width:${pct(w, HALL_ROOM.w)};z-index:${z}`;
  const act = live ? ` data-action="hall-slot" data-item="${slot}"` : '';
  return `<img class="hall-piece${sel ? ' selected' : ''}" src="${art(name)}" alt="${live ? furniture(f).name : ''}"${act} style="${style}">`;
}

/** Доска с меню на стене: настоящие позиции и цены игрока поверх нарисованной доски */
const BOARD = { x: 470, y: 60, w: 218, h: 106 };
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function menuBoard(sim: Simulation | null): string {
  const items = sim ? sim.cafe.menu : [];
  const rows = items.map((m) => `<li><span>${esc(m.name)}</span><b>${m.price}</b></li>`).join('');
  const style = `left:${pct(BOARD.x, HALL_ROOM.w)};top:${pct(BOARD.y, HALL_ROOM.h)};width:${pct(BOARD.w, HALL_ROOM.w)};height:${pct(BOARD.h, HALL_ROOM.h)}`;
  return tr`<div class="hall-board" style="${style}" aria-label="Меню на доске"><ul>${rows}</ul></div>`;
}

/** Бариста за стойкой — отдельный слой размером с комнату (scripts/cut_hall.py): только когда он на смене */
const baristaLayer = tr`<img class="hall-barista" src="${art('barista')}" alt="Бариста за стойкой">`;

/** Миниатюра комплектации: тот же зал из тех же кусков, без кнопок и гостей */
function miniHall(layout: Partial<Record<string, FurnitureId>>): string {
  const rug = layout.rug === 'rug';
  const things = hallSlots(kind).map(({ id }) => {
    const f = layout[id];
    if (coveredByFeature(layout, id)) return '';
    return f ? pieceHtml(id, f, '', rug, false, false) || itemHtml(id, f, false, false, layout.walls) : '';
  }).join('');
  return `<div class="hall mini" style="background-image:url(${roomUrl})" aria-hidden="true">${finishHtml(layout)}${kind === 'cafe' ? menuBoard(null) : ''}${things}</div>`;
}

/** Вкладка целиком; selected — выбранное место для своего дизайна */
export function hallTab(sim: Simulation, selected: string | null): string {
  const hall = sim.cafe.interior;
  useHall(hall.kind);
  const layout = hall.layout;
  const state = fullness(sim);
  const rug = layout.rug === 'rug';
  const things = hallSlots(kind).map(({ id }) => {
    const f = layout[id];
    const sel = selected === id;
    if (coveredByFeature(layout, id)) return '';
    if (f) return pieceHtml(id, f, state, rug, sel) || itemHtml(id, f, sel, true, layout.walls);
    const p = SLOT_AT[id];
    if (!p || (SEASON_SLOTS.includes(id) && !sim.holiday)) return '';
    return `<button class="hall-slot empty${sel ? ' selected' : ''}" data-action="hall-slot" data-item="${id}" aria-label="${SLOT_TITLE[id]}"
        style="left:${pct(p.x, HALL_ROOM.w)};top:${pct(p.y, HALL_ROOM.h)};z-index:2000">+</button>`;
  }).join('');

  const seatsNow = sim.seated();
  const today = sim.cafe.today.noSeat ?? 0;
  const stats = tr`<div class="kpis">
      <div><small>Мест</small><b>${hall.seats}</b></div>
      <div><small>Уют</small><b>${hall.cozy} из ${INTERIOR.cozyFull}</b></div>
      <div><small>Сидят сейчас</small><b>${seatsNow}</b></div>
    </div>
    <p class="hint-line">${
      today
        ? tr`Сегодня ${today} ${today === 1 ? L('гостю') : L('гостям')} не хватило места — взяли с собой.`
        : tr`Места ограничивают, сколько гостей сидит сразу. Уют: гости чаще заходят посидеть, заказывают ещё, советуют кафе знакомым и быстрее становятся постоянными.`
    }</p>`;

  const presets = presetsOf(kind).map((p) => {
    const probe = new Interior(() => kind);
    probe.load(p.layout);
    const on = hall.matches(p.id);
    const cost = hall.presetCost(p.id);
    const label = on ? L('Стоит сейчас') : cost >= 0 ? tr`Поставить за ${money(cost)}` : tr`Поставить, вернётся ${money(-cost)}`;
    return `<li class="preset${on ? ' on' : ''}">
      ${miniHall(p.layout)}
      <div class="row"><b class="grow">${p.name}</b><span class="badge">${facts(probe.seats, probe.cozy)}</span></div>
      <small>${p.hint}</small>
      <button class="small" data-action="hall-preset" data-item="${p.id}" ${on || sim.cash < cost ? 'disabled' : ''}>${
        !on && sim.cash < cost ? tr`Не хватает денег` : label
      }</button>
    </li>`;
  }).join('');

  const design = tr`<small>Нажми на место в зале — пустое (+) или занятое, — чтобы поставить, заменить или продать вещь.</small>`;

  const styleBlock = hall.styled ? styleSection(sim) : '';

  return tr`
    <div class="hall" style="background-image:url(${roomUrl})">${
      finishHtml(layout) + (kind === 'cafe' ? `${menuBoard(sim)}${sim.cafe.baristas > 0 ? baristaLayer : ''}` : '')
    }${things}</div>
    ${stats}
    ${styleBlock}
    <h4>Готовые комплектации</h4>
    <small>Выбрал — поставил. Лишнее продаётся за полцены, совпадающее остаётся.</small>
    <ul class="menu presets">${presets}</ul>
    ${sim.holiday ? tr`<h4>Новогодний декор 🎄</h4><p class="hint-line">До 12 января: ёлка и гирлянда — уют, а в праздники в такой зал чаще заходят посидеть. Нажми на место в зале — у двери или на окне.</p>` : ''}
    <h4>Свой дизайн</h4>
    <div class="row wrap">${hall.styleSlots.map(
      (slot) => `<button class="small secondary${selected === slot ? ' on' : ''}" data-action="hall-slot" data-item="${slot}">${SLOT_TITLE[slot]}</button>`,
    ).join('')}</div>
    ${design}`;
}

/** Выбор вещи для места в зале — в окне поверх экрана: длинный список не уезжает вниз панели */
export function hallPicker(sim: Simulation, selected: string): { title: string; body: string } {
  useHall(sim.cafe.interior.kind);
  const layout = sim.cafe.interior.layout;
  const cur = layout[selected];
  const options = FURNITURE.filter((f) => canPlace(selected, f.id, kind))
    .map((f) => {
      const net = f.cost - (cur ? Interior.refund(cur) : 0);
      const here = cur === f.id;
      const likes = f.likes.length
        ? tr` · нравится ${f.likes.map((k) => LIKE_LABEL[k]).join(L(' и\u00a0'))}`
        : f.style
          ? tr` · стиль «${styleName(f.style, kind)}»`
          : '';
      return `<li class="furniture${here ? ' on' : ''}">
          ${swatch(f.id)}
          <div class="grow"><b>${f.name}</b><small>${facts(f.seats, f.cozy)}${likes}</small></div>
          ${
            here
              ? L('<span class="badge on">стоит</span>')
              : `<button class="small" data-action="hall-place" data-item="${selected}:${f.id}" ${sim.cash < net ? 'disabled' : ''}>${money(f.cost)}</button>`
          }
        </li>`;
    })
    .join('');
  const finish = FINISH_SLOTS.includes(selected);
  const body = `${
    cur && !finish ? tr`<button class="small secondary" data-action="hall-sell" data-item="${selected}">Продать за ${money(Interior.refund(cur))}</button>` : ''
  }
      ${cur ? tr`<small>Замена: старая вещь продаётся за полцены.</small>` : ''}
      <ul class="menu furniture-list">${options}</ul>`;
  return { title: SLOT_TITLE[selected], body };
}

const AUDIENCE_LABEL: Record<StyleId, string> = {
  home: L('всем понемногу'),
  loft: L('молодёжи, фрилансерам и\u00a0студентам'),
  scandi: L('офисным и\u00a0фрилансерам'),
  classic: L('пенсионерам и\u00a0гостям района'),
};

/** Стиль зала: какой сейчас, сколько элементов у каждого, кому нравится и сколько таких вокруг */
function styleSection(sim: Simulation): string {
  const hall = sim.cafe.interior;
  const now = hall.style;
  const nowName = now ? styleName(now, kind) : '';
  const total = hall.styleSlots.length;
  const head = now
    ? tr`<p class="hint-line">Стиль зала: <b>${nowName}</b> — нравится ${AUDIENCE_LABEL[now]}. Они чаще замечают кафе, садятся в зале и советуют его своим.</p>`
    : kind === 'bistro'
      ? tr`<p class="hint-line">Стиля пока нет. В бистро стиль — это стены и пол одного стиля. Своя аудитория чаще замечает бистро, садится в зале и советует его своим.</p>`
      : tr`<p class="hint-line">Стиля пока нет. Стиль засчитывается с ${INTERIOR.styleNeed} из 4: стены, пол и две фирменные вещи. Своя аудитория чаще замечает кафе, садится в зале и советует его своим. Смешанный зал тоже работает, но слабее: каждая вещь нравится своим понемногу.</p>`;
  const cards = STYLES.map((st) => {
    const n = hall.styleCount(st.id);
    const full = n === total;
    const cost = hall.styleCost(st.id);
    const items = Object.values(styleSet(st.id, kind)).map((f) => swatch(f!)).join('');
    const who = st.audience === 'all' ? tr`всем понемногу` : tr`${AUDIENCE_LABEL[st.id]} · вокруг таких ${sim.styleAudience(st.id)}`;
    return tr`<li class="style-card${now === st.id ? ' on' : ''}">
      <div class="row"><b class="grow">${styleName(st.id, kind)}</b><span class="badge${now === st.id ? ' on' : ''}">${n} из ${total}</span></div>
      <div class="swatches">${items}</div>
      <small>Нравится ${who}</small>
      <button class="small" data-action="hall-style" data-item="${st.id}" ${full || sim.cash < cost ? 'disabled' : ''}>${
        full ? L('Собран') : sim.cash < cost ? L('Не хватает денег') : tr`Собрать за ${money(cost)}`
      }</button>
    </li>`;
  }).join('');
  return tr`<h4>Стиль зала</h4>${head}<ul class="menu styles">${cards}</ul>`;
}
