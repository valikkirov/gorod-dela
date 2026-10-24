// Животные улицы — только картинка, на симуляцию не влияют.
// Голуби кормятся стайками на тротуарах и у фонтана и взлетают, когда рядом проходят;
// белки бегают между деревьями в сквере и во дворах; кошки сидят и дремлют у домов и иногда
// перебираются на другое место; собаки гуляют на поводке с некоторыми жителями.
import Phaser from 'phaser';
import type { Resident } from '../sim/residents';
import type { Point } from '../sim/world';
import { ART_SCALE } from './atlas';

export const ANIMALS_TEXTURE = 'animals';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Где кормятся голуби: центр и разброс */
const PIGEON_SPOTS: { x: number; y: number; r: number }[] = [
  { x: 650, y: 905, r: 26 }, // у фонтана
  { x: 560, y: 1000, r: 24 }, // у остановки в сквере
  { x: 440, y: 650, r: 12 }, // правый тротуар Кленовой
  { x: 280, y: 420, r: 12 }, // левый тротуар Кленовой
  { x: 860, y: 1060, r: 30 }, // тротуар Садовой
  { x: 300, y: 1222, r: 30 }, // южный тротуар Садовой
  { x: 700, y: 1460, r: 40 }, // южный двор
];

/** Где сидят и дремлют кошки: у подъездов, на газоне двора, у скамеек */
const CAT_SPOTS: Point[] = [
  { x: 268, y: 236 },
  { x: 490, y: 880 },
  { x: 1080, y: 470 },
  { x: 1220, y: 700 },
  { x: 120, y: 1450 },
  { x: 940, y: 1452 },
  { x: 1300, y: 1450 },
  { x: 452, y: 330 },
];

/** Сколько и каких */
const PIGEON_FLOCKS = 4;
const CAT_COLORS = ['ginger', 'gray', 'black', 'ginger'] as const;
const DOG_COLORS = ['brown', 'cream', 'black'] as const;
/** Кто гуляет с собакой: пенсионеры и удалёнщики, каждый третий */
const DOG_OWNER_KINDS: Resident['kind'][] = ['pensioner', 'remote'];

const RUN_FPS = 10;
const WALK_FPS = 5;

interface Pigeon {
  img: Phaser.GameObjects.Image;
  /** Точка на земле */
  x: number;
  y: number;
  state: 'feed' | 'walk' | 'fly' | 'away';
  t: number;
  tx: number;
  ty: number;
  /** Скорость взлёта */
  vx: number;
  vy: number;
  h: number;
}

interface Flock {
  spot: (typeof PIGEON_SPOTS)[number];
  birds: Pigeon[];
  /** Когда вернутся после взлёта (секунды) */
  back: number;
}

interface Squirrel {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  state: 'sit' | 'run' | 'tree';
  t: number;
  tx: number;
  ty: number;
}

interface Cat {
  img: Phaser.GameObjects.Image;
  color: string;
  x: number;
  y: number;
  state: 'sit' | 'sleep' | 'walk';
  t: number;
  tx: number;
  ty: number;
}

interface Dog {
  img: Phaser.GameObjects.Image;
  color: string;
  owner: number;
  x: number;
  y: number;
  side: number;
  moving: boolean;
  leash: Phaser.GameObjects.Graphics;
}

export interface AnimalWorld {
  residents: Resident[];
  /** Ночь: 0 — день, 1 — глубокая ночь */
  night: number;
  rain: boolean;
  /** Снег: кошки дома, белки и голуби — на улице */
  snow: boolean;
  /** Деревья: основания стволов, к ним бегают белки */
  trees: Point[];
}

export class Animals {
  private flocks: Flock[] = [];
  private squirrels: Squirrel[] = [];
  private cats: Cat[] = [];
  private dogs: Dog[] = [];
  private clock = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    residents: Resident[],
    private readonly trees: Point[],
  ) {
    const spots = [...PIGEON_SPOTS].sort(() => Math.random() - 0.5).slice(0, PIGEON_FLOCKS);
    for (const spot of spots) {
      const flock: Flock = { spot, birds: [], back: 0 };
      const n = Math.floor(rnd(3, 7));
      for (let i = 0; i < n; i++) {
        const p = this.groundPoint(spot);
        flock.birds.push({ img: this.image('pigeon-stand'), ...p, state: 'feed', t: rnd(0, 3), tx: p.x, ty: p.y, vx: 0, vy: 0, h: 0 });
      }
      this.flocks.push(flock);
    }
    // Белки: в сквере и во дворах, у деревьев
    const squirrelTrees = trees.filter((t) => t.y < 1100);
    for (let i = 0; i < 4 && squirrelTrees.length; i++) {
      const tree = pick(squirrelTrees);
      this.squirrels.push({ img: this.image('squirrel-sit'), x: tree.x + rnd(-20, 20), y: tree.y + rnd(4, 16), state: 'sit', t: rnd(1, 4), tx: 0, ty: 0 });
    }
    const catSpots = [...CAT_SPOTS].sort(() => Math.random() - 0.5);
    CAT_COLORS.forEach((color, i) => {
      const s = catSpots[i % catSpots.length];
      this.cats.push({ img: this.image(`cat-${color}-sit`), color, x: s.x, y: s.y, state: Math.random() < 0.5 ? 'sleep' : 'sit', t: rnd(10, 40), tx: s.x, ty: s.y });
    });
    const owners = residents.map((r, i) => ({ r, i })).filter(({ r, i }) => DOG_OWNER_KINDS.includes(r.kind) && i % 3 === 0).slice(0, 5);
    owners.forEach(({ r, i }, n) => {
      const color = DOG_COLORS[n % DOG_COLORS.length];
      this.dogs.push({ img: this.image(`dog-${color}-sit`), color, owner: i, x: r.pos.x, y: r.pos.y, side: n % 2 ? 1 : -1, moving: false, leash: scene.add.graphics() });
    });
  }

  private image(frame: string): Phaser.GameObjects.Image {
    return this.scene.add.image(0, 0, ANIMALS_TEXTURE, frame).setOrigin(0.5, 0.92).setScale(1 / ART_SCALE);
  }

  private groundPoint(spot: { x: number; y: number; r: number }): Point {
    const a = rnd(0, Math.PI * 2);
    const d = Math.sqrt(Math.random()) * spot.r;
    return { x: spot.x + Math.cos(a) * d * 1.6, y: spot.y + Math.sin(a) * d * 0.6 };
  }

  private place(img: Phaser.GameObjects.Image, x: number, y: number, frame: string, flip: boolean, lift = 0): void {
    img.setFrame(frame).setPosition(x, y - lift).setFlipX(flip).setDepth(y);
  }

  /** dt — реальные секунды (0 на паузе) */
  update(dt: number, w: AnimalWorld): void {
    this.clock += dt;
    const near = (x: number, y: number, r: number): boolean =>
      w.residents.some((p) => p.visible && Math.abs(p.pos.x - x) < r && Math.abs(p.pos.y - y) < r * 0.7);
    this.updatePigeons(dt, w, near);
    this.updateSquirrels(dt, w);
    this.updateCats(dt, w);
    this.updateDogs(dt, w);
  }

  private updatePigeons(dt: number, w: AnimalWorld, near: (x: number, y: number, r: number) => boolean): void {
    // Ночью и в сильный дождь голуби прячутся под крыши
    const hidden = w.night > 0.6 || w.rain;
    for (const f of this.flocks) {
      const away = f.birds.every((b) => b.state === 'away');
      if (away) {
        f.back -= dt;
        if (f.back <= 0 && !hidden) {
          // Прилетают обратно — каждая птица садится на свою точку сверху
          for (const b of f.birds) {
            const p = this.groundPoint(f.spot);
            Object.assign(b, { x: p.x, y: p.y, state: 'fly', h: rnd(60, 110), vx: rnd(-20, 20), vy: 0, t: 0, tx: p.x, ty: p.y });
          }
        }
      }
      for (const b of f.birds) {
        if (b.state !== 'away' && b.state !== 'fly' && (hidden || near(b.x, b.y, 30))) {
          // Спугнули — взлетает вся стайка
          for (const o of f.birds) {
            if (o.state === 'away' || o.state === 'fly') continue;
            const dir = Math.random() < 0.5 ? -1 : 1;
            Object.assign(o, { state: 'fly', vx: dir * rnd(70, 110), vy: rnd(-30, -10), h: 0, t: 0, tx: Number.NaN });
          }
          f.back = rnd(25, 60);
          break;
        }
      }
      for (const b of f.birds) this.stepPigeon(b, dt);
    }
  }

  private stepPigeon(b: Pigeon, dt: number): void {
    b.t += dt;
    if (b.state === 'away') {
      b.img.setVisible(false);
      return;
    }
    b.img.setVisible(true);
    const flap = Math.floor(b.t * 12) % 2 ? 'pigeon-fly1' : 'pigeon-fly2';
    if (b.state === 'fly') {
      if (Number.isNaN(b.tx)) {
        // Улетает: вверх и в сторону, потом пропадает
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.h += 70 * dt;
        this.place(b.img, b.x, b.y, flap, b.vx < 0, b.h);
        b.img.setAlpha(Math.max(0, 1 - b.t / 1.8));
        if (b.t > 1.8) {
          b.state = 'away';
          b.img.setAlpha(1);
        }
      } else {
        // Садится: снижается к своей точке
        b.h = Math.max(0, b.h - 80 * dt);
        b.img.setAlpha(Math.min(1, b.t * 2));
        this.place(b.img, b.x + b.vx * (b.h / 100), b.y, b.h > 0 ? flap : 'pigeon-stand', b.vx < 0, b.h);
        if (b.h <= 0) {
          b.state = 'feed';
          b.t = rnd(0, 2);
        }
      }
      return;
    }
    if (b.state === 'feed') {
      // Клюёт и стоит; иногда делает пару шагов
      const peck = Math.sin(b.t * 5 + b.x) > 0.55;
      this.place(b.img, b.x, b.y, peck ? 'pigeon-peck' : 'pigeon-stand', b.img.flipX);
      if (b.t > 3 && Math.random() < dt * 0.6) {
        b.state = 'walk';
        b.tx = b.x + rnd(-14, 14);
        b.ty = b.y + rnd(-5, 5);
        b.t = 0;
      }
      return;
    }
    const dx = b.tx - b.x;
    const dy = b.ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || b.t > 3) {
      b.state = 'feed';
      b.t = 0;
      return;
    }
    const v = 12 * dt;
    b.x += (dx / d) * Math.min(v, d);
    b.y += (dy / d) * Math.min(v, d);
    this.place(b.img, b.x, b.y, Math.floor(b.t * 8) % 2 ? 'pigeon-walk1' : 'pigeon-walk2', dx < 0);
  }

  private updateSquirrels(dt: number, w: AnimalWorld): void {
    for (const s of this.squirrels) {
      s.t -= dt;
      // Ночью и в дождь сидят в дупле
      const hidden = w.night > 0.5 || w.rain;
      if (s.state === 'tree') {
        s.img.setVisible(false);
        if (s.t <= 0 && !hidden) {
          const tree = pick(this.trees.filter((t) => t.y < 1100));
          s.x = tree.x + rnd(-6, 6);
          s.y = tree.y + 4;
          s.state = 'sit';
          s.t = rnd(1.5, 4);
        }
        continue;
      }
      s.img.setVisible(true);
      if (s.state === 'sit') {
        // Начался дождь или темнеет — скоро побежит прятаться
        if (hidden) s.t = Math.min(s.t, 0.6);
        this.place(s.img, s.x, s.y, 'squirrel-sit', s.img.flipX);
        if (s.t <= 0) {
          // Бежит к ближнему дереву (и прячется на нём) или просто в сторону
          if (hidden || Math.random() < 0.35) {
            const tree = this.nearestTree(s.x, s.y);
            s.tx = tree.x;
            s.ty = tree.y + 2;
          } else {
            s.tx = s.x + rnd(-90, 90);
            s.ty = s.y + rnd(-30, 30);
          }
          s.state = 'run';
          s.t = 6;
        }
        continue;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 2 || s.t <= 0) {
        const atTree = this.trees.some((t) => Math.hypot(t.x - s.x, t.y + 2 - s.y) < 4);
        s.state = atTree ? 'tree' : 'sit';
        s.t = atTree ? rnd(5, 14) : rnd(1.5, 5);
        continue;
      }
      const v = 75 * dt;
      s.x += (dx / d) * Math.min(v, d);
      s.y += (dy / d) * Math.min(v, d);
      // Бег прыжками: кадры и чуть подпрыгивает
      const ph = Math.floor((6 - s.t) * RUN_FPS) % 2;
      this.place(s.img, s.x, s.y, ph ? 'squirrel-run1' : 'squirrel-run2', dx < 0, ph ? 2 : 0);
    }
  }

  private nearestTree(x: number, y: number): Point {
    let best = this.trees[0];
    for (const t of this.trees) if (Math.hypot(t.x - x, t.y - y) < Math.hypot(best.x - x, best.y - y)) best = t;
    return best;
  }

  private updateCats(dt: number, w: AnimalWorld): void {
    for (const c of this.cats) {
      c.t -= dt;
      // В дождь и снег коты сидят дома
      const home = w.rain || w.snow;
      c.img.setVisible(!home);
      if (home) continue;
      if (c.state !== 'walk') {
        this.place(c.img, c.x, c.y, `cat-${c.color}-${c.state}`, c.img.flipX);
        if (c.t <= 0) {
          if (Math.random() < 0.4) {
            const s = pick(CAT_SPOTS.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) < 420 && (p.x !== c.x || p.y !== c.y)));
            if (s) {
              c.tx = s.x;
              c.ty = s.y;
              c.state = 'walk';
              c.t = 60;
              continue;
            }
          }
          c.state = c.state === 'sit' ? 'sleep' : 'sit';
          c.t = rnd(15, 45);
        }
        continue;
      }
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5 || c.t <= 0) {
        c.state = 'sit';
        c.t = rnd(10, 30);
        continue;
      }
      const v = 24 * dt;
      c.x += (dx / d) * Math.min(v, d);
      c.y += (dy / d) * Math.min(v, d);
      this.place(c.img, c.x, c.y, `cat-${c.color}-${Math.floor(this.clock * WALK_FPS) % 2 ? 'walk1' : 'walk2'}`, dx < 0);
    }
  }

  private updateDogs(dt: number, w: AnimalWorld): void {
    for (const dog of this.dogs) {
      const r = w.residents[dog.owner];
      const g = dog.leash;
      g.clear();
      if (!r?.visible) {
        dog.img.setVisible(false);
        dog.x = r?.pos.x ?? dog.x;
        dog.y = r?.pos.y ?? dog.y;
        continue;
      }
      dog.img.setVisible(true);
      // Собака идёт рядом с хозяином, чуть позади и сбоку, и догоняет его
      const tx = r.pos.x + dog.side * 18;
      const ty = r.pos.y + 4;
      const dx = tx - dog.x;
      const dy = ty - dog.y;
      const d = Math.hypot(dx, dy);
      dog.moving = d > 3;
      if (d > 120) {
        dog.x = tx;
        dog.y = ty;
      } else if (dog.moving) {
        const v = Math.max(40, d * 5) * dt;
        dog.x += (dx / d) * Math.min(v, d);
        dog.y += (dy / d) * Math.min(v, d);
      }
      const flip = dog.moving ? dx < 0 : r.pos.x < dog.x;
      const frame = dog.moving ? `dog-${dog.color}-${Math.floor(this.clock * 7) % 2 ? 'walk1' : 'walk2'}` : `dog-${dog.color}-sit`;
      this.place(dog.img, dog.x, dog.y, frame, flip);
      // Поводок: от руки хозяина к ошейнику, с провисанием
      const hx = r.pos.x + (dog.x > r.pos.x ? 7 : -7);
      const hy = r.pos.y - 16;
      const cx = dog.x + (flip ? -7 : 7);
      const cy = dog.y - 9;
      g.setDepth(Math.max(dog.y, r.pos.y) + 0.1);
      g.lineStyle(1.3, 0x6a2f24, 0.95);
      const mx = (hx + cx) / 2;
      const my = Math.max(hy, cy) + 5;
      g.beginPath();
      g.moveTo(hx, hy);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        g.lineTo((1 - t) * (1 - t) * hx + 2 * (1 - t) * t * mx + t * t * cx, (1 - t) * (1 - t) * hy + 2 * (1 - t) * t * my + t * t * cy);
      }
      g.strokePath();
    }
  }
}

