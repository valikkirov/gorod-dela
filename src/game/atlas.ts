// Атласы графики. Исходник — Figma-файл «Город дела — графика», страница «Экспорт для игры».
// Координаты кадров — в единицах 1× (как в Figma), PNG выгружены в 2×.
// Как обновить арт: см. scripts/README.md.
import buildingsUrl from './art/buildings.png';
import groundUrl from './art/ground.png';
import lightsUrl from './art/lights.png';
import peopleUrl from './art/people.png';
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
];
export type Facing = 'down' | 'up' | 'right';
const FACINGS: Facing[] = ['down', 'up', 'right'];

type Frames = Record<string, [x: number, y: number, w: number, h: number]>;

export const ATLASES: Record<string, { url: string; frames: Frames }> = {
  ground: {
    url: groundUrl,
    frames: {
      'tile-road-asphalt': [4, 4, 40, 40],
      'tile-road-marking': [48, 4, 40, 40],
      'tile-road-crosswalk': [92, 4, 40, 40],
      'tile-sidewalk': [136, 4, 40, 40],
      'tile-sidewalk-curb-left': [180, 4, 40, 40],
      'tile-sidewalk-curb-right': [224, 4, 40, 40],
      'tile-grass': [268, 4, 40, 40],
      'prop-tree-round': [312, 4, 80, 100],
      'prop-tree-tall': [396, 4, 80, 100],
      'prop-bench': [4, 108, 60, 30],
      'prop-lamp': [68, 108, 20, 70],
      'prop-bin': [92, 108, 20, 28],
      'prop-menu-board': [116, 108, 30, 40],
    },
  },
  buildings: {
    url: buildingsUrl,
    frames: {
      'building-cafe-open': [4, 4, 240, 200],
      'building-cafe-rent': [248, 4, 240, 200],
      'building-home-a-left': [492, 4, 240, 180],
      'building-home-b-left': [736, 4, 240, 180],
      'building-home-b-right': [4, 208, 240, 180],
      'building-home-a-right': [248, 208, 240, 180],
      'building-office-left': [492, 208, 240, 220],
      'building-bc-right': [736, 208, 240, 260],
      'building-shop-right': [4, 472, 240, 150],
      'building-metro': [248, 472, 160, 90],
    },
  },
  lights: {
    url: lightsUrl,
    frames: {
      'building-cafe-lights': [4, 4, 240, 200],
      'building-home-a-left-lights': [248, 4, 240, 180],
      'building-home-b-left-lights': [492, 4, 240, 180],
      'building-home-b-right-lights': [736, 4, 240, 180],
      'building-home-a-right-lights': [4, 208, 240, 180],
      'building-office-left-lights': [248, 208, 240, 220],
      'building-bc-right-lights': [492, 208, 240, 260],
      'building-shop-right-lights': [736, 208, 240, 150],
      'building-metro-lights': [4, 472, 160, 90],
    },
  },
  people: { url: peopleUrl, frames: peopleFrames() },
};

/** Кадр жителя 28×44, стопы на линии y = 42 */
export const RESIDENT_SIZE = { w: 28, h: 44, feet: 42 } as const;

export function personFrame(kind: ResidentKind, facing: Facing, phase: number): string {
  return `${kind}-${facing}-${phase}`;
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
