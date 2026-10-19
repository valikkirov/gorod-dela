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
import roomUrl from './art/hall/room-v2.webp';
import { SIT_HEIGHT } from './hallSit';
import type { Resident } from '../sim/residents';

const NB = ' ';
const money = formatMoney;

const ART = import.meta.glob('./art/hall/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const art = (id: string): string => ART[`./art/hall/${id}.webp`];

/** Картинка зала 792×740, вид строго спереди: стена сверху, пол — нижние 60 %. Координаты — в её пикселях.
 *  Место задаётся точкой «низ по центру»: на эту линию пола вещь встаёт ножками. */
const ROOM = { w: 792, h: 740 };
const SLOT_POS: Record<string, { x: number; y: number }> = {
  'wall-1': { x: 600, y: 140 },
  'wall-2': { x: 702, y: 80 },
  window: { x: 150, y: 338 },
  'small-1': { x: 262, y: 334 },
  rug: { x: 400, y: 640 },
  'table-1': { x: 250, y: 470 },
  'table-2': { x: 560, y: 470 },
  corner: { x: 170, y: 590 },
  'table-3': { x: 560, y: 595 },
  'table-4': { x: 360, y: 690 },
  'small-2': { x: 690, y: 690 },
};

/** Из каких картинок собрана вещь: смещение низа по центру от места, ширина, слой (больше — ближе) */
interface Piece {
  art: string;
  dx: number;
  dy: number;
  w: number;
  z: number;
  mirror?: boolean;
}
/** Где сидит гость: точка под ногами, поза, слой */
type Pose = 'side' | 'front' | 'back';
interface Seat {
  dx: number;
  dy: number;
  pose: Pose;
  z: number;
  mirror?: boolean;
}
const W = { chair: 52, round: 76, square: 100, sofa: 210, stool: 40, bar: 215, shelf: 120, games: 110, monstera: 85, plant: 48, lamp: 44, picture: 66, clock: 48, rug: 320 };
// Стулья сбоку от стола: гость садится на стул (слой между стулом и столом), колени уходят под стол
const SIDE_CHAIRS = (gap: number, dy = 0, z = 0): { pieces: Piece[]; seats: Seat[] } => ({
  pieces: [
    { art: 'v2-chair', dx: -gap, dy, w: W.chair, z: z + 1 },
    { art: 'v2-chair', dx: gap, dy, w: W.chair, z: z + 1, mirror: true },
  ],
  seats: [
    { dx: -gap + 8, dy: dy - 2, pose: 'side', z: z + 2 },
    { dx: gap - 8, dy: dy - 2, pose: 'side', z: z + 2, mirror: true },
  ],
});
const T2 = SIDE_CHAIRS(52);
const T4back = SIDE_CHAIRS(66, -26, -10);
const T4front = SIDE_CHAIRS(66, 4, 0);
const ITEMS: Record<FurnitureId, { pieces: Piece[]; seats: Seat[] }> = {
  table2: { pieces: [...T2.pieces, { art: 'v2-table-round', dx: 0, dy: 0, w: W.round, z: 5 }], seats: T2.seats },
  table4: {
    pieces: [...T4back.pieces, ...T4front.pieces, { art: 'v2-table-square', dx: 0, dy: -4, w: W.square, z: 5 }],
    seats: [...T4back.seats, ...T4front.seats],
  },
  sofa: {
    pieces: [{ art: 'v2-sofa', dx: 0, dy: 0, w: W.sofa, z: 1 }],
    seats: [
      { dx: -45, dy: -8, pose: 'front', z: 2 },
      { dx: 45, dy: -8, pose: 'front', z: 2 },
    ],
  },
  bar: {
    pieces: [
      { art: 'v2-bar', dx: 0, dy: 0, w: W.bar, z: 1 },
      { art: 'v2-stool', dx: -50, dy: 26, w: W.stool, z: 3 },
      { art: 'v2-stool', dx: 50, dy: 26, w: W.stool, z: 3 },
    ],
    seats: [
      { dx: -50, dy: 6, pose: 'back', z: 4 },
      { dx: 50, dy: 6, pose: 'back', z: 4 },
    ],
  },
  bookshelf: { pieces: [{ art: 'v2-bookshelf', dx: 0, dy: 0, w: W.shelf, z: 1 }], seats: [] },
  games: { pieces: [{ art: 'v2-games', dx: 0, dy: 0, w: W.games, z: 1 }], seats: [] },
  monstera: { pieces: [{ art: 'v2-monstera', dx: 0, dy: 0, w: W.monstera, z: 1 }], seats: [] },
  plant: { pieces: [{ art: 'v2-plant', dx: 0, dy: 0, w: W.plant, z: 1 }], seats: [] },
  floorlamp: { pieces: [{ art: 'v2-floorlamp', dx: 0, dy: 0, w: W.lamp, z: 1 }], seats: [] },
  picture: { pieces: [{ art: 'v2-picture', dx: 0, dy: 0, w: W.picture, z: 1 }], seats: [] },
  clock: { pieces: [{ art: 'v2-clock', dx: 0, dy: 0, w: W.clock, z: 1 }], seats: [] },
  rug: { pieces: [{ art: 'v2-rug', dx: 0, dy: 0, w: W.rug, z: 1 }], seats: [] },
};
/** Картинка вещи для списка: у столов — сам стол */
const THUMB: Record<FurnitureId, string> = {
  table2: 'v2-table-round',
  table4: 'v2-table-square',
  sofa: 'v2-sofa',
  bar: 'v2-bar',
  bookshelf: 'v2-bookshelf',
  games: 'v2-games',
  monstera: 'v2-monstera',
  plant: 'v2-plant',
  floorlamp: 'v2-floorlamp',
  picture: 'v2-picture',
  clock: 'v2-clock',
  rug: 'v2-rug',
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

/** Слой: ближе к зрителю — выше; внутри вещи — порядок деталей (стул → гость → стол) */
const layer = (slotY: number, z: number, rug = false): number => (rug ? 1 : Math.round(slotY * 10 + z));

function pieceHtml(slot: string, p: Piece, sel: boolean, label: string): string {
  const at = SLOT_POS[slot];
  const style = [
    `left:${pct(at.x + p.dx - p.w / 2, ROOM.w)}`,
    `bottom:${pct(ROOM.h - (at.y + p.dy), ROOM.h)}`,
    `width:${pct(p.w, ROOM.w)}`,
    `z-index:${layer(at.y, p.z, slot === 'rug')}`,
    p.mirror ? 'transform:scaleX(-1)' : '',
  ].join(';');
  return `<img class="hall-piece${sel ? ' selected' : ''}" src="${art(p.art)}" alt="${label}" data-action="hall-slot" data-item="${slot}" style="${style}">`;
}

function guestHtml(r: Resident, slot: string, seat: Seat): string {
  const at = SLOT_POS[slot];
  const key = `${r.kind}-${seat.pose}`;
  const h = SIT_HEIGHT[key] ?? 80;
  const style = [
    `left:${pct(at.x + seat.dx, ROOM.w)}`,
    `bottom:${pct(ROOM.h - (at.y + seat.dy), ROOM.h)}`,
    `height:${pct(h, ROOM.h)}`,
    `z-index:${layer(at.y, seat.z)}`,
    `transform:translateX(-50%)${seat.mirror ? ' scaleX(-1)' : ''}`,
  ].join(';');
  return `<img class="hall-guest" src="${art(`sit-${key}`)}" alt="" style="${style}">`;
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
    if (f) for (const seat of ITEMS[f].seats) free.push({ slot: id, f, seat });
  }
  let html = '';
  for (const r of guests) {
    let i = free.findIndex((s) => furniture(s.f).likes.includes(r.kind));
    if (i < 0) i = 0;
    const spot = free.splice(i, 1)[0];
    if (!spot) break;
    html += guestHtml(r, spot.slot, spot.seat);
  }
  return html;
}

/** Вкладка целиком; selected — выбранное место для своего дизайна */
export function hallTab(sim: Simulation, selected: string | null): string {
  const hall = sim.cafe.interior;
  const layout = hall.layout;
  const things = HALL_SLOTS.map(({ id }) => {
    const p = SLOT_POS[id];
    const f = layout[id];
    const sel = selected === id;
    if (!f) {
      return `<button class="hall-slot empty${sel ? ' selected' : ''}" data-action="hall-slot" data-item="${id}" aria-label="${SLOT_TITLE[id]}"
          style="left:${pct(p.x, ROOM.w)};top:${pct(p.y, ROOM.h)};z-index:20000">+</button>`;
    }
    return ITEMS[f].pieces.map((piece) => pieceHtml(id, piece, sel, furniture(f).name)).join('');
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
          <img src="${art(THUMB[f.id])}" alt="">
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
