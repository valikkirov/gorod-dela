// Карта одной улицы. Координаты в «пикселях мира» (портретный экран 720×1280).
// Иерархия территорий из GDD (улица → район → город) заложена полем territoryId.

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

export type PlaceKind = 'home' | 'office' | 'shop' | 'cafe' | 'metro' | 'park';
export type Side = 'left' | 'right' | 'center';

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  territoryId: string;
  side: Side;
  /** Видимая часть здания: от верха крыши (y) до основания фасада (y + h) */
  rect: Rect;
  /** Точка входа на фасаде: житель «исчезает» внутри здания, дойдя до неё */
  door: Point;
  /** Точка на тротуаре напротив двери: отсюда считается крюк и здесь замечают витрину */
  front: Point;
  /** Жители внутри не видны (здание), в сквере — видны */
  indoor: boolean;
}

export const WORLD = { width: 720, height: 1280 } as const;

/**
 * Сетка 40 × 40, сдвинутая на 20 по x: клетки дороги — x 300–420, тротуары — 260–300 и 420–460,
 * здания шириной 6 клеток — 20–260 слева и 460–700 справа.
 * Вид 3/4: у здания видна крыша и фасад, основание (линия, где фасад встаёт на землю) — внизу.
 * Дверь — на фасаде; перед каждым зданием полоса в одну клетку, по ней жители идут от тротуара к двери.
 */
export const GRID = { size: 40, offsetX: 20 } as const;
export const ROAD = { left: 300, right: 420, top: 0, bottom: 1000 } as const;
export const SIDEWALK = { leftX: 280, rightX: 440, width: 40, minY: 112, maxY: 994 } as const;
export const ROAD_CENTER_X = (ROAD.left + ROAD.right) / 2;
/** Сквер: трава ниже поперечного тротуара */
export const PARK_TOP = 1040;

export function sidewalkX(side: 'left' | 'right'): number {
  return side === 'left' ? SIDEWALK.leftX : SIDEWALK.rightX;
}

const TERRITORY = 'street-1';

/** Где житель стоит у двери: чуть ниже основания, на полосе перед фасадом */
const DOOR_OFFSET = 14;

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
    territoryId: TERRITORY,
    side,
    rect: { x, y: top, w: 240, h: base - top },
    door,
    front: { x: sidewalkX(side), y: door.y },
    indoor: true,
  };
}

export const PLACES: Place[] = [
  {
    id: 'metro',
    kind: 'metro',
    name: 'Метро',
    territoryId: TERRITORY,
    side: 'center',
    rect: { x: 280, y: 10, w: 160, h: 78 },
    door: { x: ROAD_CENTER_X, y: 96 },
    front: { x: ROAD_CENTER_X, y: 96 },
    indoor: true,
  },
  building('home-1', 'home', 'Дом 1', 'left', 100, 268, 204),
  building('cafe', 'cafe', 'Твоё кафе', 'left', 308, 496, 204),
  building('home-2', 'home', 'Дом 2', 'left', 536, 704, 204),
  building('office-north', 'office', 'Офис «Север»', 'left', 744, 952, 193),
  building('office-bc', 'office', 'Бизнес-центр', 'right', 100, 348, 58),
  building('shop', 'shop', 'Продукты', 'right', 388, 526, 32),
  building('home-3', 'home', 'Дом 3', 'right', 566, 734, 36),
  building('home-4', 'home', 'Дом 4', 'right', 774, 942, 36),
  {
    id: 'park',
    kind: 'park',
    name: 'Сквер',
    territoryId: TERRITORY,
    side: 'center',
    rect: { x: 20, y: 1060, w: 680, h: 200 },
    door: { x: ROAD_CENTER_X, y: 1050 },
    front: { x: ROAD_CENTER_X, y: 1050 },
    indoor: false,
  },
];

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function place(id: string): Place {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Неизвестное место: ${id}`);
  return p;
}


export const clampSidewalkY = (y: number): number =>
  Math.min(SIDEWALK.maxY, Math.max(SIDEWALK.minY, y));
