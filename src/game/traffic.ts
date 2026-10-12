// Машины, грузовики, микроавтобусы, скорая, полиция и автобус на дороге — декорация: в расчётах игры их нет, на итоги дня они не влияют.
// Поток зависит от часа (час пик, день, ночь), машины пропускают пешеходов и держат дистанцию.
// Случайность тут обычная (Math.random): это слой отрисовки, симуляция от неё не зависит.
import Phaser from 'phaser';
import type { Simulation } from '../sim/simulation';
import { ROAD } from '../sim/world';
import { ART_SCALE, textureOf } from './atlas';
import { sound } from './sound';

type Lane = 'down' | 'up';

/** Виды транспорта: длина — высота кадра, скорость — пикселей в игровую секунду ×1 */
type Kind = 'car' | 'van' | 'truck' | 'ambulance' | 'police' | 'bus';
const KINDS: Record<Exclude<Kind, 'bus'>, { weight: number; len: number; speed: [number, number]; flash?: boolean }> = {
  car: { weight: 78, len: 56, speed: [150, 200] },
  van: { weight: 11, len: 64, speed: [140, 175] },
  truck: { weight: 7, len: 96, speed: [115, 140] },
  // Скорая и полиция редкие, едут быстрее и мигают
  ambulance: { weight: 2, len: 72, speed: [210, 240], flash: true },
  police: { weight: 2, len: 58, speed: [200, 230], flash: true },
};
/** Мигалка: смена кадра раз в столько миллисекунд реального времени */
const FLASH_MS = 250;

interface Vehicle {
  sprite: Phaser.GameObjects.Image;
  lane: Lane;
  /** Центр машины по y */
  y: number;
  len: number;
  speed: number;
  kind: Kind;
  bus: boolean;
  /** Сколько ещё стоять на остановке, секунд */
  wait: number;
  stopped: boolean;
}

/** Правостороннее движение: вниз по экрану — левая полоса, вверх — правая */
const LANE_X: Record<Lane, number> = { down: ROAD.left + 30, up: ROAD.right - 30 };
const CARS = ['car-a', 'car-b', 'car-c'];
const BUS = { len: 110, stopY: ROAD.bottom - 70, waitSeconds: 2.5, everyMinutes: 40 };
/** Концы дороги: сверху — у метро (машины уходят под переход), снизу — поворот у сквера */
const FADE = 60;
const TOP = 96;

export class Traffic {
  private cars: Vehicle[] = [];
  private timers: Record<Lane, number> = { down: 1, up: 2 };
  private lastBusMinute = -1000;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Simulation,
  ) {}

  /** dt — секунды с учётом скорости игры; на паузе машины стоят */
  update(dt: number, minute: number): void {
    if (dt <= 0) return;
    const h = minute / 60;
    for (const lane of ['down', 'up'] as Lane[]) {
      this.timers[lane] -= dt;
      if (this.timers[lane] <= 0) {
        this.spawn(lane, pickKind(h));
        this.timers[lane] = interval(h) * (0.6 + Math.random() * 0.8);
      }
    }
    // Автобус ходит днём, примерно раз в 40 игровых минут
    const sinceBus = (minute - this.lastBusMinute + 1440) % 1440;
    if (h >= 6 && h < 23 && sinceBus >= BUS.everyMinutes) {
      this.lastBusMinute = minute;
      this.spawn('up', 'bus');
    }

    const flashOn = Math.floor(this.scene.time.now / FLASH_MS) % 2 === 1;
    for (const v of this.cars) {
      this.move(v, dt);
      if (v.kind === 'ambulance' || v.kind === 'police') {
        const frame = `${v.kind}-${v.lane}${flashOn ? '-flash' : ''}`;
        if (v.sprite.frame.name !== frame) v.sprite.setFrame(frame);
      }
    }
    this.cars = this.cars.filter((v) => {
      const gone = v.lane === 'down' ? v.y - v.len / 2 > ROAD.bottom : v.y + v.len / 2 < TOP;
      if (gone) v.sprite.destroy();
      return !gone;
    });
  }

  /** Выпустить машину. Публичный — чтобы в отладке можно было вызвать скорую: scene.traffic.spawn('down', 'ambulance') */
  spawn(lane: Lane, kind: Kind): void {
    const bus = kind === 'bus';
    const spec = bus ? null : KINDS[kind];
    const len = bus ? BUS.len : spec!.len;
    // Машина выезжает из-под перехода у метро или из-за поворота у сквера
    const startY = lane === 'down' ? TOP + 8 - len / 2 : ROAD.bottom - 8 + len / 2;
    // Не плодим машины друг в друге у края
    if (this.cars.some((v) => v.lane === lane && Math.abs(v.y - startY) < (v.len + len) / 2 + 30)) return;
    const frame = kind === 'car' ? `${CARS[Math.floor(Math.random() * CARS.length)]}-${lane}` : `${kind}-${lane}`;
    if (!bus) sound.play('sfx-car-pass', kind === 'truck' ? 0.45 : 0.3);
    const sprite = this.scene.add
      .image(LANE_X[lane], startY, textureOf(frame), frame)
      .setScale(1 / ART_SCALE)
      .setOrigin(0.5);
    this.cars.push({
      sprite,
      lane,
      y: startY,
      len,
      speed: bus ? 110 : spec!.speed[0] + Math.random() * (spec!.speed[1] - spec!.speed[0]),
      kind,
      bus,
      wait: bus ? BUS.waitSeconds : 0,
      stopped: false,
    });
  }

  private move(v: Vehicle, dt: number): void {
    const dir = v.lane === 'down' ? 1 : -1;
    const front = v.y + (dir * v.len) / 2;
    let blocked = false;
    // Пешеход впереди на полосе — ждём
    for (const r of this.sim.residents) {
      if (!r.visible || Math.abs(r.pos.x - LANE_X[v.lane]) > 26) continue;
      const ahead = (r.pos.y - front) * dir;
      if (ahead > -6 && ahead < 46) {
        blocked = true;
        break;
      }
    }
    // Машина впереди — держим дистанцию
    if (!blocked) {
      for (const o of this.cars) {
        if (o === v || o.lane !== v.lane) continue;
        const gap = (o.y - v.y) * dir - (o.len + v.len) / 2;
        if (gap > -1 && gap < 18) {
          blocked = true;
          break;
        }
      }
    }
    // Автобус стоит на остановке
    if (v.bus && v.wait > 0 && v.y <= BUS.stopY + 2) {
      if (v.wait === BUS.waitSeconds) sound.play('sfx-bus', 0.45);
      v.wait -= dt;
      blocked = true;
    }
    if (!blocked) v.y += dir * v.speed * dt;
    v.stopped = blocked;
    // У сквера дорога уходит за поворот: машина появляется и исчезает плавно
    const toEnd = ROAD.bottom - (v.y + v.len / 2);
    const toTop = v.y - v.len / 2 - TOP;
    const alpha = Phaser.Math.Clamp(Math.min(toEnd, toTop + 20) / FADE + 0.4, 0, 1);
    v.sprite.setPosition(LANE_X[v.lane], v.y).setDepth(v.y + v.len / 2).setAlpha(alpha);
  }
}

/** Какую машину выпустить: ночью грузовиков больше (развоз), микроавтобусов меньше */
function pickKind(h: number): Exclude<Kind, 'bus'> {
  const night = h < 6 || h >= 23;
  const weights = Object.entries(KINDS).map(([k, v]) => {
    let w = v.weight;
    if (night && k === 'truck') w *= 2;
    if (night && k === 'van') w *= 0.5;
    return [k as Exclude<Kind, 'bus'>, w] as const;
  });
  let r = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of weights) if ((r -= w) < 0) return k;
  return 'car';
}

/** Средний интервал между машинами в полосе, секунды игрового времени ×1 */
function interval(h: number): number {
  if ((h >= 7 && h < 10) || (h >= 17 && h < 20)) return 2.5;
  if (h >= 6 && h < 23) return 5;
  return 16;
}
