// Машины и автобус на дороге — декорация: в расчётах игры их нет, на итоги дня они не влияют.
// Поток зависит от часа (час пик, день, ночь), машины пропускают пешеходов и держат дистанцию.
// Случайность тут обычная (Math.random): это слой отрисовки, симуляция от неё не зависит.
import Phaser from 'phaser';
import type { Simulation } from '../sim/simulation';
import { ROAD } from '../sim/world';
import { ART_SCALE, textureOf } from './atlas';
import { sound } from './sound';

type Lane = 'down' | 'up';

interface Vehicle {
  sprite: Phaser.GameObjects.Image;
  lane: Lane;
  /** Центр машины по y */
  y: number;
  len: number;
  speed: number;
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
        this.spawn(lane, false);
        this.timers[lane] = interval(h) * (0.6 + Math.random() * 0.8);
      }
    }
    // Автобус ходит днём, примерно раз в 40 игровых минут
    const sinceBus = (minute - this.lastBusMinute + 1440) % 1440;
    if (h >= 6 && h < 23 && sinceBus >= BUS.everyMinutes) {
      this.lastBusMinute = minute;
      this.spawn('up', true);
    }

    for (const v of this.cars) this.move(v, dt);
    this.cars = this.cars.filter((v) => {
      const gone = v.lane === 'down' ? v.y - v.len / 2 > ROAD.bottom : v.y + v.len / 2 < TOP;
      if (gone) v.sprite.destroy();
      return !gone;
    });
  }

  private spawn(lane: Lane, bus: boolean): void {
    // Не плодим машины друг в друге у края
    const startY = lane === 'down' ? TOP - 20 : ROAD.bottom + 20;
    if (this.cars.some((v) => v.lane === lane && Math.abs(v.y - startY) < 90)) return;
    const frame = bus ? `bus-${lane}` : `${CARS[Math.floor(Math.random() * CARS.length)]}-${lane}`;
    if (!bus) sound.play('sfx-car-pass', 0.3);
    const sprite = this.scene.add
      .image(LANE_X[lane], startY, textureOf(frame), frame)
      .setScale(1 / ART_SCALE)
      .setOrigin(0.5);
    this.cars.push({
      sprite,
      lane,
      y: startY,
      len: bus ? BUS.len : 56,
      speed: bus ? 110 : 150 + Math.random() * 50,
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

/** Средний интервал между машинами в полосе, секунды игрового времени ×1 */
function interval(h: number): number {
  if ((h >= 7 && h < 10) || (h >= 17 && h < 20)) return 2.5;
  if (h >= 6 && h < 23) return 5;
  return 16;
}
