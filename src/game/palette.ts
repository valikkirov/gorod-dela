import type { PlaceKind } from '../sim/world';
import type { ResidentKind } from '../sim/residents';

// Палитра прототипа. Арт заменит её позже — пока цвет несёт смысл.
export const COLORS = {
  ground: 0xe9e4d8,
  road: 0x5b6270,
  roadMark: 0xe8e3d3,
  sidewalk: 0xd3ccbc,
  outline: 0x3d4250,
  label: '#2b2f3a',
  selection: 0xffffff,
  path: 0x2b2f3a,
} as const;

export const PLACE_FILL: Record<PlaceKind, number> = {
  home: 0xf2d2b3,
  office: 0xb4cbe2,
  shop: 0xf3db7a,
  cafe: 0xf0a585,
  metro: 0xd85a5a,
  park: 0xbcd99c,
  bus: 0x9aa4ae,
  school: 0xe6c98f,
  vacant: 0xd9cfc0,
};

export const RESIDENT_COLOR: Record<ResidentKind, number> = {
  office: 0x2f6fb0,
  student: 0x8e44ad,
  pensioner: 0x6b7480,
  shopkeeper: 0xe67e22,
  remote: 0x16a085,
  youth: 0xd6336c,
  nightworker: 0x34495e,
  passenger: 0x5d8a3a,
  visitor: 0xc0882b,
};

export const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
