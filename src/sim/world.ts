// Карта района: деловая улица Кленовая (сверху вниз) и жилая Садовая (поперёк), Т-образный перекрёсток.
// Координаты в «пикселях мира». Иерархия территорий из GDD (улица → район → город) — поле territoryId.

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PlaceKind = 'home' | 'office' | 'shop' | 'cafe' | 'metro' | 'park' | 'bus' | 'school' | 'vacant';
export type Side = 'left' | 'right' | 'center';

/** Вход в здание: дверь на фасаде и точка на тротуаре напротив неё */
export interface Entrance {
  door: Point;
  front: Point;
}

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  territoryId: string;
  side: Side;
  /** Видимая часть здания: от верха (y) до основания фасада (y + h) */
  rect: Rect;
  /** Главный вход: житель «исчезает» внутри здания, дойдя до двери */
  door: Point;
  /** Точка на тротуаре напротив главной двери: отсюда считается крюк и здесь замечают витрину */
  front: Point;
  /** Другие входы (у метро два выхода, у сквера два входа). Главный — первый */
  entrances?: Entrance[];
  /** Жители внутри не видны (здание), в сквере — видны */
  indoor: boolean;
  /** Здание только рисуется и открывает карточку — жители туда не ходят */
  decor?: boolean;
}

export const WORLD = { width: 1440, height: 1560 } as const;

/**
 * Сетка 40 × 40, сдвинутая на 20 по x.
 * Кленовая идёт сверху вниз: дорога x 300–420, тротуары 260–300 и 420–460, здания 20–260 и 460–700.
 * Садовая идёт поперёк по всей ширине: тротуар 1040–1080, дорога 1080–1200, тротуар 1200–1240.
 * Перекрёсток x 300–420, y 1080–1200; переходы — продолжение тротуаров через дорогу.
 * Вид 3/4: у здания видна крыша и фасад; на южной стороне Садовой фасад смотрит вверх, к улице.
 */
export const GRID = { size: 40, offsetX: 20 } as const;
/** Кленовая: проезжая часть до перекрёстка */
export const ROAD = { left: 300, right: 420, top: 0, bottom: 1080 } as const;
/** Садовая: проезжая часть во всю ширину карты */
export const SADOVAYA = { top: 1080, bottom: 1200 } as const;
export const SIDEWALK = { leftX: 280, rightX: 440, width: 40, minY: 112, maxY: 1060 } as const;
/** Тротуары Садовой: северный и южный (середина полосы) */
export const SAD_SIDEWALK = { northY: 1060, southY: 1220 } as const;
export const ROAD_CENTER_X = (ROAD.left + ROAD.right) / 2;
/** Переход посреди Кленовой, между кафе и «Продуктами»: ряд клеток */
export const CROSSWALK_Y = 520;
/** Сквер на углу двух улиц */
export const SQUARE: Rect = { x: 460, y: 760, w: 400, h: 280 };

export function sidewalkX(side: 'left' | 'right'): number {
  return side === 'left' ? SIDEWALK.leftX : SIDEWALK.rightX;
}

const KLENOVAYA = 'street-1';
const SADOVAYA_ID = 'street-2';

/** Где житель стоит у двери: чуть ниже основания, на полосе перед фасадом */
const DOOR_OFFSET = 14;

/** Здание на Кленовой: фасад смотрит вниз, вход — с бокового тротуара */
function building(
  id: string,
  kind: PlaceKind,
  name: string,
  side: 'left' | 'right',
  top: number,
  base: number,
  doorX: number,
): Place {
  const x = side === 'left' ? 20 : 460;
  const door = { x: x + doorX, y: base + DOOR_OFFSET };
  return {
    id,
    kind,
    name,
    territoryId: KLENOVAYA,
    side,
    rect: { x, y: top, w: 240, h: base - top },
    door,
    front: { x: sidewalkX(side), y: door.y },
    indoor: true,
  };
}

/** Здание на Садовой. Северная сторона — фасад вниз, к улице; южная — фасад вверх */
function sadovaya(id: string, kind: PlaceKind, name: string, x: number, w: number, h: number, doorX: number, north: boolean): Place {
  const top = north ? 1040 - h : 1240;
  const door = north ? { x: x + doorX, y: 1040 + DOOR_OFFSET } : { x: x + doorX, y: 1240 + 4 };
  return {
    id,
    kind,
    name,
    territoryId: SADOVAYA_ID,
    side: 'center',
    rect: { x, y: top, w, h },
    door,
    front: { x: door.x, y: north ? SAD_SIDEWALK.northY : SAD_SIDEWALK.southY },
    indoor: true,
  };
}

export const PLACES: Place[] = [
  {
    id: 'metro',
    kind: 'metro',
    name: 'Метро «Кленовая»',
    territoryId: KLENOVAYA,
    side: 'center',
    rect: { x: 280, y: 10, w: 160, h: 78 },
    door: { x: ROAD_CENTER_X, y: 96 },
    front: { x: ROAD_CENTER_X, y: SIDEWALK.minY },
    // Одна станция, два выхода: на Кленовую и на Садовую. Выходят к тому, что ближе
    entrances: [
      { door: { x: ROAD_CENTER_X, y: 96 }, front: { x: ROAD_CENTER_X, y: SIDEWALK.minY } },
      { door: { x: ROAD_CENTER_X, y: 1250 }, front: { x: ROAD_CENTER_X, y: SAD_SIDEWALK.southY } },
    ],
    indoor: true,
  },
  {
    // Киоск у выхода из метро — второе помещение под бизнес
    id: 'kiosk',
    kind: 'cafe',
    name: 'Киоск у метро',
    territoryId: KLENOVAYA,
    side: 'left',
    rect: { x: 140, y: 4, w: 120, h: 72 },
    door: { x: 238, y: 90 },
    front: { x: SIDEWALK.leftX, y: 90 },
    indoor: true,
  },
  building('home-1', 'home', 'Дом 1', 'left', 100, 268, 204),
  building('cafe', 'cafe', 'Твоё кафе', 'left', 308, 496, 204),
  building('home-2', 'home', 'Дом 2', 'left', 536, 704, 204),
  building('office-north', 'office', 'Офис «Север»', 'left', 744, 952, 193),
  building('office-bc', 'office', 'Бизнес-центр', 'right', 100, 348, 58),
  building('shop', 'shop', 'Продукты', 'right', 388, 526, 32),
  building('home-3', 'home', 'Дом 3', 'right', 566, 734, 36),
  {
    // Остановка автобуса у сквера: сюда пересаживаются с метро
    id: 'bus',
    kind: 'bus',
    name: 'Остановка',
    territoryId: KLENOVAYA,
    side: 'center',
    rect: { x: 466, y: 976, w: 108, h: 64 },
    door: { x: 520, y: 1026 },
    front: { x: SIDEWALK.rightX, y: 1016 },
    indoor: true,
  },
  {
    id: 'park',
    kind: 'park',
    name: 'Сквер',
    territoryId: SADOVAYA_ID,
    side: 'center',
    rect: SQUARE,
    door: { x: SQUARE.x + 24, y: 900 },
    front: { x: SIDEWALK.rightX, y: 900 },
    // Сквер выходит на обе улицы
    entrances: [
      { door: { x: SQUARE.x + 24, y: 900 }, front: { x: SIDEWALK.rightX, y: 900 } },
      { door: { x: 680, y: 1030 }, front: { x: 680, y: SAD_SIDEWALK.northY } },
    ],
    indoor: false,
  },
  // Садовая, северная сторона
  sadovaya('home-4', 'home', 'Дом 4', 900, 240, 168, 117, true),
  sadovaya('home-5', 'home', 'Дом 5', 1180, 240, 168, 120, true),
  // Садовая, южная сторона: школа, второй выход метро, помещение, дома
  sadovaya('school', 'school', 'Школа', 20, 240, 208, 120, false),
  { ...sadovaya('metro-2', 'metro', 'Метро «Кленовая», выход на Садовую', 280, 160, 80, 80, false), decor: true },
  { ...sadovaya('premises-2', 'vacant', 'Помещение на Садовой', 460, 240, 188, 198, false), decor: true },
  sadovaya('home-6', 'home', 'Дом 6', 740, 240, 168, 205, false),
  sadovaya('home-7', 'home', 'Дом 7', 1020, 240, 168, 205, false),
];

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function place(id: string): Place {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Неизвестное место: ${id}`);
  return p;
}

export function entrancesOf(p: Place): Entrance[] {
  return p.entrances ?? [{ door: p.door, front: p.front }];
}

/** Вход, ближайший к точке, — для метро и сквера с несколькими входами (по прямым «кварталам», быстро) */
export function nearestFront(p: Place, from: Point): Point {
  const list = entrancesOf(p);
  let best = list[0].front;
  let bestLen = Infinity;
  for (const e of list) {
    const len = Math.abs(e.front.x - from.x) + Math.abs(e.front.y - from.y);
    if (len < bestLen) {
      bestLen = len;
      best = e.front;
    }
  }
  return best;
}

// ——— Сеть тротуаров и переходов ———

/** Отрезок, по которому ходят жители. cross — переход через дорогу (ped — со светофором) */
export interface Walkway {
  a: Point;
  b: Point;
  cross?: 'zebra' | 'ped-k' | 'ped-w' | 'ped-e';
}

const KL = SIDEWALK.leftX;
const KR = SIDEWALK.rightX;
const SN = SAD_SIDEWALK.northY;
const SS = SAD_SIDEWALK.southY;
const MID = CROSSWALK_Y + GRID.size / 2;
const EDGE_W = 20;
const EDGE_E = WORLD.width - 20;

export const WALKWAYS: Walkway[] = [
  // Кленовая: левый и правый тротуары, сверху — у киоска и под метро
  { a: { x: KL, y: 90 }, b: { x: KL, y: SIDEWALK.minY } },
  { a: { x: KL, y: SIDEWALK.minY }, b: { x: KL, y: MID } },
  { a: { x: KL, y: MID }, b: { x: KL, y: SN } },
  { a: { x: KR, y: SIDEWALK.minY }, b: { x: KR, y: MID } },
  { a: { x: KR, y: MID }, b: { x: KR, y: SN } },
  // Проход под метро и зебра посередине улицы
  { a: { x: KL, y: SIDEWALK.minY }, b: { x: ROAD_CENTER_X, y: SIDEWALK.minY } },
  { a: { x: ROAD_CENTER_X, y: SIDEWALK.minY }, b: { x: KR, y: SIDEWALK.minY } },
  { a: { x: KL, y: MID }, b: { x: KR, y: MID }, cross: 'zebra' },
  // Садовая: северный тротуар, переход через Кленовую у перекрёстка
  { a: { x: EDGE_W, y: SN }, b: { x: KL, y: SN } },
  { a: { x: KL, y: SN }, b: { x: KR, y: SN }, cross: 'ped-k' },
  { a: { x: KR, y: SN }, b: { x: EDGE_E, y: SN } },
  // Переходы через Садовую по обе стороны перекрёстка
  { a: { x: KL, y: SN }, b: { x: KL, y: SS }, cross: 'ped-w' },
  { a: { x: KR, y: SN }, b: { x: KR, y: SS }, cross: 'ped-e' },
  // Южный тротуар
  { a: { x: EDGE_W, y: SS }, b: { x: KL, y: SS } },
  { a: { x: KL, y: SS }, b: { x: ROAD_CENTER_X, y: SS } },
  { a: { x: ROAD_CENTER_X, y: SS }, b: { x: KR, y: SS } },
  { a: { x: KR, y: SS }, b: { x: EDGE_E, y: SS } },
];

const near = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function project(p: Point, w: Walkway): Point {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / (dx * dx + dy * dy)));
  return { x: w.a.x + dx * t, y: w.a.y + dy * t };
}

/** Ближайшая точка на тротуаре: переходы не годятся, на дороге не стоят */
export function snapToWalkway(p: Point): Point {
  let best = p;
  let bestD = Infinity;
  for (const w of WALKWAYS) {
    if (w.cross) continue;
    const q = project(p, w);
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Кратчайший путь по тротуарам и переходам между двумя точками сети (обе — на отрезках) */
export function walkPath(from: Point, to: Point): Point[] {
  // Узлы: концы отрезков плюс начало и конец, разрезающие свои отрезки
  const nodes: Point[] = [];
  const idx = (p: Point): number => {
    const i = nodes.findIndex((n) => near(n, p));
    if (i >= 0) return i;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  const edges: [number, number][] = [];
  const s = idx(from);
  const t = idx(to);
  for (const w of WALKWAYS) {
    const pts = [w.a, w.b];
    for (const p of [from, to]) {
      if (!near(p, w.a) && !near(p, w.b) && dist(project(p, w), p) < 0.5) pts.splice(1, 0, p);
    }
    // Если на отрезке оба — упорядочить от a к b
    if (pts.length === 4) {
      const [m1, m2] = [pts[1], pts[2]];
      if (dist(w.a, m1) > dist(w.a, m2)) [pts[1], pts[2]] = [m2, m1];
    }
    for (let i = 0; i + 1 < pts.length; i++) edges.push([idx(pts[i]), idx(pts[i + 1])]);
  }
  // Дейкстра на нескольких десятках узлов
  const n = nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || u === t) break;
    done[u] = true;
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || done[v]) continue;
      const d = best[u] + dist(nodes[u], nodes[v]);
      if (d < best[v]) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  if (best[t] === Infinity) return [to];
  const path: Point[] = [];
  for (let v = t; v >= 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}

export function walkLength(from: Point, to: Point): number {
  const path = walkPath(from, to);
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

/** Смещение жителя по ширине тротуара: на продольных тротуарах — вбок, на поперечных — вверх-вниз */
export function withLane(p: Point, lane: number): Point {
  const vertical = p.x === KL || p.x === KR;
  const horizontal = p.y === SIDEWALK.minY || p.y === MID || p.y === SN || p.y === SS;
  return { x: p.x + (vertical ? lane : 0), y: p.y + (horizontal ? lane : 0) };
}
