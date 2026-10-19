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
import roomUrl from './art/hall/room.webp';
import { ATLASES, personFrame, type Facing } from './atlas';
import peopleUrl from './art/people.png';
import type { Resident } from '../sim/residents';

const NB = ' ';
const money = formatMoney;

const ART = import.meta.glob('./art/hall/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (id: string): string => ART[`./art/hall/${id}.webp`];

/** Картинка зала 1024×768: где стоит каждое место (низ по центру) и какой ширины вещь, в пикселях картинки */
const ROOM = { w: 1024, h: 768 };
const SLOT_POS: Record<string, { x: number; y: number }> = {
  rug: { x: 480, y: 655 },
  'wall-1': { x: 250, y: 255 },
  'wall-2': { x: 770, y: 222 },
  corner: { x: 265, y: 420 },
  window: { x: 190, y: 540 },
  'small-1': { x: 830, y: 470 },
  'table-1': { x: 390, y: 545 },
  'table-2': { x: 650, y: 545 },
  'table-3': { x: 330, y: 680 },
  'table-4': { x: 630, y: 690 },
  'small-2': { x: 125, y: 690 },
};
const ITEM_W: Record<FurnitureId, number> = {
  table2: 170,
  table4: 190,
  sofa: 200,
  bar: 190,
  bookshelf: 150,
  games: 150,
  monstera: 95,
  plant: 55,
  floorlamp: 52,
  picture: 70,
  clock: 58,
  rug: 380,
};
const SLOT_TITLE: Record<string, string> = {
  rug: 'Пол в центре',
  'wall-1': 'Стена слева',
  'wall-2': 'Стена над витриной',
  corner: 'Угол у окна',
  window: 'У окна',
  'small-1': 'У стойки',
  'small-2': 'Угол у входа',
  'table-1': 'Место для стола 1',
  'table-2': 'Место для стола 2',
  'table-3': 'Место для стола 3',
  'table-4': 'Место для стола 4',
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

/** Где сидят гости у каждой вещи: смещение от низа места (пиксели картинки зала), куда смотрит, за вещью ли */
interface Seat {
  dx: number;
  dy: number;
  facing: Facing;
  mirror?: boolean;
  behind?: boolean;
}
const SEATS: Partial<Record<FurnitureId, Seat[]>> = {
  table2: [
    { dx: -52, dy: -30, facing: 'right' },
    { dx: 52, dy: -30, facing: 'right', mirror: true },
  ],
  table4: [
    { dx: -38, dy: -92, facing: 'down', behind: true },
    { dx: 38, dy: -92, facing: 'down', behind: true },
    { dx: -74, dy: -40, facing: 'right' },
    { dx: 74, dy: -40, facing: 'right', mirror: true },
  ],
  sofa: [
    { dx: -42, dy: -58, facing: 'down' },
    { dx: 40, dy: -58, facing: 'down' },
  ],
  bar: [
    { dx: -48, dy: -44, facing: 'up' },
    { dx: 34, dy: -44, facing: 'up' },
  ],
};
/** Жителя видно по пояс: 30 из 44 пикселей кадра, высота кадра в зале — 112 пикселей картинки */
const GUEST = { crop: 30, scale: 112 / 44 };
const PEOPLE_ATLAS = { w: 484, h: 436 };

function guestHtml(r: Resident, x: number, y: number, seat: Seat, z: number): string {
  const frame = ATLASES.people.frames[personFrame(r.kind, seat.facing, 0)];
  const [fx, fy, fw] = frame;
  const w = fw * GUEST.scale;
  const h = GUEST.crop * GUEST.scale;
  const style = [
    `left:${pct(x - w / 2, ROOM.w)}`,
    `bottom:${pct(ROOM.h - y, ROOM.h)}`,
    `width:${pct(w, ROOM.w)}`,
    `height:${pct(h, ROOM.h)}`,
    `background-image:url(${peopleUrl})`,
    `background-size:${((PEOPLE_ATLAS.w / fw) * 100).toFixed(2)}% ${((PEOPLE_ATLAS.h / GUEST.crop) * 100).toFixed(2)}%`,
    `background-position:${((fx / (PEOPLE_ATLAS.w - fw)) * 100).toFixed(3)}% ${((fy / (PEOPLE_ATLAS.h - GUEST.crop)) * 100).toFixed(3)}%`,
    `z-index:${z}`,
    seat.mirror ? 'transform:scaleX(-1)' : '',
  ].join(';');
  return `<i class="hall-guest" style="${style}"></i>`;
}

/** Кто где сидит: сначала у вещей, которые гостю нравятся, остальные — по порядку */
function seatGuests(sim: Simulation): string {
  const layout = sim.cafe.interior.layout;
  const guests = sim.residents
    .filter((r) => r.visit?.stage === 'dining' && r.visit.want.mode === 'replace')
    .sort((a, b) => a.id - b.id);
  const free: { slot: string; f: FurnitureId; seat: Seat }[] = [];
  for (const { id } of HALL_SLOTS) {
    const f = layout[id];
    for (const seat of (f && SEATS[f]) || []) free.push({ slot: id, f: f!, seat });
  }
  let html = '';
  for (const r of guests) {
    let i = free.findIndex((s) => furniture(s.f).likes.includes(r.kind));
    if (i < 0) i = 0;
    const spot = free.splice(i, 1)[0];
    if (!spot) break;
    const p = SLOT_POS[spot.slot];
    const z = p.y + (spot.seat.behind ? -1 : 1);
    html += guestHtml(r, p.x + spot.seat.dx, p.y + spot.seat.dy, spot.seat, z);
  }
  return html;
}

/** Вкладка целиком; selected — выбранное место для своего дизайна */
export function hallTab(sim: Simulation, selected: string | null): string {
  const hall = sim.cafe.interior;
  const layout = hall.layout;
  // Ближние предметы рисуются поверх дальних
  const order = [...HALL_SLOTS].sort((a, b) => (a.kind === 'rug' ? -1 : b.kind === 'rug' ? 1 : SLOT_POS[a.id].y - SLOT_POS[b.id].y));
  const things = order
    .map(({ id }) => {
      const p = SLOT_POS[id];
      const f = layout[id];
      const sel = selected === id ? ' selected' : '';
      if (!f) {
        return `<button class="hall-slot empty${sel}" data-action="hall-slot" data-item="${id}" aria-label="${SLOT_TITLE[id]}"
          style="left:${pct(p.x, ROOM.w)};top:${pct(p.y, ROOM.h)};z-index:2000">+</button>`;
      }
      const w = ITEM_W[f];
      return `<button class="hall-thing${sel}" data-action="hall-slot" data-item="${id}" aria-label="${furniture(f).name}"
        style="left:${pct(p.x - w / 2, ROOM.w)};bottom:${pct(ROOM.h - p.y, ROOM.h)};width:${pct(w, ROOM.w)};z-index:${f === 'rug' ? 0 : p.y}"><img src="${art(f)}" alt=""></button>`;
    })
    .join('');

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
        : `Места ограничивают, сколько гостей сидит сразу. Уют: гости чаще заказывают ещё и${NB}быстрее становятся постоянными.`
    }</p>`;

  const presets = PRESETS.map((p) => {
    const probe = new Interior();
    probe.load(p.layout);
    const on = hall.matches(p.id);
    const cost = hall.presetCost(p.id);
    const label = on ? 'Стоит сейчас' : cost >= 0 ? `Поставить за${NB}${money(cost)}` : `Поставить, вернётся ${money(-cost)}`;
    return `<li class="preset${on ? ' on' : ''}">
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
          <img src="${art(f.id)}" alt="">
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
    <div class="hall" style="background-image:url(${roomUrl})">${things}${seatGuests(sim)}</div>
    ${stats}
    <h4>Готовые комплектации</h4>
    <small>Выбрал${NB}— поставил. Лишнее продаётся за${NB}полцены, совпадающее остаётся.</small>
    <ul class="menu presets">${presets}</ul>
    <h4>Свой дизайн</h4>
    ${design}`;
}
