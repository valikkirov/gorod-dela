// Погода на карте: оттенок, дождь с брызгами, снег, листья на ветру.
// Капли и снежинки живут в долях экрана, поэтому плотность одна и та же при любом масштабе,
// а размеры делятся на зум — на экране капля всегда одной длины.
import Phaser from 'phaser';
import type { WeatherKind, WindLevel } from '../sim/weather';

/** Что рисуем: вид погоды из sim (снег — пока только для просмотра) */
export type FxKind = WeatherKind | 'snow';

interface Drop {
  x: number;
  y: number;
  /** Доля высоты экрана в секунду */
  speed: number;
  /** Длина на экране, css px */
  len: number;
  alpha: number;
  /** 0 — дальний слой (тоньше, медленнее), 1 — ближний */
  near: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
}

interface Flake {
  x: number;
  y: number;
  speed: number;
  r: number;
  phase: number;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  color: number;
}

const TINT: Partial<Record<FxKind, [number, number]>> = {
  rain: [0x2f405a, 0.3],
  cloudy: [0x6f7c8c, 0.12],
  hot: [0xffa040, 0.08],
  snow: [0xdfe8f3, 0.22],
};

/** Сколько капель на весь экран: ближний и дальний слой */
const RAIN_DROPS = 260;
const SNOW_FLAKES = 160;
const SPLASH_LIFE = 0.35;
const LEAF_COLORS = [0xe0a040, 0xc8662e, 0xd9b84a, 0xa8562a];

/** Наклон дождя и снос снега по ветру: доля скорости падения */
const SLANT: Record<WindLevel, number> = { 0: 0.08, 1: 0.22, 2: 0.42 };

export class WeatherFx {
  private readonly g: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private flakes: Flake[] = [];
  private leaves: Leaf[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    this.g = scene.add.graphics().setDepth(depth);
    for (let i = 0; i < RAIN_DROPS; i++) {
      const near = Math.random() < 0.35 ? 1 : 0;
      this.drops.push({
        x: Math.random(),
        y: Math.random(),
        speed: near ? 1.5 + Math.random() * 0.4 : 1.0 + Math.random() * 0.3,
        len: near ? 16 + Math.random() * 8 : 9 + Math.random() * 5,
        alpha: near ? 0.5 + Math.random() * 0.2 : 0.25 + Math.random() * 0.15,
        near,
      });
    }
    for (let i = 0; i < SNOW_FLAKES; i++) {
      this.flakes.push({ x: Math.random(), y: Math.random(), speed: 0.06 + Math.random() * 0.08, r: 1.2 + Math.random() * 1.8, phase: Math.random() * 6.28 });
    }
  }

  /**
   * view — видимая часть мира, px — сколько пикселей мира в одном css-пикселе экрана.
   * dt — реальные секунды с прошлого кадра (0 на паузе).
   */
  update(dt: number, time: number, kind: FxKind, wind: WindLevel, view: Phaser.Geom.Rectangle, px: number, area: Phaser.Geom.Rectangle): void {
    const g = this.g;
    g.clear();
    const t = TINT[kind];
    if (t) {
      g.fillStyle(t[0], t[1]);
      g.fillRect(area.x, area.y, area.width, area.height);
    }
    const slant = SLANT[wind];
    if (kind === 'rain') this.rain(dt, view, px, slant);
    else this.splashes.length = 0;
    if (kind === 'snow') this.snow(dt, time, view, px, slant);
    // Листья — когда дует и не идёт снег; в дождь их прибивает, поэтому меньше
    const leaves = kind === 'snow' ? 0 : wind === 2 ? (kind === 'rain' ? 6 : 14) : wind === 1 && kind !== 'rain' ? 5 : 0;
    this.leavesStep(dt, view, px, wind, leaves);
  }

  private rain(dt: number, view: Phaser.Geom.Rectangle, px: number, slant: number): void {
    const g = this.g;
    for (const near of [0, 1]) {
      for (const d of this.drops) {
        if (d.near !== near) continue;
        d.y += d.speed * dt;
        d.x += d.speed * slant * dt * (view.height / view.width);
        if (d.y > 1) {
          // Ближняя капля долетела до земли — брызги там, где упала
          if (near && this.splashes.length < 30 && Math.random() < 0.6) this.splashes.push({ x: d.x % 1, y: Math.random(), age: 0 });
          d.y -= 1 + Math.random() * 0.2;
          d.x = Math.random();
        }
        const x = view.x + (((d.x % 1) + 1) % 1) * view.width;
        const y = view.y + d.y * view.height;
        const len = d.len * px;
        g.lineStyle((near ? 1.6 : 1.1) * px, 0xd8e4f4, d.alpha);
        g.lineBetween(x, y, x - len * slant, y - len);
      }
    }
    // Брызги: маленькие кольца, расходятся и тают
    for (const s of this.splashes) {
      s.age += dt;
      const k = s.age / SPLASH_LIFE;
      const x = view.x + s.x * view.width;
      const y = view.y + s.y * view.height;
      g.lineStyle(0.8 * px, 0xe4edf8, 0.4 * (1 - k));
      g.strokeEllipse(x, y, (2 + 5 * k) * px, (1 + 2.5 * k) * px);
    }
    this.splashes = this.splashes.filter((s) => s.age < SPLASH_LIFE);
  }

  private snow(dt: number, time: number, view: Phaser.Geom.Rectangle, px: number, slant: number): void {
    const g = this.g;
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += slant * 0.8 * f.speed * dt * (view.height / view.width);
      if (f.y > 1) {
        f.y -= 1;
        f.x = Math.random();
      }
      const x = view.x + (((f.x % 1) + 1) % 1) * view.width + Math.sin(time / 700 + f.phase) * 6 * px;
      const y = view.y + f.y * view.height;
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(x, y, f.r * px);
    }
  }

  private leavesStep(dt: number, view: Phaser.Geom.Rectangle, px: number, wind: WindLevel, want: number): void {
    const g = this.g;
    while (this.leaves.length < want) {
      this.leaves.push({
        x: Math.random() * -0.2,
        y: Math.random(),
        vx: (wind === 2 ? 0.22 : 0.1) * (0.7 + Math.random() * 0.6),
        vy: 0.02 + Math.random() * 0.04,
        spin: (Math.random() - 0.5) * 8,
        angle: Math.random() * 6.28,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      });
    }
    for (const l of this.leaves) {
      l.x += l.vx * dt;
      l.y += (l.vy + Math.sin(l.angle) * 0.03) * dt;
      l.angle += l.spin * dt;
      const x = view.x + l.x * view.width;
      const y = view.y + l.y * view.height;
      const s = 4 * px;
      const c = Math.cos(l.angle) * s;
      const sn = Math.sin(l.angle) * s * 0.45;
      g.fillStyle(l.color, 0.95);
      g.fillTriangle(x - c, y - sn, x + sn, y - c * 0.45, x + c, y + sn);
      g.fillTriangle(x - c, y - sn, x - sn, y + c * 0.45, x + c, y + sn);
    }
    // Улетевшие за край убираем; лишние (ветер стих) — тоже
    this.leaves = this.leaves.filter((l) => l.x < 1.1 && l.y < 1.1).slice(0, Math.max(want, 0));
  }
}
