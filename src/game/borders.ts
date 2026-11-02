// Границы района (GDD 14.4): район — законченный кусок города, а не обрезок.
// Слева и справа — железная дорога на насыпи (Садовая уходит под путепроводы), сверху — лес
// (Кленовая уходит под деревья), снизу — набережная и река (через неё — те же пути на мосту).
// За насыпями на широком экране — крыши соседних кварталов в дымке.
// Всё это лежит за пределами мира симуляции: жители туда не ходят, это только картинка.
import Phaser from 'phaser';
import { ROAD, SADOVAYA, WORLD } from '../sim/world';
import { ART_SCALE, textureOf } from './atlas';

/** Ширина полос вокруг мира, в единицах мира */
export const BORDER = { side: 220, top: 240, bottom: 260 } as const;

/** Насыпь: полоса tex-rail шириной RAIL_W, её середина — RAIL_X от края мира наружу */
const RAIL_W = 200;
const RAIL_X = 110;
/** Оси двух путей относительно середины насыпи (по текстуре) */
const TRACKS = [-16, 15];
/** Слева и справа — середины насыпей */
const RAIL_CENTERS = [-RAIL_X, WORLD.width + RAIL_X];
/** Соседние кварталы за насыпями: ширина полосы и цвет дымки */
const CITY_W = 640;
/** На каком расстоянии от насыпи кварталы полностью уходят в дымку */
const CITY_FADE = 300;
const MIST = 0xc3ccd0;
/** Настил путепровода шире насыпи: так мост читается мостом */
const DECK = { scaleX: 1.3, h: 131 };

/** Глубина путепровода: выше машин и трамвая на Садовой */
const DECK_DEPTH = SADOVAYA.bottom + 30;
/** Поезд выше путепровода, но в лесу — за деревьями (y < 0) */
const TRAIN_DEPTH = DECK_DEPTH + 1;
/** Река: где начинается вода и полосы судов (по текстуре набережной) */
const WATER_TOP = WORLD.height + 120;
const BOAT_LANES = { right: WORLD.height + 168, left: WORLD.height + 218 };
/** Видимая часть реки — между железнодорожными мостами */
const RIVER = { left: -RAIL_X, right: WORLD.width + RAIL_X };
/** Суда проходят под мостами: ниже настила */
const BOAT_DEPTH = -990;

/** Поезда: электричка — 4 вагона, товарный — тепловоз и 6 вагонов; скорость — мира/с при ×1 */
const TRAINS = {
  electric: { speed: 230, cars: ['prop-train-head', 'prop-train-car', 'prop-train-car', 'prop-train-head'] },
  freight: { speed: 160, cars: ['prop-freight-loco'] },
} as const;
const FREIGHT_WAGONS = 6;
/** Поезд днём раз в 50 игровых минут; каждый третий — товарный, ночью ходят только товарные */
const TRAIN_EVERY = 50;
/** Суда: раз в 40 игровых минут с 7 до 22 */
const BOAT_EVERY = 40;
const BOATS = { tram: { frame: 'prop-boat-tram', speed: 55 }, motor: { frame: 'prop-boat-motor', speed: 120 } } as const;

/** Псевдослучайное число по номеру: лес каждый раз растёт одинаково */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Car {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  len: number;
}
interface Train {
  cars: Car[];
  x: number;
  /** Передний край головы; поезд едет вниз (dir 1) или вверх (dir −1) */
  y: number;
  dir: 1 | -1;
  speed: number;
}
interface Boat {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
}

export class Borders {
  private trains: Train[] = [];
  private boats: Boat[] = [];
  private lastTrainMinute = -999;
  private lastBoatMinute = -999;
  private trainCount = 0;
  private boatCount = 0;
  private wakes: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    this.drawHaze();
    this.drawRails();
    this.drawRiver();
    this.drawForest();
    this.drawRoadEnds();
    this.drawBridges();
    this.wakes = scene.add.graphics().setDepth(BOAT_DEPTH - 1);
  }

  private tile(x: number, y: number, w: number, h: number, key: string, depth: number): Phaser.GameObjects.TileSprite {
    return this.scene.add
      .tileSprite(x, y, w * ART_SCALE, h * ART_SCALE, key)
      .setOrigin(0)
      .setScale(1 / ART_SCALE)
      .setDepth(depth);
  }

  /** Соседние кварталы в дымке за насыпями и река дальше вниз — на широком экране не видно пустоты */
  private drawHaze(): void {
    const W = CITY_W;
    const far = 2400;
    const top = -BORDER.top - far;
    const left = -BORDER.side - W;
    const right = WORLD.width + BORDER.side;
    // Самое дальнее — сплошная дымка; ближе — кварталы до реки, река — во всю ширину
    const g = this.scene.add.graphics().setDepth(-1004);
    g.fillStyle(MIST, 1);
    g.fillRect(left - far, top, WORLD.width + 2 * (BORDER.side + W + far), WORLD.height + BORDER.top + 2 * far);
    g.fillStyle(0x426c71, 1);
    g.fillRect(left - far, WORLD.height + BORDER.bottom, WORLD.width + 2 * (BORDER.side + W + far), far);
    const cityH = WORLD.height + BORDER.top + far;
    this.tile(left, top, W, cityH, 'tex-haze', -1003);
    this.tile(right, top, W, cityH, 'tex-haze', -1003).setFlipX(true);
    this.tile(left, WORLD.height, W, BORDER.bottom, 'tex-river', -1003);
    this.tile(right, WORLD.height, W, BORDER.bottom, 'tex-river', -1003);
    // Лес продолжается вверх за краем
    this.tile(-BORDER.side, top, WORLD.width + 2 * BORDER.side, far, 'tex-forest', -1003);
    // Садовая уходит в соседние кварталы
    const road = this.scene.add.graphics().setDepth(-1002.5);
    for (const x of [left, right]) {
      road.fillStyle(0xc9bdad, 1);
      road.fillRect(x, SADOVAYA.top - 14, W, SADOVAYA.bottom - SADOVAYA.top + 28);
      road.fillStyle(0x6f6f71, 1);
      road.fillRect(x, SADOVAYA.top, W, SADOVAYA.bottom - SADOVAYA.top);
      road.fillStyle(0xf6f0e2, 0.85);
      for (let k = 0; k < W; k += 40) road.fillRect(x + k + 6, (SADOVAYA.top + SADOVAYA.bottom) / 2 - 1.5, 20, 3);
    }
    // Воздушная перспектива: чем дальше от насыпи, тем гуще дымка; у самой насыпи — почти чисто
    const mist = this.scene.add.graphics().setDepth(-1002);
    const step = 16;
    // Кварталы видны узкой полосой у насыпи и быстро тонут в дымке: глаз остаётся на районе
    for (let d = 0; d < W; d += step) {
      const a = Math.min(1, 0.35 + 0.65 * Math.pow(d / CITY_FADE, 1.2));
      mist.fillStyle(MIST, a);
      mist.fillRect(-BORDER.side - d - step, top, step, cityH + BORDER.bottom + far);
      mist.fillRect(right + d, top, step, cityH + BORDER.bottom + far);
    }
    // Лёгкий холодный тон на ближних кварталах: они дальше района
    mist.fillStyle(0x9fb0b8, 0.12);
    mist.fillRect(left, top, W, cityH);
    mist.fillRect(right, top, W, cityH);
  }

  /** Насыпи слева и справа: от леса до реки */
  private drawRails(): void {
    const top = -BORDER.top;
    const h = WORLD.height - top;
    for (const cx of RAIL_CENTERS) this.tile(cx - RAIL_W / 2, top, RAIL_W, h, 'tex-rail', -999);
    // Узкие полосы между насыпью и краем полосы — тот же склон
    const g = this.scene.add.graphics().setDepth(-998);
    g.fillStyle(0x5f7a35, 1);
    g.fillRect(-BORDER.side, top, BORDER.side - RAIL_X - RAIL_W / 2, h);
    g.fillRect(WORLD.width + RAIL_X + RAIL_W / 2, top, BORDER.side - RAIL_X - RAIL_W / 2, h);
  }

  /** Набережная и река во всю ширину; пути переходят реку по мосту; на набережной — фонари и лавки */
  private drawRiver(): void {
    this.tile(-BORDER.side, WORLD.height, WORLD.width + 2 * BORDER.side, BORDER.bottom, 'tex-river', -997);
    for (const cx of RAIL_CENTERS) {
      for (let y = WORLD.height - 12; y < WORLD.height + BORDER.bottom; y += DECK.h - 2) this.deck(cx, y);
      const shade = this.scene.add.graphics().setDepth(-996);
      shade.fillStyle(0x0b2a33, 0.35);
      shade.fillRect(cx + 68, WATER_TOP, 20, BORDER.bottom);
    }
    // Набережная: фонари через один пролёт и лавки между ними
    for (let x = 60, k = 0; x < WORLD.width - 40; x += 160, k++) {
      this.prop('prop-lamp', x, WORLD.height + 30);
      if (k % 2 === 0) this.prop('prop-bench', x + 80, WORLD.height + 28);
    }
  }

  private prop(frame: string, x: number, base: number): Phaser.GameObjects.Image {
    return this.scene.add.image(x, base, textureOf(frame), frame).setOrigin(0.5, 1).setScale(1 / ART_SCALE).setDepth(base);
  }

  /** Полоса леса над районом: неровные ряды, поляны, кусты на опушке; на дороге и путях деревьев нет */
  private drawForest(): void {
    const top = -BORDER.top;
    // Подстилка леса — под насыпями: пути уходят в лес, а не обрываются
    this.tile(-BORDER.side, top, WORLD.width + 2 * BORDER.side, BORDER.top + 4, 'tex-forest', -999.5);
    const g = this.scene.add.graphics().setDepth(-998.5);
    // Тень от кромки леса на траву района
    g.fillStyle(0x2c3d1e, 0.22);
    g.fillRect(-BORDER.side, -4, WORLD.width + 2 * BORDER.side, 16);
    const clear = (x: number) =>
      (x > ROAD.left - 18 && x < ROAD.right + 18) || RAIL_CENTERS.some((c) => Math.abs(x - c) < 46);
    // Поляны: в этих местах деревья редеют
    const glades = [140, 610, 1010, 1330];
    let i = 0;
    for (let row = 0; row < 7; row++) {
      const y = top + 34 + row * 36;
      for (let x = -BORDER.side + 10 + (row % 2) * 26 + rand(row) * 20; x < WORLD.width + BORDER.side; x += 44 + rand(row * 31 + x) * 22) {
        i++;
        const jx = x + (rand(i) - 0.5) * 30;
        if (clear(jx)) continue;
        const inGlade = glades.some((gx) => Math.abs(jx - gx) < 55) && row >= 2 && row <= 5;
        if (inGlade && rand(i + 17) < 0.8) continue;
        if (rand(i + 19) < 0.08) continue;
        // Ели гуще в глубине леса, у кромки — сосны, лиственные и берёзы
        const deep = row < 4;
        const pick = deep ? 1 + Math.floor(rand(i + 7) * 5) : 4 + Math.floor(rand(i + 7) * 5);
        const frame = `prop-forest-${Math.min(8, pick)}`;
        const base = Math.min(y + (rand(i + 3) - 0.5) * 24, -6);
        this.scene.add
          .image(jx, base, textureOf(frame), frame)
          .setOrigin(0.5, 1)
          .setScale((0.8 + rand(i + 11) * 0.4) / ART_SCALE)
          .setFlipX(rand(i + 5) > 0.5)
          .setDepth(base);
      }
    }
    // Опушка: кусты вдоль кромки, неровной полосой
    for (let x = -BORDER.side + 20, k = 0; x < WORLD.width + BORDER.side; x += 34 + rand(k + 400) * 30, k++) {
      if (clear(x) || rand(k + 500) < 0.35) continue;
      const frame = rand(k + 600) < 0.5 ? 'prop-bush' : 'prop-bushes';
      this.prop(frame, x, -2 - rand(k + 700) * 8).setFlipX(rand(k + 800) > 0.5);
    }
  }

  /** Садовая за краем мира до путепровода и Кленовая в лесу */
  private drawRoadEnds(): void {
    const g = this.scene.add.graphics().setDepth(-996);
    g.fillStyle(0x6f6f71, 1);
    g.fillRect(-BORDER.side, SADOVAYA.top, BORDER.side, SADOVAYA.bottom - SADOVAYA.top);
    g.fillRect(WORLD.width, SADOVAYA.top, BORDER.side, SADOVAYA.bottom - SADOVAYA.top);
    g.fillRect(ROAD.left, -BORDER.top, ROAD.right - ROAD.left, BORDER.top);
    // Осевая
    g.fillStyle(0xf6f0e2, 0.85);
    const mid = SADOVAYA.top + (SADOVAYA.bottom - SADOVAYA.top) / 2;
    for (let x = -BORDER.side; x < 0; x += 40) g.fillRect(x + 6, mid - 1.5, 20, 3);
    for (let x = WORLD.width; x < WORLD.width + BORDER.side; x += 40) g.fillRect(x + 6, mid - 1.5, 20, 3);
    for (let y = -BORDER.top; y < 0; y += 40) g.fillRect((ROAD.left + ROAD.right) / 2 - 1.5, y + 6, 3, 20);
    // Лес над дорогой: тень кроны темнит асфальт к краю
    for (let k = 0; k < 8; k++) {
      g.fillStyle(0x1f2a16, 0.08);
      g.fillRect(ROAD.left, -BORDER.top, ROAD.right - ROAD.left, BORDER.top - k * 26);
    }
  }

  /** Путепроводы над Садовой: настил, тень под ним и бетонные опоры по краям дороги */
  private drawBridges(): void {
    const mid = (SADOVAYA.top + SADOVAYA.bottom) / 2;
    const half = (104 * DECK.scaleX) / 2;
    for (const cx of RAIL_CENTERS) {
      const g = this.scene.add.graphics().setDepth(-995);
      g.fillStyle(0x15140f, 0.34);
      g.fillRect(cx - half - 12, SADOVAYA.top, 2 * half + 24, SADOVAYA.bottom - SADOVAYA.top);
      // Опоры: бетонные стенки вдоль обочин, видны над и под настилом
      for (const y of [SADOVAYA.top - 14, SADOVAYA.bottom - 2]) {
        g.fillStyle(0x9a958c, 1);
        g.fillRect(cx - half + 6, y, 2 * half - 12, 16);
        g.fillStyle(0x6c675f, 1);
        g.fillRect(cx - half + 6, y + 12, 2 * half - 12, 4);
      }
      this.deck(cx, mid + DECK.h / 2 + 4);
    }
  }

  private deck(cx: number, bottom: number): Phaser.GameObjects.Image {
    return this.scene.add
      .image(cx, bottom, textureOf('prop-rail-deck'), 'prop-rail-deck')
      .setOrigin(0.5, 1)
      .setScale(DECK.scaleX / ART_SCALE, 1 / ART_SCALE)
      .setDepth(DECK_DEPTH);
  }

  /** dt — секунды с учётом скорости игры; на паузе всё стоит */
  update(dt: number, minute: number): void {
    const h = (minute / 60) % 24;
    const day = h >= 5.5;
    const sinceTrain = (minute - this.lastTrainMinute + 14400) % 1440;
    if (sinceTrain >= TRAIN_EVERY && this.trains.length < 2) {
      this.lastTrainMinute = minute;
      this.trainCount++;
      const freight = !day || this.trainCount % 3 === 0;
      if (day || this.trainCount % 2 === 0) this.spawnTrain(freight ? 'freight' : 'electric');
    }
    const sinceBoat = (minute - this.lastBoatMinute + 14400) % 1440;
    if (h >= 7 && h < 22 && sinceBoat >= BOAT_EVERY && this.boats.length < 2) {
      this.lastBoatMinute = minute;
      this.boatCount++;
      this.spawnBoat(this.boatCount % 3 === 0 ? 'motor' : 'tram', this.boatCount % 2 === 0 ? 1 : -1);
    }
    if (dt <= 0) return;
    this.trains = this.trains.filter((t) => this.moveTrain(t, dt));
    this.wakes.clear();
    this.boats = this.boats.filter((b) => this.moveBoat(b, dt));
  }

  private spawnTrain(kind: keyof typeof TRAINS): void {
    // Пути: на каждой насыпи вниз — левый путь, вверх — правый; насыпь — та, где сейчас нет поезда
    const busy = new Set(this.trains.map((t) => t.x));
    const side = this.trainCount % 2;
    const dir: 1 | -1 = Math.floor(this.trainCount / 2) % 2 === 0 ? 1 : -1;
    const x = RAIL_CENTERS[side] + TRACKS[dir === 1 ? 0 : 1];
    if (busy.has(x)) return;
    const frames: string[] = [...TRAINS[kind].cars];
    if (kind === 'freight') for (let k = 0; k < FREIGHT_WAGONS; k++) frames.push(rand(this.trainCount * 7 + k) < 0.5 ? 'prop-freight-tank' : 'prop-freight-box');
    const cars = frames.map((frame, k) => {
      // Кабина нарисована сверху: у головы, едущей вниз, и у хвостовой кабины, едущей вверх, кадр переворачиваем
      const cab = frame === 'prop-train-head' || frame === 'prop-freight-loco';
      const front = k === 0;
      const flip = cab && ((front && dir === 1) || (!front && dir === -1));
      const img = this.scene.add.image(x, 0, textureOf(frame), frame).setScale(1 / ART_SCALE).setFlipY(flip);
      const shadow = this.scene.add
        .image(x, 0, textureOf(frame), frame)
        .setScale(1 / ART_SCALE)
        .setFlipY(flip)
        .setTint(0x101808)
        .setTintMode(Phaser.TintModes.FILL)
        .setAlpha(0.22);
      return { img, shadow, len: img.displayHeight };
    });
    const y = dir === 1 ? -BORDER.top - 40 : WORLD.height + BORDER.bottom + 40;
    this.trains.push({ cars, x, y, dir, speed: TRAINS[kind].speed });
  }

  /** false — поезд ушёл за край, его больше нет */
  private moveTrain(t: Train, dt: number): boolean {
    t.y += t.dir * t.speed * dt;
    let edge = t.y;
    let alive = false;
    for (const c of t.cars) {
      // Голова впереди по ходу, вагоны — за ней через сцепку 4
      const center = edge - (t.dir * c.len) / 2;
      edge -= t.dir * (c.len + 4);
      c.img.setPosition(t.x, center);
      c.shadow.setPosition(t.x + 5, center + 6);
      // В лесу поезд прячется за деревья, на насыпи и мостах — поверх настила
      const top = center - c.len / 2;
      const depth = top < -20 ? top : TRAIN_DEPTH;
      c.img.setDepth(depth);
      c.shadow.setDepth(depth - 0.01);
      const inside = center + c.len / 2 > -BORDER.top - 60 && center - c.len / 2 < WORLD.height + BORDER.bottom + 60;
      const ahead = t.dir === 1 ? center < -BORDER.top : center > WORLD.height + BORDER.bottom;
      if (inside || ahead) alive = true;
    }
    if (!alive) for (const c of t.cars) (c.img.destroy(), c.shadow.destroy());
    return alive;
  }

  private spawnBoat(kind: keyof typeof BOATS, dir: 1 | -1): void {
    const { frame, speed } = BOATS[kind];
    const y = dir === 1 ? BOAT_LANES.right : BOAT_LANES.left;
    const img = this.scene.add.image(0, y, textureOf(frame), frame).setScale(1 / ART_SCALE).setFlipX(dir === -1).setDepth(BOAT_DEPTH);
    const shadow = this.scene.add
      .image(0, y, textureOf(frame), frame)
      .setScale(1 / ART_SCALE)
      .setFlipX(dir === -1)
      .setTint(0x0b2a33)
        .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.25)
      .setDepth(BOAT_DEPTH - 0.5);
    // Судно выходит из-под одного железнодорожного моста и уходит под другой
    const x = dir === 1 ? RIVER.left - img.displayWidth / 2 : RIVER.right + img.displayWidth / 2;
    this.boats.push({ img, shadow, x, y, dir, speed });
  }

  private moveBoat(b: Boat, dt: number): boolean {
    b.x += b.dir * b.speed * dt;
    b.img.setPosition(b.x, b.y);
    b.shadow.setPosition(b.x + 4, b.y + 6);
    clipX(b.img, RIVER.left, RIVER.right);
    clipX(b.shadow, RIVER.left, RIVER.right);
    // Белый след за кормой: несколько вытянутых бликов
    const w = b.img.displayWidth;
    const stern = b.x - (b.dir * w) / 2;
    for (let k = 0; k < 4 && stern > RIVER.left && stern < RIVER.right; k++) {
      this.wakes.fillStyle(0xe8f4f2, 0.28 - k * 0.06);
      const len = 26 + k * 14;
      this.wakes.fillEllipse(stern - b.dir * (len / 2 + k * 10), b.y + (k % 2 ? 4 : -4), len, 5 - k * 0.8);
    }
    const out = b.dir === 1 ? b.x - w / 2 > RIVER.right : b.x + w / 2 < RIVER.left;
    if (out) {
      b.img.destroy();
      b.shadow.destroy();
    }
    return !out;
  }
}

/** Обрезать картинку по вертикальным линиям left…right (картинка не повёрнута) */
function clipX(img: Phaser.GameObjects.Image, left: number, right: number): void {
  const half = img.displayWidth / 2;
  const l = img.x - half;
  const rr = img.x + half;
  if (l >= left && rr <= right) {
    if (img.isCropped) img.setCrop();
    img.setVisible(true);
    return;
  }
  if (rr <= left || l >= right) {
    img.setVisible(false);
    return;
  }
  img.setVisible(true);
  const k = img.frame.width / img.displayWidth;
  // У отражённой по x картинки кадр перевёрнут: левый край на экране — правый в кадре
  const cutL = Math.max(0, left - l) * k;
  const cutR = Math.max(0, rr - right) * k;
  const [a, b] = img.flipX ? [cutR, cutL] : [cutL, cutR];
  img.setCrop(a, 0, Math.max(1, img.frame.width - a - b), img.frame.height);
}
