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
  rect: Rect;
  /** Точка входа: житель «исчезает» внутри здания, дойдя до неё */
  door: Point;
  /** Жители внутри не видны (здание), в сквере — видны */
  indoor: boolean;
}

export const WORLD = { width: 720, height: 1280 } as const;

export const ROAD = { left: 300, right: 420, top: 0, bottom: 1000 } as const;
export const SIDEWALK = { leftX: 285, rightX: 435, width: 30, minY: 112, maxY: 994 } as const;
export const ROAD_CENTER_X = (ROAD.left + ROAD.right) / 2;

const TERRITORY = 'street-1';

function building(
  id: string,
  kind: PlaceKind,
  name: string,
  side: 'left' | 'right',
  y: number,
  h: number,
): Place {
  const x = side === 'left' ? 20 : 450;
  const w = 250;
  const doorX = side === 'left' ? x + w : x;
  return {
    id,
    kind,
    name,
    territoryId: TERRITORY,
    side,
    rect: { x, y, w, h },
    door: { x: doorX, y: y + h / 2 },
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
    rect: { x: 280, y: 20, w: 160, h: 70 },
    door: { x: ROAD_CENTER_X, y: 80 },
    indoor: true,
  },
  building('home-1', 'home', 'Дом 1', 'left', 130, 200),
  building('cafe', 'cafe', 'Твоё кафе', 'left', 350, 120),
  building('home-2', 'home', 'Дом 2', 'left', 490, 210),
  building('office-north', 'office', 'Офис «Север»', 'left', 720, 260),
  building('office-bc', 'office', 'Бизнес-центр', 'right', 130, 270),
  building('shop', 'shop', 'Продукты', 'right', 420, 110),
  building('home-3', 'home', 'Дом 3', 'right', 550, 210),
  building('home-4', 'home', 'Дом 4', 'right', 780, 200),
  {
    id: 'park',
    kind: 'park',
    name: 'Сквер',
    territoryId: TERRITORY,
    side: 'center',
    rect: { x: 20, y: 1020, w: 680, h: 240 },
    door: { x: ROAD_CENTER_X, y: 1030 },
    indoor: false,
  },
];

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function place(id: string): Place {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`Неизвестное место: ${id}`);
  return p;
}

export function sidewalkX(side: 'left' | 'right'): number {
  return side === 'left' ? SIDEWALK.leftX : SIDEWALK.rightX;
}

export const clampSidewalkY = (y: number): number =>
  Math.min(SIDEWALK.maxY, Math.max(SIDEWALK.minY, y));
