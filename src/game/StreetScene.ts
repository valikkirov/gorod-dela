import Phaser from 'phaser';
import { GAME_MINUTES_PER_SECOND } from '../sim/clock';
import type { Resident } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { WANT_LABEL } from '../sim/demand';
import { formatMoney } from '../sim/economy';
import { PARK_TOP, place, PLACES, ROAD, WORLD, GRID, type Place } from '../sim/world';
import { COLORS, RESIDENT_COLOR } from './palette';
import { ART_SCALE, ATLASES, personFrame, RESIDENT_SIZE, type Facing } from './atlas';
import type { RejectReason } from '../sim/cafe';

export interface SceneHooks {
  sim: Simulation;
  getSpeed: () => number;
  onSelect: (resident: Resident | null) => void;
  onFrame: () => void;
  onDayEnd: () => void;
  onBankrupt: () => void;
}

const REASON_SHORT: Record<RejectReason, string> = {
  'not-open': '',
  closed: 'закрыто',
  expensive: 'дорого',
  'off-route': 'не по пути',
  'no-item': 'нет в меню',
  queue: 'очередь',
  'no-time': 'не дождался',
  mood: 'не сегодня',
  'out-of-stock': 'кончилось',
  unaware: 'не знает о кафе',
};

const FONT = 'Inter, system-ui, sans-serif';

/** Насколько темно на улице: 0 днём, 0.42 глубокой ночью */
const MAX_DARK = 0.42;

function darkness(minute: number): number {
  const h = minute / 60;
  const MAX = MAX_DARK;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return ((h - 18) / 3) * MAX;
  if (h >= 5 && h < 7) return ((7 - h) / 2) * MAX;
  return MAX;
}


/** Какой спрайт у какого места. Кафе меняет вид в зависимости от состояния */
const BUILDING_SPRITE: Record<string, string> = {
  metro: 'building-metro',
  'home-1': 'building-home-a-left',
  cafe: 'building-cafe-rent',
  'home-2': 'building-home-b-left',
  'office-north': 'building-office-left',
  'office-bc': 'building-bc-right',
  shop: 'building-shop-right',
  'home-3': 'building-home-b-right',
  'home-4': 'building-home-a-right',
};

/** Слои глубины: всё на улице сортируется по y основания, сверху — ночь, свет и подписи */
const DEPTH = { ground: -1000, night: 5000, lights: 5001, sky: 5002, labels: 5003, floats: 5004 } as const;

/** Предметы улицы и сквера: [кадр, x, y основания] */
const PROPS: [string, number, number][] = [
  ['prop-lamp', 296, 330],
  ['prop-lamp', 296, 610],
  ['prop-lamp', 296, 880],
  ['prop-lamp', 424, 230],
  ['prop-lamp', 424, 480],
  ['prop-lamp', 424, 760],
  ['prop-bin', 256, 300],
  ['prop-bin', 464, 572],
  ['prop-tree-round', 80, 1150],
  ['prop-tree-round', 650, 1160],
  ['prop-tree-round', 190, 1272],
  ['prop-tree-round', 560, 1276],
  ['prop-tree-tall', 300, 1140],
  ['prop-tree-tall', 470, 1150],
  ['prop-tree-tall', 30, 1265],
  ['prop-tree-tall', 700, 1270],
  ['prop-bench', 250, 1205],
  ['prop-bench', 450, 1222],
  ['prop-lamp', 330, 1100],
  ['prop-lamp', 392, 1100],
  ['prop-bin', 360, 1240],
];

/** Окна кафе в координатах спрайта: гости видны в витринах, ночью и вне часов работы — темно */
const CAFE_WINDOWS = [
  { x: 15, y: 147, w: 94, h: 32 },
  { x: 127, y: 147, w: 48, h: 32 },
];
const CAFE_DOOR_GLASS = { x: 192, y: 148, w: 24, h: 18 };

interface Walker {
  sprite: Phaser.GameObjects.Image;
  facing: Facing;
  flip: boolean;
  lastX: number;
  lastY: number;
}

export class StreetScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private marks!: Phaser.GameObjects.Graphics;
  private guests!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Graphics;
  private sky!: Phaser.GameObjects.Graphics;
  private cafeSprite!: Phaser.GameObjects.Image;
  private cafeName!: Phaser.GameObjects.Text;
  private cafeStatus!: Phaser.GameObjects.Text;
  private menuBoard!: Phaser.GameObjects.Image;
  private windowLights: { place: Place; image: Phaser.GameObjects.Image }[] = [];
  private walkers: Walker[] = [];
  private guestSpots: { r: Resident; x: number; y: number }[] = [];
  private selected: Resident | null = null;

  constructor() {
    super('street');
  }

  init(hooks: SceneHooks): void {
    this.hooks = hooks;
  }

  preload(): void {
    for (const [key, atlas] of Object.entries(ATLASES)) this.load.image(key, atlas.url);
  }

  create(): void {
    for (const [key, atlas] of Object.entries(ATLASES)) {
      const tex = this.textures.get(key);
      for (const [name, [x, y, w, h]] of Object.entries(atlas.frames)) {
        tex.add(name, 0, x * ART_SCALE, y * ART_SCALE, w * ART_SCALE, h * ART_SCALE);
      }
    }
    this.drawGround();
    this.drawBuildings();
    for (const [frame, x, y] of PROPS) this.prop(frame, x, y);
    const c = place('cafe');
    this.menuBoard = this.prop('prop-menu-board', 246, c.rect.y + c.rect.h + 34);

    this.guests = this.add.graphics().setDepth(c.rect.y + c.rect.h + 0.5);
    this.marks = this.add.graphics();
    this.night = this.add.graphics().setDepth(DEPTH.night);
    this.sky = this.add.graphics().setDepth(DEPTH.sky);
    this.cafeName = this.label(c.rect.x + c.rect.w / 2, c.rect.y + 32, '', 20, true);
    this.cafeStatus = this.label(c.rect.x + c.rect.w / 2, c.rect.y + 62, '', 16, false);

    this.walkers = this.hooks.sim.residents.map((r) => ({
      sprite: this.add
        .image(r.pos.x, r.pos.y, 'people', personFrame(r.kind, 'down', 0))
        .setOrigin(0.5, RESIDENT_SIZE.feet / RESIDENT_SIZE.h)
        .setScale(1 / ART_SCALE),
      facing: 'down' as Facing,
      flip: false,
      lastX: r.pos.x,
      lastY: r.pos.y,
    }));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pick(p.worldX, p.worldY));
  }

  update(time: number, delta: number): void {
    const realSeconds = Math.min(delta, 250) / 1000;
    this.hooks.sim.advance(realSeconds * GAME_MINUTES_PER_SECOND * this.hooks.getSpeed());
    this.handleEvents();
    this.drawCafe();
    this.drawNight();
    this.drawSky(time);
    this.drawPeople(time);
    this.hooks.onFrame();
  }

  select(resident: Resident | null): void {
    this.selected = resident;
    this.hooks.onSelect(resident);
  }

  private pick(x: number, y: number): void {
    let best: Resident | null = null;
    let bestDist = 26;
    for (const r of this.hooks.sim.residents) {
      if (!r.visible) continue;
      // Житель нарисован вверх от стоп — целимся в середину фигуры
      const d = Math.hypot(r.pos.x - x, r.pos.y - 18 - y);
      if (d < bestDist) {
        best = r;
        bestDist = d;
      }
    }
    for (const g of this.guestSpots) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < Math.min(bestDist, 10)) {
        best = g.r;
        bestDist = d;
      }
    }
    this.select(best);
  }

  private handleEvents(): void {
    const sim = this.hooks.sim;
    for (const e of sim.drainEvents()) {
      if (e.type === 'sale') {
        const c = place('cafe').rect;
        this.float(c.x + c.w / 2, c.y + c.h - 70, `+${formatMoney(e.price)}`, '#2e8b57', 24);
      } else if (e.type === 'reject') {
        const r = sim.residents[e.residentId];
        if (!r.visible) continue;
        const text =
          e.reason === 'not-open' ? `хочет ${WANT_LABEL[r.decision?.want ?? 'coffee']}` : REASON_SHORT[e.reason];
        this.float(r.pos.x, r.pos.y - 52, text, e.reason === 'not-open' ? '#5b6270' : '#c0392b', 18);
      } else if (e.type === 'aware') {
        const r = sim.residents[e.residentId];
        if (r.visible) this.float(r.pos.x, r.pos.y - 52, e.source === 'walk' ? 'заметил кафе' : 'узнал о кафе', '#2f6fb0', 16);
      } else if (e.type === 'day') {
        this.hooks.onDayEnd();
      } else if (e.type === 'bankrupt') {
        this.hooks.onBankrupt();
      }
    }
  }

  /** Всплывающая подпись: поднимается и тает за ~1,5 с реального времени */
  private floats = 0;

  private float(x: number, y: number, text: string, color: string, size: number): void {
    // На высокой скорости событий много — не заваливаем экран надписями
    if (this.floats >= 8) return;
    this.floats++;
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color,
        stroke: '#ffffff',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(DEPTH.floats);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 1500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.destroy();
        this.floats--;
      },
    });
  }

  private drawCafe(): void {
    const { cafe } = this.hooks.sim;
    const open = cafe.isOpenAt(this.hooks.sim.minute);
    this.cafeSprite.setFrame(cafe.opened ? 'building-cafe-open' : 'building-cafe-rent');
    this.menuBoard.setVisible(cafe.opened);
    this.cafeName.setText(cafe.opened ? 'Твоё кафе' : 'Сдаётся');
    this.cafeStatus.setText(cafe.opened ? (open ? 'открыто' : 'закрыто') : 'свободное помещение');
    this.cafeStatus.setColor(open ? '#2e8b57' : '#6b7080');

    // Гости в витринах; когда закрыто — свет в окнах погашен
    const g = this.guests;
    g.clear();
    this.guestSpots = [];
    const r = place('cafe').rect;
    if (!cafe.opened) return;
    if (!open) {
      g.fillStyle(0x4a5563, 0.7);
      for (const w of [...CAFE_WINDOWS, CAFE_DOOR_GLASS]) g.fillRect(r.x + w.x, r.y + w.y, w.w, w.h);
      return;
    }
    const spots: { x: number; y: number }[] = [];
    for (const w of CAFE_WINDOWS) for (let x = w.x + 8; x < w.x + w.w - 4; x += 12) spots.push({ x: r.x + x, y: r.y + w.y + 20 });
    let n = 0;
    for (const res of this.hooks.sim.residents) {
      if (res.placeId !== 'cafe' || res.walking || n >= spots.length) continue;
      const { x, y } = spots[n++];
      g.fillStyle(RESIDENT_COLOR[res.kind], 1);
      g.fillRoundedRect(x - 5, y + 1, 10, 8, { tl: 4, tr: 4, bl: 0, br: 0 });
      g.fillStyle(0xf2c7a5, 1);
      g.fillCircle(x, y - 3, 4);
      if (res === this.selected) {
        g.lineStyle(2, COLORS.outline, 1);
        g.strokeCircle(x, y, 9);
      }
      this.guestSpots.push({ r: res, x, y });
    }
  }

  /** Вечером город темнеет, в окнах загорается свет */
  private drawNight(): void {
    const sim = this.hooks.sim;
    const minute = sim.minute;
    const dark = darkness(minute);
    this.night.clear();
    if (dark > 0) {
      this.night.fillStyle(0x1b2340, dark);
      this.night.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    const k = dark / MAX_DARK;
    const h = minute / 60;
    for (const { place: p, image } of this.windowLights) {
      let on = 0;
      if (p.kind === 'cafe') on = sim.cafe.opened && sim.cafe.isOpenAt(minute) ? 1 : 0;
      else if (p.kind === 'home') on = h >= 17 || h < 1 || (h >= 5 && h < 8) ? 1 : 0.15;
      else if (p.kind === 'office') on = h >= 7 && h < 21 ? 1 : 0.1;
      else if (p.kind === 'shop') on = h >= 8 && h < 22 ? 1 : 0;
      else on = 1;
      image.setAlpha(k * on).setVisible(k * on > 0.01);
    }
  }

  /** Погода: оттенок улицы и капли дождя */
  private drawSky(time: number): void {
    const kind = this.hooks.sim.weather.kind;
    const g = this.sky;
    g.clear();
    const tint: Record<string, [number, number]> = {
      rain: [0x4d5f7a, 0.16],
      cloudy: [0x7d8a99, 0.1],
      hot: [0xffa040, 0.08],
    };
    const t = tint[kind];
    if (t) {
      g.fillStyle(t[0], t[1]);
      g.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    if (kind === 'rain') {
      g.lineStyle(2, 0xc9d6ea, 0.55);
      const fall = (time / 4) % WORLD.height;
      for (let i = 0; i < 70; i++) {
        const x = (i * 97) % WORLD.width;
        const y = ((i * 211) % WORLD.height + fall) % WORLD.height;
        g.lineBetween(x, y, x - 6, y + 18);
      }
    }
  }

  private label(x: number, y: number, text: string, size: number, bold: boolean): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color: COLORS.label,
        align: 'center',
        backgroundColor: 'rgba(251, 249, 244, 0.88)',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(DEPTH.labels);
  }

  /** Жители: спрайт по направлению движения, 4 кадра шага, стоя — кадр «стоит» */
  private drawPeople(time: number): void {
    const sim = this.hooks.sim;
    sim.residents.forEach((r, i) => {
      const w = this.walkers[i];
      const s = w.sprite;
      s.setVisible(r.visible);
      if (!r.visible) {
        w.lastX = r.pos.x;
        w.lastY = r.pos.y;
        return;
      }
      const dx = r.pos.x - w.lastX;
      const dy = r.pos.y - w.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 0.01) {
        if (Math.abs(dx) > Math.abs(dy)) {
          w.facing = 'right';
          w.flip = dx < 0;
        } else {
          w.facing = dy > 0 ? 'down' : 'up';
          w.flip = false;
        }
      }
      w.lastX = r.pos.x;
      w.lastY = r.pos.y;
      // Шаг — 8 кадров в секунду реального времени, у каждого жителя свой сдвиг
      const phase = r.walking && this.hooks.getSpeed() > 0 ? 1 + (Math.floor(time / 125 + i * 0.37) % 4) : 0;
      s.setFrame(personFrame(r.kind, w.facing, phase))
        .setFlipX(w.flip)
        .setPosition(r.pos.x, r.pos.y)
        .setDepth(r.pos.y);
    });

    // Выбранный житель: кольцо у ног и маршрут
    const g = this.marks;
    g.clear();
    const sel = this.selected;
    if (!sel?.visible) return;
    g.setDepth(sel.pos.y - 0.1);
    if (sel.walking && sel.path.length > 0) {
      g.lineStyle(3, COLORS.path, 0.35);
      g.beginPath();
      g.moveTo(sel.pos.x, sel.pos.y);
      for (const p of sel.path) g.lineTo(p.x, p.y);
      g.strokePath();
    }
    g.lineStyle(3, 0xffffff, 1);
    g.strokeEllipse(sel.pos.x, sel.pos.y, 34, 14);
    g.lineStyle(2, COLORS.outline, 1);
    g.strokeEllipse(sel.pos.x, sel.pos.y, 38, 17);
  }

  /** Земля: клетки 40 × 40 запекаются в одну текстуру при старте */
  private drawGround(): void {
    const S = ART_SCALE;
    const cols = Math.ceil((WORLD.width + GRID.offsetX) / GRID.size);
    const rows = Math.ceil(WORLD.height / GRID.size);
    const canvas = this.textures.createCanvas('ground-map', WORLD.width * S, WORLD.height * S);
    if (!canvas) return;
    const ctx = canvas.getContext();
    const src = this.textures.get('ground').getSourceImage() as HTMLImageElement;
    const frames = ATLASES.ground.frames;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * GRID.size - GRID.offsetX;
        const y = row * GRID.size;
        const [fx, fy, fw, fh] = frames[groundTile(x, y)];
        ctx.drawImage(src, fx * S, fy * S, fw * S, fh * S, x * S, y * S, GRID.size * S, GRID.size * S);
      }
    }
    canvas.refresh();
    this.add.image(0, 0, 'ground-map').setOrigin(0).setScale(1 / S).setDepth(DEPTH.ground);
  }

  private drawBuildings(): void {
    for (const p of PLACES) {
      const sprite = BUILDING_SPRITE[p.id];
      if (!sprite) {
        if (p.kind === 'park') this.label(p.rect.x + p.rect.w / 2, PARK_TOP + 20, p.name, 20, true);
        continue;
      }
      const base = p.rect.y + p.rect.h;
      const img = this.add
        .image(p.rect.x, p.rect.y, 'buildings', sprite)
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth(base);
      if (p.id === 'cafe') this.cafeSprite = img;
      const lightFrame = p.id === 'cafe' ? 'building-cafe-lights' : `${sprite}-lights`;
      const light = this.add
        .image(p.rect.x, p.rect.y, 'lights', lightFrame)
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth(DEPTH.lights)
        .setVisible(false);
      this.windowLights.push({ place: p, image: light });
      if (p.kind !== 'cafe' && p.kind !== 'metro') this.label(p.rect.x + p.rect.w / 2, p.rect.y + 28, p.name, 18, false);
    }
  }

  private prop(frame: string, x: number, y: number): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, 'ground', frame)
      .setOrigin(0.5, 1)
      .setScale(1 / ART_SCALE)
      .setDepth(y);
  }
}

/** Какая клетка земли лежит в точке (x, y) — левый верхний угол клетки */
function groundTile(x: number, y: number): string {
  if (y >= PARK_TOP) return 'tile-grass';
  if (y >= ROAD.bottom) return 'tile-sidewalk';
  if (x >= ROAD.left && x < ROAD.right) {
    return x === ROAD.left + GRID.size ? 'tile-road-marking' : 'tile-road-asphalt';
  }
  if (x === ROAD.left - GRID.size) return 'tile-sidewalk-curb-left';
  if (x === ROAD.right) return 'tile-sidewalk-curb-right';
  if (x < GRID.offsetX || x >= WORLD.width - GRID.offsetX) return 'tile-grass';
  return 'tile-sidewalk';
}
