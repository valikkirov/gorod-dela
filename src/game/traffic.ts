// Транспорт на улицах — декорация: в расчётах игры его нет, на итоги дня он не влияет.
// Машины въезжают сверху по Кленовой (из-под перехода у метро) и с обоих краёв Садовой,
// на Т-образном перекрёстке поворачивают или едут прямо, стоят на красный, пропускают пешеходов
// и держат дистанцию. Правостороннее движение. Случайность обычная (Math.random): это слой отрисовки.
import Phaser from 'phaser';
import type { Simulation } from '../sim/simulation';
import { ROAD, SADOVAYA, SIDEWALK, WORLD, type Point } from '../sim/world';
import { ART_SCALE, textureOf } from './atlas';
import { sound } from './sound';

type Kind = 'car' | 'van' | 'truck' | 'ambulance' | 'police' | 'garbage' | 'scooter' | 'bike' | 'bus' | 'tram';
/** Ходят по расписанию, а не случайным потоком */
type Scheduled = 'bus' | 'tram';
type Dir = 'down' | 'up' | 'left' | 'right';
/** Откуда въехал: сверху по Кленовой, с запада или с востока по Садовой */
type Entry = 'S' | 'W' | 'E';

/** Виды транспорта: длина — по кадру, скорость — пикселей в игровую секунду ×1 */
const KINDS: Record<Exclude<Kind, Scheduled>, { weight: number; len: number; speed: [number, number]; flash?: boolean }> = {
  car: { weight: 70, len: 66, speed: [150, 200] },
  van: { weight: 10, len: 72, speed: [140, 175] },
  truck: { weight: 6, len: 104, speed: [115, 140] },
  // Скорая и полиция редкие, едут быстрее и мигают
  ambulance: { weight: 2, len: 78, speed: [210, 240], flash: true },
  police: { weight: 2, len: 66, speed: [200, 230], flash: true },
  // Мусоровоз — только рано утром (вес задаёт pickKind)
  garbage: { weight: 0, len: 100, speed: [90, 115] },
  // Курьеры на самокатах и велосипедисты — днём, медленнее машин
  scooter: { weight: 6, len: 30, speed: [90, 120] },
  bike: { weight: 5, len: 36, speed: [80, 110] },
};
const CARS = ['car-a', 'car-b', 'car-c'];
const BUS = { len: 126, speed: 110, waitSeconds: 2.5, everyMinutes: 40 };
/** Трамвай: по Садовой туда и обратно, примерно раз в 2 игровых часа днём */
const TRAM = { len: 190, speed: 100, everyMinutes: 120 };
/** Рельсы трамвая: по оси каждой полосы Садовой, колея ±RAIL_GAUGE */
const RAIL_GAUGE = 8;
/** Мигалка: смена кадра раз в столько миллисекунд реального времени */
const FLASH_MS = 250;

// ——— Полосы и маршруты ———

/** Кленовая: вниз — левая полоса, вверх — правая. Садовая: на запад — верхняя, на восток — нижняя */
const DOWN_X = ROAD.left + 30;
const UP_X = ROAD.right - 30;
const WEST_Y = SADOVAYA.top + 30;
const EAST_Y = SADOVAYA.bottom - 30;
/** Кленовая начинается под переходом у метро: там машины появляются и исчезают плавно */
const TOP = 96;
const FADE = 60;
const LEFT = -140;
const RIGHT = WORLD.width + 140;
/** Где автобус стоит у остановки возле сквера (центр автобуса) */
const BUS_STOP_Y = 975;

/** Кривая поворота: квадратичная, точками */
function curve(a: Point, c: Point, b: Point): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return pts;
}

const ROUTES: Record<string, { entry: Entry; points: Point[] }> = {
  // Сверху по Кленовой: налево (на восток) или направо (на запад)
  'S-E': { entry: 'S', points: [{ x: DOWN_X, y: TOP - 120 }, { x: DOWN_X, y: WEST_Y }, ...curve({ x: DOWN_X, y: WEST_Y }, { x: DOWN_X, y: EAST_Y }, { x: DOWN_X + 60, y: EAST_Y }), { x: RIGHT, y: EAST_Y }] },
  'S-W': { entry: 'S', points: [{ x: DOWN_X, y: TOP - 120 }, { x: DOWN_X, y: SADOVAYA.top - 10 }, ...curve({ x: DOWN_X, y: SADOVAYA.top - 10 }, { x: DOWN_X, y: WEST_Y }, { x: DOWN_X - 40, y: WEST_Y }), { x: LEFT, y: WEST_Y }] },
  // С запада: прямо или налево на Кленовую
  'W-E': { entry: 'W', points: [{ x: LEFT, y: EAST_Y }, { x: RIGHT, y: EAST_Y }] },
  'W-N': { entry: 'W', points: [{ x: LEFT, y: EAST_Y }, { x: UP_X - 60, y: EAST_Y }, ...curve({ x: UP_X - 60, y: EAST_Y }, { x: UP_X, y: EAST_Y }, { x: UP_X, y: WEST_Y }), { x: UP_X, y: TOP - 120 }] },
  // С востока: прямо или направо на Кленовую
  'E-W': { entry: 'E', points: [{ x: RIGHT, y: WEST_Y }, { x: LEFT, y: WEST_Y }] },
  'E-N': { entry: 'E', points: [{ x: RIGHT, y: WEST_Y }, { x: UP_X + 40, y: WEST_Y }, ...curve({ x: UP_X + 40, y: WEST_Y }, { x: UP_X, y: WEST_Y }, { x: UP_X, y: SADOVAYA.top - 10 }), { x: UP_X, y: TOP - 120 }] },
};
const TURNS: Record<Entry, [string, number][]> = {
  S: [['S-E', 0.5], ['S-W', 0.5]],
  W: [['W-E', 0.7], ['W-N', 0.3]],
  E: [['E-W', 0.7], ['E-N', 0.3]],
};

interface Path {
  points: Point[];
  /** Пройденное расстояние до каждой точки */
  at: number[];
  total: number;
}

function makePath(points: Point[]): Path {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, at, total: at[at.length - 1] };
}
const PATHS: Record<string, Path> = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, makePath(r.points)]));

/** Точка и направление на расстоянии s от начала маршрута */
function sample(p: Path, s: number): { pos: Point; angle: number } {
  let i = 1;
  while (i < p.points.length - 1 && p.at[i] < s) i++;
  const a = p.points[i - 1];
  const b = p.points[i];
  const len = p.at[i] - p.at[i - 1] || 1;
  const t = Phaser.Math.Clamp((s - p.at[i - 1]) / len, 0, 1);
  return { pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

const DIR_ANGLE: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
function dirOf(angle: number): Dir {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (Math.abs(c) >= Math.abs(s)) return c > 0 ? 'right' : 'left';
  return s > 0 ? 'down' : 'up';
}

// ——— Светофор ———

/**
 * Фазы: зелёный Кленовой (машины сверху), жёлтый, зелёный Садовой, жёлтый. Секунды реального времени ×1.
 * Пешеходные переходы: через Кленовую — зелёный, пока у Кленовой красный; через Садовую — наоборот.
 */
type Phase = 'k-green' | 'k-yellow' | 's-green' | 's-yellow';
const PHASES: [Phase, number][] = [
  ['k-green', 7],
  ['k-yellow', 1.5],
  ['s-green', 9],
  ['s-yellow', 1.5],
];
type Signal = 'green' | 'yellow' | 'red';

/** Стоп-линии: где останавливается перёд машины на красный */
const STOP: Record<Entry, (front: Point) => number> = {
  // Сколько осталось до стоп-линии по ходу движения (меньше нуля — уже проехал)
  S: (f) => SADOVAYA.top - 44 - f.y,
  W: (f) => ROAD.left - 46 - f.x,
  E: (f) => f.x - (ROAD.right + 46),
};

interface Vehicle {
  id: number;
  sprite: Phaser.GameObjects.Image;
  kind: Kind;
  frame: string;
  route: string;
  entry: Entry;
  s: number;
  pos: Point;
  angle: number;
  len: number;
  speed: number;
  /** Сколько ещё стоять на остановке, секунд (только автобус) */
  wait: number;
  stopped: boolean;
}

/** Светофор на карте: столб и три окошка, горит одно */
interface LightPost {
  entry: Entry;
  lamps: Record<Signal, Phaser.GameObjects.Image>;
}
interface PedPost {
  cross: 'k' | 'w' | 'e';
  stop: Phaser.GameObjects.Image;
  go: Phaser.GameObjects.Image;
}

export class Traffic {
  private cars: Vehicle[] = [];
  private nextId = 1;
  private timers: Record<Entry, number> = { S: 1, W: 2, E: 3 };
  private lastBusMinute = -1000;
  private lastTramMinute = -1000;
  private tramEast = false;
  private phase = 0;
  private phaseLeft = PHASES[0][1];
  private lights: LightPost[] = [];
  private peds: PedPost[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Simulation,
    /** Глубина слоя света: окошки светофора светятся поверх ночи */
    lightsDepth: number,
  ) {
    this.drawRails();
    // Светофоры стоят справа по ходу движения, перед стоп-линиями
    this.lights.push(this.post('S', 'prop-traffic-light-down', ROAD.left - 16, SADOVAYA.top - 46, [10, [7.5, 15, 22.5]], lightsDepth));
    this.lights.push(this.post('W', 'prop-traffic-light-left', ROAD.left - 56, SADOVAYA.bottom + 36, [3.5, [7.5, 15, 22.5]], lightsDepth));
    this.lights.push(this.post('E', 'prop-traffic-light-right', ROAD.right + 56, SADOVAYA.top - 4, [16.5, [8.5, 16, 23.5]], lightsDepth));
    // Пешеходные светофоры — по одному у каждого перехода
    this.peds.push(this.pedPost('k', ROAD.right + 12, SADOVAYA.top - 30, lightsDepth));
    this.peds.push(this.pedPost('w', ROAD.left - 30, SADOVAYA.bottom + 34, lightsDepth));
    this.peds.push(this.pedPost('e', ROAD.right + 30, SADOVAYA.bottom + 34, lightsDepth));
  }

  private post(entry: Entry, frame: string, x: number, base: number, [lx, ys]: [number, number[]], depth: number): LightPost {
    this.scene.add.image(x, base, textureOf(frame), frame).setOrigin(0.5, 1).setScale(1 / ART_SCALE).setDepth(base);
    const top = base - 70;
    const lamp = (f: string, y: number) =>
      this.scene.add
        .image(x - 10 + lx, top + y, textureOf(f), f)
        .setScale((frame.endsWith('left') || frame.endsWith('right') ? 0.7 : 0.85) / ART_SCALE)
        .setDepth(depth)
        .setVisible(false);
    return { entry, lamps: { red: lamp('signal-red', ys[0]), yellow: lamp('signal-yellow', ys[1]), green: lamp('signal-green', ys[2]) } };
  }

  private pedPost(cross: PedPost['cross'], x: number, base: number, depth: number): PedPost {
    this.scene.add.image(x, base, textureOf('prop-ped-light'), 'prop-ped-light').setOrigin(0.5, 1).setScale(1 / ART_SCALE).setDepth(base);
    const top = base - 50;
    const sig = (f: string, y: number) =>
      this.scene.add.image(x, top + y, textureOf(f), f).setScale(0.75 / ART_SCALE).setDepth(depth).setVisible(false);
    return { cross, stop: sig('signal-ped-stop', 7.5), go: sig('signal-ped-go', 16) };
  }

  /** Сигнал для машин с этого направления */
  private signal(entry: Entry): Signal {
    const phase = PHASES[this.phase][0];
    if (entry === 'S') return phase === 'k-green' ? 'green' : phase === 'k-yellow' ? 'yellow' : 'red';
    return phase === 's-green' ? 'green' : phase === 's-yellow' ? 'yellow' : 'red';
  }

  /** Кто-то идёт по переходу (или вот-вот ступит на него) */
  private pedsOn(cross: PedPost['cross']): boolean {
    for (const r of this.sim.residents) {
      if (!r.visible || !r.walking) continue;
      const { x, y } = r.pos;
      if (cross === 'k' && y > SADOVAYA.top - 40 && y < SADOVAYA.top && x > ROAD.left - 10 && x < ROAD.right + 10) return true;
      if (cross !== 'k' && y > SADOVAYA.top - 10 && y < SADOVAYA.bottom + 10) {
        const cx = cross === 'w' ? SIDEWALK.leftX : SIDEWALK.rightX;
        if (Math.abs(x - cx) < 22) return true;
      }
    }
    return false;
  }

  /** Трамвайные рельсы по Садовой: по паре на каждую полосу, поверх асфальта, под машинами */
  private drawRails(): void {
    const g = this.scene.add.graphics().setDepth(-990);
    for (const y of [WEST_Y, EAST_Y]) {
      for (const dy of [-RAIL_GAUGE, RAIL_GAUGE]) {
        // Тёмный желобок и светлая натёртая полоска сверху
        // Рельсы только в пределах карты: дальше трава, а не мостовая
        g.fillStyle(0x3d3a36, 0.55).fillRect(0, y + dy - 1.5, WORLD.width, 3);
        g.fillStyle(0xcfc8bc, 0.7).fillRect(0, y + dy - 1.5, WORLD.width, 1);
      }
    }
  }

  /** dt — секунды с учётом скорости игры; на паузе всё стоит */
  update(dt: number, minute: number): void {
    if (dt <= 0) return;
    this.updateLights(dt);
    const h = minute / 60;
    for (const entry of ['S', 'W', 'E'] as Entry[]) {
      this.timers[entry] -= dt;
      if (this.timers[entry] <= 0) {
        this.spawn(pick(TURNS[entry]), pickKind(h));
        // На Садовой (жилой) машин меньше, чем на деловой Кленовой
        this.timers[entry] = interval(h) * (entry === 'S' ? 1 : 1.4) * (0.6 + Math.random() * 0.8);
      }
    }
    // Автобус ходит днём примерно раз в 40 игровых минут: с востока по Садовой, к остановке у сквера
    const sinceBus = (minute - this.lastBusMinute + 1440) % 1440;
    if (h >= 6 && h < 23 && sinceBus >= BUS.everyMinutes) {
      this.lastBusMinute = minute;
      this.spawn('E-N', 'bus');
    }
    // Трамвай — по Садовой, попеременно на восток и на запад
    const sinceTram = (minute - this.lastTramMinute + 1440) % 1440;
    if (h >= 6 && h < 24 && sinceTram >= TRAM.everyMinutes) {
      this.lastTramMinute = minute;
      this.tramEast = !this.tramEast;
      this.spawn(this.tramEast ? 'W-E' : 'E-W', 'tram');
    }

    const flashOn = Math.floor(this.scene.time.now / FLASH_MS) % 2 === 1;
    for (const v of this.cars) this.move(v, dt, flashOn);
    this.cars = this.cars.filter((v) => {
      const gone = v.s >= PATHS[v.route].total;
      if (gone) v.sprite.destroy();
      return !gone;
    });
  }

  private updateLights(dt: number): void {
    this.phaseLeft -= dt;
    // Люди на переходе через Кленовую — зелёный машинам сверху заканчиваем раньше
    const [phase] = PHASES[this.phase];
    const elapsed = PHASES[this.phase][1] - this.phaseLeft;
    if (phase === 'k-green' && elapsed > 2 && this.pedsOn('k')) this.phaseLeft = Math.min(this.phaseLeft, 0);
    if (phase === 's-green' && elapsed > 2 && (this.pedsOn('w') || this.pedsOn('e'))) this.phaseLeft = Math.min(this.phaseLeft, 0);
    if (this.phaseLeft <= 0) {
      this.phase = (this.phase + 1) % PHASES.length;
      this.phaseLeft = PHASES[this.phase][1];
    }
    for (const l of this.lights) {
      const sig = this.signal(l.entry);
      for (const k of ['red', 'yellow', 'green'] as Signal[]) l.lamps[k].setVisible(k === sig);
    }
    const kRed = this.signal('S') === 'red';
    const sRed = this.signal('W') === 'red';
    for (const p of this.peds) {
      // Пешеходам зелёный, когда машинам на этом переходе красный — или когда люди уже идут
      const go = (p.cross === 'k' ? kRed : sRed) || this.pedsOn(p.cross);
      p.go.setVisible(go);
      p.stop.setVisible(!go);
    }
  }

  /** Выпустить машину. Публичный — для отладки: scene.traffic.spawn('S-E', 'ambulance') */
  spawn(route: string, kind: Kind): void {
    const path = PATHS[route];
    if (!path) return;
    const bus = kind === 'bus';
    const tram = kind === 'tram';
    const spec = bus || tram ? null : KINDS[kind];
    const len = bus ? BUS.len : tram ? TRAM.len : spec!.len;
    // Не плодим машины друг в друге у края
    const start = sample(path, 0).pos;
    if (this.cars.some((v) => Math.hypot(v.pos.x - start.x, v.pos.y - start.y) < (v.len + len) / 2 + 40)) return;
    const base = kind === 'car' ? CARS[Math.floor(Math.random() * CARS.length)] : kind;
    if (!bus && !tram && kind !== 'scooter' && kind !== 'bike') sound.play('sfx-car-pass', kind === 'truck' || kind === 'garbage' ? 0.45 : 0.3);
    const { pos, angle } = sample(path, 0);
    const frame = `${base}-${dirOf(angle)}`;
    const sprite = this.scene.add.image(pos.x, pos.y, textureOf(frame), frame).setScale(1 / ART_SCALE).setOrigin(0.5);
    this.cars.push({
      id: this.nextId++,
      sprite,
      kind,
      frame: base,
      route,
      entry: ROUTES[route].entry,
      s: 0,
      pos,
      angle,
      len,
      speed: bus ? BUS.speed : tram ? TRAM.speed : spec!.speed[0] + Math.random() * (spec!.speed[1] - spec!.speed[0]),
      wait: bus ? BUS.waitSeconds : 0,
      stopped: false,
    });
  }

  /** Что впереди мешает ехать: другая машина (по ходу движения, в своём ряду) */
  private carAhead(v: Vehicle): Vehicle | null {
    const hx = Math.cos(v.angle);
    const hy = Math.sin(v.angle);
    let best: Vehicle | null = null;
    let bestAlong = Infinity;
    for (const o of this.cars) {
      if (o === v) continue;
      const dx = o.pos.x - v.pos.x;
      const dy = o.pos.y - v.pos.y;
      const along = dx * hx + dy * hy;
      const side = Math.abs(dx * hy - dy * hx);
      if (along <= 0 || side > 22) continue;
      const gap = along - (v.len + o.len) / 2;
      if (gap < 16 && along < bestAlong) {
        best = o;
        bestAlong = along;
      }
    }
    return best;
  }

  private move(v: Vehicle, dt: number, flashOn: boolean): void {
    const hx = Math.cos(v.angle);
    const hy = Math.sin(v.angle);
    const front = { x: v.pos.x + (hx * v.len) / 2, y: v.pos.y + (hy * v.len) / 2 };
    let blocked = false;
    // Пешеход впереди — ждём
    for (const r of this.sim.residents) {
      if (!r.visible) continue;
      const dx = r.pos.x - front.x;
      const dy = r.pos.y - front.y;
      const ahead = dx * hx + dy * hy;
      const side = Math.abs(dx * hy - dy * hx);
      if (side < 26 && ahead > -6 && ahead < 46) {
        blocked = true;
        break;
      }
    }
    // Светофор: на красный и поздний жёлтый — стоим у стоп-линии
    if (!blocked) {
      const toLine = STOP[v.entry](front);
      const sig = this.signal(v.entry);
      if (sig !== 'green' && toLine > -2 && toLine < 70 && !(sig === 'yellow' && toLine < 18)) {
        if (toLine < 4 + v.speed * dt) blocked = true;
      }
    }
    // Машина впереди — держим дистанцию. Если две ждут друг друга, первой едет та, что появилась раньше
    if (!blocked) {
      const o = this.carAhead(v);
      if (o && !(this.carAhead(o) === v && v.id < o.id)) blocked = true;
    }
    // Автобус стоит на остановке
    if (v.kind === 'bus' && v.wait > 0 && v.route === 'E-N' && v.pos.x === UP_X && v.pos.y <= BUS_STOP_Y + 2) {
      if (v.wait === BUS.waitSeconds) sound.play('sfx-bus', 0.45);
      v.wait -= dt;
      blocked = true;
    }
    if (!blocked) v.s += v.speed * dt;
    v.stopped = blocked;
    const { pos, angle } = sample(PATHS[v.route], v.s);
    v.pos = pos;
    v.angle = angle;
    // Кадр — по ближайшему направлению, остаток угла — поворотом спрайта (плавно в повороте)
    const dir = dirOf(angle);
    const flashing = (v.kind === 'ambulance' || v.kind === 'police') && flashOn;
    const frame = `${v.frame}-${dir}${flashing ? '-flash' : ''}`;
    if (v.sprite.frame.name !== frame) v.sprite.setTexture(textureOf(frame), frame);
    let rot = angle - DIR_ANGLE[dir];
    if (rot > Math.PI) rot -= 2 * Math.PI;
    if (rot < -Math.PI) rot += 2 * Math.PI;
    // Машины в 3/4 видны спереди, сзади или сбоку — сильно их не крутим, в повороте лишь наклоняем
    rot = Phaser.Math.Clamp(rot, -0.3, 0.3);
    // Под переходом у метро Кленовая уходит в тоннель: машина появляется и исчезает плавно
    const toTop = pos.y - TOP;
    // По краям Садовой машина въезжает на карту и уезжает с неё — тоже плавно
    const toEdge = Math.min(pos.x + v.len / 2, WORLD.width - pos.x + v.len / 2);
    const alpha = Phaser.Math.Clamp(Math.min(toTop / FADE + 0.4, toEdge / FADE), 0, 1);
    // Трамвай стоит колёсами на рельсах: низ кадра — у дальнего от нас рельса
    const lift = v.kind === 'tram' ? RAIL_GAUGE + 3 - v.sprite.displayHeight / 2 : 0;
    v.sprite
      .setPosition(pos.x, pos.y + lift)
      .setRotation(rot)
      .setDepth(pos.y + Math.abs(Math.sin(angle)) * (v.len / 2) + Math.abs(Math.cos(angle)) * 16)
      .setAlpha(alpha);
  }
}

function pick(options: [string, number][]): string {
  let r = Math.random();
  for (const [k, p] of options) if ((r -= p) < 0) return k;
  return options[options.length - 1][0];
}

/** Какую машину выпустить: ночью грузовиков больше (развоз), микроавтобусов меньше */
function pickKind(h: number): Exclude<Kind, Scheduled> {
  const night = h < 6 || h >= 23;
  const weights = Object.entries(KINDS).map(([k, v]) => {
    let w = v.weight;
    if (night && k === 'truck') w *= 2;
    if (night && k === 'van') w *= 0.5;
    // Самокаты и велосипеды ночью не ездят; мусоровоз — с 5 до 9 утра
    if ((k === 'scooter' || k === 'bike') && (h < 7 || h >= 22)) w = 0;
    if (k === 'garbage') w = h >= 5 && h < 9 ? 6 : 0;
    return [k as Exclude<Kind, Scheduled>, w] as const;
  });
  let r = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of weights) if ((r -= w) < 0) return k;
  return 'car';
}

/** Средний интервал между машинами с одного въезда, секунды игрового времени ×1 */
function interval(h: number): number {
  if ((h >= 7 && h < 10) || (h >= 17 && h < 20)) return 2.5;
  if (h >= 6 && h < 23) return 5;
  return 16;
}
