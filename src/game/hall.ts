// Вкладка «Зал»: картинка зала с мебелью на местах, готовые комплектации и свой дизайн.
// Только отрисовка: покупки идут через публичные методы Simulation.
import {
  canPlace,
  FURNITURE,
  furniture,
  HALL_SLOTS,
  Interior,
  INTERIOR,
  PRESETS,
  type FurnitureId,
} from '../sim/interior';
import { formatMoney } from '../sim/economy';
import type { ResidentKind } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import roomUrl from './art/hall3/room.webp';
import { HALL_FRAMES, HALL_ROOM } from './hallFrames';

const NB = '\u00a0';
const money = formatMoney;

// Зал нарисован целиком в одном ракурсе, мебель вырезана из него же (scripts/cut_hall.py):
// каждый кусочек ложится в свои координаты комнаты, поэтому размеры и перспектива совпадают
const ART = import.meta.glob('./art/hall3/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (id: string): string => ART[`./art/hall3/${id}.webp`];

/** Кнопка «+» пустого места: точка на полу или стене, в пикселях комнаты */
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
};
const SEATED: FurnitureId[] = ['table2', 'table4', 'sofa', 'bar'];

/** Картинка вещи для списка: первая, где она нарисована пустой */
function thumb(id: FurnitureId): string {
  const key = Object.keys(HALL_FRAMES).find((k) => k.endsWith(`-${id}`));
  return key ? art(key) : '';
}

const SLOT_TITLE: Record<string, string> = {
  rug: 'Пол в\u00a0центре',
  'wall-1': 'Стена над диваном',
  'wall-2': 'Стена повыше',
  corner: 'У\u00a0стены слева',
  shelf: 'У\u00a0стены справа',
  nook: 'Угол у\u00a0окна',
  window: 'Под окном',
  'small-1': 'Угол у\u00a0входа в\u00a0зал',
  'table-1': 'Стол у\u00a0стойки',
  'table-2': 'Стол слева',
  'table-3': 'Стол в\u00a0центре',
  'table-4': 'Стол у\u00a0витрины',
};

const LIKE_LABEL: Record<ResidentKind, string> = {
  office: 'офисным',
  student: 'студентам',
  pensioner: 'пенсионерам',
  shopkeeper: 'продавцам',
  remote: 'фрилансерам',
  youth: 'молодёжи',
  nightworker: 'ночной смене',
  passenger: 'пассажирам',
  visitor: 'гостям района',
};

function pct(v: number, of: number): string {
  return `${((v / of) * 100).toFixed(2)}%`;
}

function facts(seats: number, cozy: number): string {
  const parts: string[] = [];
  if (seats) parts.push(`${seats}${NB}мест${seats === 1 ? 'о' : seats < 5 ? 'а' : ''}`);
  if (cozy) parts.push(`уют +${cozy}`);
  return parts.join(' · ') || 'для вида';
}

/** Насколько зал полон: гости рисуются вместе с мебелью, одним уровнем на весь зал */
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
  // Слой: коврик внизу, стены за мебелью, остальное — чем ниже на полу, тем ближе
  const z = slot === 'rug' ? 1 : slot.startsWith('wall') ? 2 : 10 + y + h;
  const style = `left:${pct(x, HALL_ROOM.w)};top:${pct(y, HALL_ROOM.h)};width:${pct(w, HALL_ROOM.w)};z-index:${z}`;
  const act = live ? ` data-action="hall-slot" data-item="${slot}"` : '';
  return `<img class="hall-piece${sel ? ' selected' : ''}" src="${art(name)}" alt="${live ? furniture(f).name : ''}"${act} style="${style}">`;
}

/** Доска с меню на стене: настоящие позиции и цены игрока поверх нарисованной доски */
const BOARD = { x: 470, y: 60, w: 218, h: 106 };
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function menuBoard(sim: Simulation | null): string {
  const items = sim ? sim.cafe.menu : [];
  const rows = items.map((m) => `<li><span>${esc(m.name)}</span><b>${m.price}</b></li>`).join('');
  const style = `left:${pct(BOARD.x, HALL_ROOM.w)};top:${pct(BOARD.y, HALL_ROOM.h)};width:${pct(BOARD.w, HALL_ROOM.w)};height:${pct(BOARD.h, HALL_ROOM.h)}`;
  return `<div class="hall-board" style="${style}" aria-label="Меню на доске"><ul>${rows}</ul></div>`;
}

/** Бариста за стойкой — отдельный слой размером с комнату (scripts/cut_hall.py): только когда он на смене */
const baristaLayer = `<img class="hall-barista" src="${art('barista')}" alt="Бариста за стойкой">`;

/** Миниатюра комплектации: тот же зал из тех же кусков, без кнопок и гостей */
function miniHall(layout: Partial<Record<string, FurnitureId>>): string {
  const rug = layout.rug === 'rug';
  const things = HALL_SLOTS.map(({ id }) => {
    const f = layout[id];
    return f ? pieceHtml(id, f, '', rug, false, false) : '';
  }).join('');
  return `<div class="hall mini" style="background-image:url(${roomUrl})" aria-hidden="true">${menuBoard(null)}${things}</div>`;
}

/** Вкладка целиком; selected — выбранное место для своего дизайна */
export function hallTab(sim: Simulation, selected: string | null): string {
  const hall = sim.cafe.interior;
  const layout = hall.layout;
  const state = fullness(sim);
  const rug = layout.rug === 'rug';
  const things = HALL_SLOTS.map(({ id }) => {
    const f = layout[id];
    const sel = selected === id;
    if (f) return pieceHtml(id, f, state, rug, sel);
    const p = SLOT_AT[id];
    return `<button class="hall-slot empty${sel ? ' selected' : ''}" data-action="hall-slot" data-item="${id}" aria-label="${SLOT_TITLE[id]}"
        style="left:${pct(p.x, HALL_ROOM.w)};top:${pct(p.y, HALL_ROOM.h)};z-index:2000">+</button>`;
  }).join('');

  const seatsNow = sim.seated();
  const today = sim.cafe.today.noSeat ?? 0;
  const stats = `<div class="kpis">
      <div><small>Мест</small><b>${hall.seats}</b></div>
      <div><small>Уют</small><b>${hall.cozy}${NB}из${NB}${INTERIOR.cozyFull}</b></div>
      <div><small>Сидят сейчас</small><b>${seatsNow}</b></div>
    </div>
    <p class="hint-line">${
      today
        ? `Сегодня ${today}${NB}${today === 1 ? 'гостю' : 'гостям'} не${NB}хватило места${NB}— взяли с${NB}собой.`
        : `Места ограничивают, сколько гостей сидит сразу. Уют: гости чаще заходят посидеть, заказывают ещё, советуют кафе знакомым и${NB}быстрее становятся постоянными.`
    }</p>`;

  const presets = PRESETS.map((p) => {
    const probe = new Interior();
    probe.load(p.layout);
    const on = hall.matches(p.id);
    const cost = hall.presetCost(p.id);
    const label = on ? 'Стоит сейчас' : cost >= 0 ? `Поставить за${NB}${money(cost)}` : `Поставить, вернётся ${money(-cost)}`;
    return `<li class="preset${on ? ' on' : ''}">
      ${miniHall(p.layout)}
      <div class="row"><b class="grow">${p.name}</b><span class="badge">${facts(probe.seats, probe.cozy)}</span></div>
      <small>${p.hint}</small>
      <button class="small" data-action="hall-preset" data-item="${p.id}" ${on || sim.cash < cost ? 'disabled' : ''}>${
        !on && sim.cash < cost ? `Не${NB}хватает денег` : label
      }</button>
    </li>`;
  }).join('');

  let design = `<small>Нажми на${NB}место в${NB}зале${NB}— пустое (+) или занятое,${NB}— чтобы поставить, заменить или продать вещь.</small>`;
  if (selected) {
    const cur = layout[selected];
    const options = FURNITURE.filter((f) => canPlace(selected, f.id))
      .map((f) => {
        const net = f.cost - (cur ? Interior.refund(cur) : 0);
        const here = cur === f.id;
        const likes = f.likes.length ? ` · нравится ${f.likes.map((k) => LIKE_LABEL[k]).join(' и${NB}')}` : '';
        return `<li class="furniture${here ? ' on' : ''}">
          <img src="${thumb(f.id)}" alt="">
          <div class="grow"><b>${f.name}</b><small>${facts(f.seats, f.cozy)}${likes}</small></div>
          ${
            here
              ? '<span class="badge on">стоит</span>'
              : `<button class="small" data-action="hall-place" data-item="${selected}:${f.id}" ${sim.cash < net ? 'disabled' : ''}>${money(f.cost)}</button>`
          }
        </li>`;
      })
      .join('');
    design = `<div class="row"><b class="grow">${SLOT_TITLE[selected]}</b>${
      cur ? `<button class="small secondary" data-action="hall-sell" data-item="${selected}">Продать за${NB}${money(Interior.refund(cur))}</button>` : ''
    }</div>
      ${cur ? `<small>Замена: старая вещь продаётся за${NB}полцены.</small>` : ''}
      <ul class="menu furniture-list">${options}</ul>`;
  }

  return `
    <div class="hall" style="background-image:url(${roomUrl})">${menuBoard(sim)}${sim.cafe.baristas > 0 ? baristaLayer : ''}${things}</div>
    ${stats}
    <h4>Готовые комплектации</h4>
    <small>Выбрал${NB}— поставил. Лишнее продаётся за${NB}полцены, совпадающее остаётся.</small>
    <ul class="menu presets">${presets}</ul>
    <h4>Свой дизайн</h4>
    ${design}`;
}
