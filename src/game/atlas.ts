// Атласы графики («Графика 2.0»). Здания, свет, предметы и текстуры собирает scripts/pack_v2.py
// из art-src/v2 (кадры — в atlasFrames.ts); жители и extra — в старой раскладке кадров.
// Координаты кадров — в единицах 1×, PNG — в 2×. Как обновить арт: см. scripts/README.md.
import { BUILDING_FRAMES, LIGHT_FRAMES, PROP_FRAMES, TEXTURE_FRAMES } from './atlasFrames';
import buildingsUrl from './art/buildings.png';
import extraUrl from './art/extra.png';
import groundUrl from './art/ground.png';
import lightsUrl from './art/lights.png';
import peopleUrl from './art/people.png';
import texAsphaltUrl from './art/tex-asphalt.png';
import texGrassUrl from './art/tex-grass.png';
import texSidewalkUrl from './art/tex-sidewalk.png';
import type { ResidentKind } from '../sim/residents';

/** Во сколько раз PNG крупнее единиц мира */
export const ART_SCALE = 2;

export const PEOPLE_ORDER: ResidentKind[] = [
  'office',
  'student',
  'pensioner',
  'shopkeeper',
  'remote',
  'youth',
  'nightworker',
  'passenger',
  'visitor',
];
export type Facing = 'down' | 'up' | 'right';
const FACINGS: Facing[] = ['down', 'up', 'right'];

type Frames = Record<string, [x: number, y: number, w: number, h: number]>;

/** Аксессуары жителей: кадр 28×44 как у жителя, накладывается поверх. Ряд внизу атласа extra */
export const ACCESSORIES = ['briefcase', 'backpack', 'cane', 'coffee', 'shopping-bag'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export const ATLASES: Record<string, { url: string; frames: Frames }> = {
  // Второй набор (октябрь): конкуренты, новые дома, транспорт, свет, улучшения, события и аксессуары жителей
  extra: {
    url: extraUrl,
    frames: {
      ...accessoryFrames(),
      'bus-down': [652, 576, 40, 110],
      'bus-up': [696, 576, 40, 110],
      'car-a-down': [232, 740, 32, 56],
      'car-a-up': [268, 740, 32, 56],
      'car-b-down': [304, 740, 32, 56],
      'car-b-up': [340, 740, 32, 56],
      'car-c-down': [376, 740, 32, 56],
      'car-c-up': [412, 740, 32, 56],
      'light-lamp-pool': [4, 740, 120, 80],
      'light-shop-spill': [448, 740, 200, 40],
      'overlay-cafe-interior': [492, 4, 240, 200],
      'overlay-cafe-showcase': [652, 740, 94, 32],
      'prop-cafe-terrace': [794, 740, 180, 24],
      'prop-festival-tent': [128, 740, 100, 80],
      'prop-sign-no-coffee': [750, 740, 40, 30],
      'truck-down': [4, 876, 40, 96],
      'truck-up': [48, 876, 40, 96],
      'van-down': [92, 876, 34, 64],
      'van-up': [130, 876, 34, 64],
      'ambulance-down': [168, 876, 36, 72],
      'ambulance-down-flash': [208, 876, 36, 72],
      'ambulance-up': [248, 876, 36, 72],
      'ambulance-up-flash': [288, 876, 36, 72],
      'police-down': [328, 876, 32, 58],
      'police-down-flash': [364, 876, 32, 58],
      'police-up': [400, 876, 32, 58],
      'police-up-flash': [436, 876, 32, 58],
    },
  },
  ground: { url: groundUrl, frames: PROP_FRAMES },
  buildings: { url: buildingsUrl, frames: BUILDING_FRAMES },
  lights: { url: lightsUrl, frames: LIGHT_FRAMES },
  // Бесшовные текстуры земли: рисуются узором, кадр — вся картинка
  'tex-grass': { url: texGrassUrl, frames: { 'tex-grass': TEXTURE_FRAMES['tex-grass'] } },
  'tex-sidewalk': { url: texSidewalkUrl, frames: { 'tex-sidewalk': TEXTURE_FRAMES['tex-sidewalk'] } },
  'tex-asphalt': { url: texAsphaltUrl, frames: { 'tex-asphalt': TEXTURE_FRAMES['tex-asphalt'] } },
  people: { url: peopleUrl, frames: peopleFrames() },
};

/** Кадр жителя 28×44, стопы на линии y = 42 */
export const RESIDENT_SIZE = { w: 28, h: 44, feet: 42 } as const;

export function personFrame(kind: ResidentKind, facing: Facing, phase: number): string {
  return `${kind}-${facing}-${phase}`;
}


function accessoryFrames(): Frames {
  const frames: Frames = {};
  let i = 0;
  for (const a of ACCESSORIES) for (const f of FACINGS) frames[`acc-${a}-${f}`] = [4 + i++ * 32, 824, 28, 44];
  return frames;
}

/** Лист жителей: ряд — тип, в ряду 15 кадров (вниз, вверх, вправо × стоит + 4 шага), ячейка 32×48 */
function peopleFrames(): Frames {
  const frames: Frames = {};
  PEOPLE_ORDER.forEach((kind, row) => {
    FACINGS.forEach((facing, f) => {
      for (let phase = 0; phase < 5; phase++) {
        frames[personFrame(kind, facing, phase)] = [4 + (f * 5 + phase) * 32, 4 + row * 48, 28, 44];
      }
    });
  });
  return frames;
}

/** В каком атласе лежит кадр — спрайты из разных наборов можно смешивать */
const FRAME_TEXTURE = new Map<string, string>();
for (const [key, atlas] of Object.entries(ATLASES)) for (const name of Object.keys(atlas.frames)) FRAME_TEXTURE.set(name, key);

export function textureOf(frame: string): string {
  const key = FRAME_TEXTURE.get(frame);
  if (!key) throw new Error(`Нет кадра ${frame} в атласах`);
  return key;
}
