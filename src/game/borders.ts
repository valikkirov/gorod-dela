// Границы района (GDD 14.4): район — законченный кусок города, а не обрезок.
// Слева и справа — железная дорога на насыпи (Садовая уходит под путепроводы), сверху — лес
// (Кленовая уходит под деревья), снизу — набережная и река (через неё — те же пути на мосту).
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

/** Электричка: вагоны, длина вагона в мире, скорость (мира/с при ×1), как часто ходит днём */
const TRAIN = { cars: 4, carLen: 183, gap: 4, speed: 230, everyMinutes: 50 };
/** Глубина путепровода: выше машин и трамвая на Садовой */
const DECK_DEPTH = SADOVAYA.bottom + 30;
/** Электричка выше путепровода, но в лесу — за деревьями (y < 0) */
const TRAIN_DEPTH = DECK_DEPTH + 1;

/** Псевдослучайное число по номеру: лес каждый раз растёт одинаково */
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Train {
  cars: Phaser.GameObjects.Image[];
  x: number;
  /** y головы; поезд едет вниз (dir 1) или вверх (dir −1) */
  y: number;
  dir: 1 | -1;
}

export class Borders {
  private train: Train | null = null;
  private lastTrainMinute = -999;
  private trainSide = 0;

  constructor(private scene: Phaser.Scene) {
    this.drawRails();
    this.drawRiver();
    this.drawForest();
    this.drawRoadEnds();
    this.drawBridges();
  }

  /** Насыпи слева и справа: от леса до реки */
  private drawRails(): void {
    const top = -BORDER.top;
    const h = WORLD.height - top;
    for (const cx of RAIL_CENTERS) {
      this.scene.add
        .tileSprite(cx - RAIL_W / 2, top, RAIL_W * ART_SCALE, h * ART_SCALE, 'tex-rail')
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth(-999);
    }
    // Узкие полосы между краем мира и насыпью (если насыпь уже отступа) — тот же склон
    const g = this.scene.add.graphics().setDepth(-998);
    g.fillStyle(0x5f7a35, 1);
    g.fillRect(-BORDER.side, top, BORDER.side - RAIL_X - RAIL_W / 2, h);
    g.fillRect(WORLD.width + RAIL_X + RAIL_W / 2, top, BORDER.side - RAIL_X - RAIL_W / 2, h);
  }

  /** Набережная и река во всю ширину; пути переходят реку по мосту */
  private drawRiver(): void {
    this.scene.add
      .tileSprite(-BORDER.side, WORLD.height, (WORLD.width + 2 * BORDER.side) * ART_SCALE, BORDER.bottom * ART_SCALE, 'tex-river')
      .setOrigin(0)
      .setScale(1 / ART_SCALE)
      .setDepth(-997);
    for (const cx of RAIL_CENTERS) {
      // Настил моста — двумя пролётами до края, тень на воду справа
      const deckH = 131;
      for (let y = WORLD.height - 12; y < WORLD.height + BORDER.bottom; y += deckH - 2) {
        this.deck(cx, y, DECK_DEPTH);
      }
      const shade = this.scene.add.graphics().setDepth(-996);
      shade.fillStyle(0x0b2a33, 0.35);
      shade.fillRect(cx + 52, WORLD.height + 120, 18, BORDER.bottom);
    }
  }

  /** Полоса леса над районом: плотные ряды деревьев, на дороге и путях деревьев нет */
  private drawForest(): void {
    const top = -BORDER.top;
    // Подстилка леса — под насыпями: пути уходят в лес, а не обрываются
    const g = this.scene.add.graphics().setDepth(-999.5);
    g.fillStyle(0x4f6a33, 1);
    g.fillRect(-BORDER.side, top, WORLD.width + 2 * BORDER.side, BORDER.top + 4);
    // Тень от кромки леса на траву района
    g.fillStyle(0x2c3d1e, 0.25);
    g.fillRect(-BORDER.side, -4, WORLD.width + 2 * BORDER.side, 18);
    const clear = (x: number) =>
      (x > ROAD.left - 18 && x < ROAD.right + 18) || RAIL_CENTERS.some((c) => Math.abs(x - c) < 46);
    let i = 0;
    for (let row = 0; row < 7; row++) {
      const y = top + 34 + row * 36;
      for (let x = -BORDER.side + 10 + (row % 2) * 26 + rand(row) * 20; x < WORLD.width + BORDER.side; x += 44 + rand(row * 31 + x) * 22) {
        i++;
        const jx = x + (rand(i) - 0.5) * 30;
        if (clear(jx)) continue;
        // Ели гуще в глубине леса, у кромки — лиственные и берёзы
        const deep = row < 4;
        const pick = deep ? 1 + Math.floor(rand(i + 7) * 5) : 4 + Math.floor(rand(i + 7) * 5);
        const frame = `prop-forest-${Math.min(8, pick)}`;
        const base = Math.min(y + (rand(i + 3) - 0.5) * 24, -6);
        this.scene.add
          .image(jx, base, textureOf(frame), frame)
          .setOrigin(0.5, 1)
          .setScale((0.85 + rand(i + 11) * 0.3) / ART_SCALE)
          .setFlipX(rand(i + 5) > 0.5)
          .setDepth(base);
      }
    }
  }

  /** Садовая за краем мира до путепровода и Кленовая в лесу */
  private drawRoadEnds(): void {
    const g = this.scene.add.graphics().setDepth(-996);
    const asphalt = 0x6f6f71;
    g.fillStyle(asphalt, 1);
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

  /** Путепроводы над Садовой и тень под ними */
  private drawBridges(): void {
    const mid = (SADOVAYA.top + SADOVAYA.bottom) / 2;
    for (const cx of RAIL_CENTERS) {
      const shade = this.scene.add.graphics().setDepth(-995);
      shade.fillStyle(0x15140f, 0.32);
      shade.fillRect(cx - 70, SADOVAYA.top, 140, SADOVAYA.bottom - SADOVAYA.top);
      this.deck(cx, mid + 131 / 2 + 4, DECK_DEPTH);
    }
  }

  private deck(cx: number, bottom: number, depth: number): Phaser.GameObjects.Image {
    return this.scene.add
      .image(cx, bottom, textureOf('prop-rail-deck'), 'prop-rail-deck')
      .setOrigin(0.5, 1)
      .setScale(1 / ART_SCALE)
      .setDepth(depth);
  }

  /** Электричка: днём примерно раз в 50 игровых минут, попеременно слева и справа, вверх и вниз */
  update(dt: number, minute: number): void {
    const h = (minute / 60) % 24;
    const since = (minute - this.lastTrainMinute + 1440 * 10) % 1440;
    if (!this.train && h >= 5.5 && since >= TRAIN.everyMinutes) {
      this.lastTrainMinute = minute;
      this.trainSide++;
      this.spawnTrain(this.trainSide % 2, this.trainSide % 4 < 2 ? 1 : -1);
    }
    const t = this.train;
    if (!t || dt <= 0) return;
    t.y += t.dir * TRAIN.speed * dt;
    const step = TRAIN.carLen + TRAIN.gap;
    t.cars.forEach((car, k) => {
      // Голова впереди по ходу, вагоны — за ней
      const cy = t.y - t.dir * k * step;
      car.setPosition(t.x, cy + TRAIN.carLen / 2);
      // В лесу поезд прячется за деревья, на мосту и насыпи — поверх настила
      car.setDepth(cy < -20 ? cy : TRAIN_DEPTH);
    });
    const tail = t.y - t.dir * (TRAIN.cars - 1) * step;
    const gone = t.dir === 1 ? tail > WORLD.height + BORDER.bottom : tail + TRAIN.carLen < -BORDER.top;
    if (gone) {
      t.cars.forEach((c) => c.destroy());
      this.train = null;
    }
  }

  private spawnTrain(side: number, dir: 1 | -1): void {
    const x = RAIL_CENTERS[side] + TRACKS[dir === 1 ? 0 : 1];
    const start = dir === 1 ? -BORDER.top - TRAIN.carLen * 2 : WORLD.height + BORDER.bottom + TRAIN.carLen;
    const cars: Phaser.GameObjects.Image[] = [];
    for (let k = 0; k < TRAIN.cars; k++) {
      const head = k === 0 || k === TRAIN.cars - 1;
      const frame = head ? 'prop-train-head' : 'prop-train-car';
      // Кабина нарисована сверху: у головы, едущей вниз, и у хвоста, едущего вверх, кадр переворачиваем
      const flip = (k === 0 && dir === 1) || (k === TRAIN.cars - 1 && dir === -1);
      cars.push(
        this.scene.add
          .image(x, start, textureOf(frame), frame)
          .setOrigin(0.5, 0.5)
          .setScale(1 / ART_SCALE)
          .setFlipY(flip),
      );
    }
    this.train = { cars, x, y: start, dir };
  }
}
