import Phaser from 'phaser';
import { GAME_MINUTES_PER_SECOND } from '../sim/clock';
import type { Resident } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { WANT_LABEL } from '../sim/demand';
import { formatMoney } from '../sim/economy';
import { PARK_TOP, place, PLACES, ROAD, WORLD, GRID, type Place } from '../sim/world';
import { COLORS, RESIDENT_COLOR } from './palette';
import { ART_SCALE, ATLASES, personFrame, RESIDENT_SIZE, textureOf, type Accessory, type Facing } from './atlas';
import { Traffic } from './traffic';
import { Art2, preloadArt2 } from './art2';
import { sound } from './sound';
import type { RejectReason } from '../sim/cafe';

export interface SceneHooks {
  sim: Simulation;
  getSpeed: () => number;
  onSelect: (resident: Resident | null) => void;
  /** Нажали на здание (или на пустое место — null) */
  onPlace: (place: Place | null) => void;
  /** Компьютерная раскладка: карта целиком по высоте, а не по ширине */
  wide: () => boolean;
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
  rival: 'к конкуренту',
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
  kiosk: 'building-kiosk-rent',
  'home-2': 'building-home-c-left',
  'office-north': 'building-office-left',
  'office-bc': 'building-bc-right',
  shop: 'building-shop-right',
  'home-3': 'building-home-d-right',
  'home-4': 'building-home-b-right',
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
  ['prop-bus-stop', 520, 1040],
];

/** Помещения под бизнес игрока: спрайты «сдаётся» и «открыто», окна, подписи */
const PREMISES_ART: Record<string, { rent: string; open: string; lights: string; rival: string; windows: { x: number; y: number; w: number; h: number }[]; labelX: number; labelY: number }> = {
  cafe: { rent: 'building-cafe-rent', open: 'building-cafe-open', lights: 'building-cafe-lights', rival: 'building-cafe-rival', windows: [], labelX: 120, labelY: 32 },
  kiosk: { rent: 'building-kiosk-rent', open: 'building-kiosk-open', lights: 'building-kiosk-lights', rival: 'building-kiosk-rival', windows: [{ x: 12, y: 46, w: 64, h: 14 }], labelX: 60, labelY: 106 },
};

interface Shop {
  place: Place;
  sprite: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

/** Окна кафе в координатах спрайта: гости видны в витринах, ночью и вне часов работы — темно */
const CAFE_WINDOWS = [
  { x: 15, y: 147, w: 94, h: 32 },
  { x: 127, y: 147, w: 48, h: 32 },
];
const CAFE_DOOR_GLASS = { x: 192, y: 148, w: 24, h: 18 };

interface Walker {
  sprite: Phaser.GameObjects.Image;
  /** Аксессуар поверх жителя: портфель, рюкзак, трость, стаканчик, пакет */
  acc: Phaser.GameObjects.Image;
  /** До какой минуты игры в руке стаканчик (купил у тебя) и пакет (вышел из «Продуктов») */
  coffeeUntil: number;
  bagUntil: number;
  inShop: boolean;
  facing: Facing;
  flip: boolean;
  lastX: number;
  lastY: number;
}

export class StreetScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private marks!: Phaser.GameObjects.Graphics;
  /** Звёздочки над знакомыми лицами */
  private faces!: Phaser.GameObjects.Graphics;
  private guests!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Graphics;
  private sky!: Phaser.GameObjects.Graphics;
  private shops: Shop[] = [];
  private menuBoard!: Phaser.GameObjects.Image;
  /** Деревянный настил с кашпо и скамьёй — у кафе с залом, когда в нём кто-то работает */
  private terrace!: Phaser.GameObjects.Image;
  /** Улучшения и события, видимые на улице */
  private showcase!: Phaser.GameObjects.Image;
  private interior!: Phaser.GameObjects.Image;
  private noCoffee!: Phaser.GameObjects.Image;
  private tent!: Phaser.GameObjects.Image;
  /** Свет ночью: пятна под фонарями и от витрин */
  private pools: Phaser.GameObjects.Image[] = [];
  private spills: { place: Place; image: Phaser.GameObjects.Image }[] = [];
  traffic!: Traffic;
  private windowLights: { place: Place; image: Phaser.GameObjects.Image }[] = [];
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private art2!: Art2;
  private walkers: Walker[] = [];
  private guestSpots: { r: Resident; x: number; y: number }[] = [];
  private selected: Resident | null = null;
  private selectedPlace: Place | null = null;
  private highlight!: Phaser.GameObjects.Graphics;
  /** Подписи на карте: держим их читаемыми при любом масштабе */
  private labels: Phaser.GameObjects.Text[] = [];
  /** Камера: центр в координатах мира и масштаб. Пока игрок не трогал масштаб — подбираем сами */
  private view = { cx: WORLD.width / 2, cy: 0, zoom: 1, auto: true };
  private touches = new Map<number, { x: number; y: number }>();
  private gesture: { x: number; y: number; moved: boolean; pinch: number; zoom: number } | null = null;

  constructor() {
    super('street');
  }

  init(hooks: SceneHooks): void {
    this.hooks = hooks;
  }

  preload(): void {
    for (const [key, atlas] of Object.entries(ATLASES)) this.load.image(key, atlas.url);
    preloadArt2(this);
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
    const cBase = c.rect.y + c.rect.h;
    this.terrace = this.prop('prop-cafe-terrace', c.rect.x + 12 + 90, cBase + 23).setDepth(cBase + 0.2);
    this.showcase = this.add
      .image(c.rect.x + CAFE_WINDOWS[0].x, c.rect.y + CAFE_WINDOWS[0].y, textureOf('overlay-cafe-showcase'), 'overlay-cafe-showcase')
      .setOrigin(0)
      .setScale(1 / ART_SCALE)
      .setDepth(cBase + 0.1);
    this.interior = this.add
      .image(c.rect.x, c.rect.y, textureOf('overlay-cafe-interior'), 'overlay-cafe-interior')
      .setOrigin(0)
      .setScale(1 / ART_SCALE)
      .setDepth(cBase + 0.3);
    this.art2 = new Art2(
      this,
      this.windowLights.map(({ place: p, image }) => ({ place: p, sprite: this.buildingSprites.get(p.id)!, light: image })),
      [this.showcase, this.interior],
    );
    this.noCoffee = this.prop('prop-sign-no-coffee', c.rect.x + 204 - 30, cBase + 6).setDepth(cBase + 0.4);
    // Палатка фестиваля — в сквере у входа с улицы
    this.tent = this.prop('prop-festival-tent', 150, PARK_TOP + 150);
    for (const [frame, x, y] of PROPS) {
      if (frame !== 'prop-lamp') continue;
      this.pools.push(this.light('light-lamp-pool', x, y + 6));
    }
    for (const p of PLACES) {
      if (p.kind !== 'cafe' && p.kind !== 'shop') continue;
      const base = p.rect.y + p.rect.h;
      const spill = this.light('light-shop-spill', p.rect.x + p.rect.w / 2, base + 14);
      if (p.id === 'kiosk') spill.setScale(0.6 / ART_SCALE);
      this.spills.push({ place: p, image: spill });
    }
    this.traffic = new Traffic(this, this.hooks.sim);

    this.guests = this.add.graphics().setDepth(c.rect.y + c.rect.h + 0.5);
    this.marks = this.add.graphics();
    this.faces = this.add.graphics().setDepth(DEPTH.labels);
    this.night = this.add.graphics().setDepth(DEPTH.night);
    this.sky = this.add.graphics().setDepth(DEPTH.sky);
    for (const shop of this.shops) {
      const art = PREMISES_ART[shop.place.id];
      const x = shop.place.rect.x + art.labelX;
      const y = shop.place.rect.y + art.labelY;
      shop.name = this.label(x, y, '', 20, true);
      shop.status = this.label(x, y + 30, '', 16, false);
    }

    this.walkers = this.hooks.sim.residents.map((r) => ({
      sprite: this.add
        .image(r.pos.x, r.pos.y, 'people', personFrame(r.kind, 'down', 0))
        .setOrigin(0.5, RESIDENT_SIZE.feet / RESIDENT_SIZE.h)
        .setScale(1 / ART_SCALE),
      acc: this.add
        .image(r.pos.x, r.pos.y, textureOf('acc-cane-down'), 'acc-cane-down')
        .setOrigin(0.5, RESIDENT_SIZE.feet / RESIDENT_SIZE.h)
        .setScale(1 / ART_SCALE)
        .setVisible(false),
      coffeeUntil: -1,
      bagUntil: -1,
      inShop: false,
      facing: 'down' as Facing,
      flip: false,
      lastX: r.pos.x,
      lastY: r.pos.y,
    }));
    this.highlight = this.add.graphics().setDepth(DEPTH.labels - 0.5);
    this.setupCamera();
  }

  // ——— Камера: перетаскивание, щипок, колесо, кнопки ———
  // Канвас рисуется в физических пикселях экрана (чётко на телефонах), поэтому все «экранные»
  // размеры ниже умножаются на px — сколько пикселей канваса в одном CSS-пикселе.

  private get px(): number {
    return 1 / this.scale.zoom;
  }

  /** Масштаб «по размеру»: на телефоне улица во всю ширину, на компьютере — целиком по высоте */
  private baseZoom(): number {
    const { width: w, height: h } = this.scale;
    const contain = Math.min(w / WORLD.width, h / WORLD.height);
    return this.hooks.wide() ? contain : Math.max(contain, w / WORLD.width);
  }

  private zoomLimits(): [number, number] {
    const { width: w, height: h } = this.scale;
    const contain = Math.min(w / WORLD.width, h / WORLD.height);
    return [contain, Math.max(this.baseZoom() * 2.6, 1.4 * this.px)];
  }

  /** Сколько CSS-пикселей снизу карты закрыто нижним листом */
  private covered = 0;

  private setupCamera(): void {
    this.cameras.main.setBackgroundColor('#9cc27a');
    this.input.addPointer(1);
    // Свёрнутый лист закругляется поверх карты на 14 px
    if (!this.covered && !this.hooks.wide()) this.covered = 14;
    // Начинаем сверху улицы: там метро и свободные помещения
    this.view.zoom = this.baseZoom();
    this.view.cy = 0;
    this.fitViewport();
    this.scale.on('resize', () => {
      if (this.view.auto) this.view.zoom = this.baseZoom();
      this.fitViewport();
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.touches.set(p.id, { x: p.x, y: p.y });
      if (this.touches.size === 1) this.gesture = { x: p.x, y: p.y, moved: false, pinch: 0, zoom: this.view.zoom };
      else if (this.gesture) {
        const [a, b] = [...this.touches.values()];
        this.gesture.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.gesture.zoom = this.view.zoom;
        this.gesture.moved = true;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const prev = this.touches.get(p.id);
      if (!prev || !this.gesture || !p.isDown) return;
      if (this.touches.size >= 2 && this.gesture.pinch > 0) {
        const old = [...this.touches.values()];
        const midOld = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
        this.touches.set(p.id, { x: p.x, y: p.y });
        const [a, b] = [...this.touches.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = this.gesture.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.gesture.pinch);
        // Сдвиг пальцев двигает карту, разведение — масштабирует вокруг середины
        this.pan(mid.x - midOld.x, mid.y - midOld.y);
        this.zoomAt(mid.x, mid.y, z);
        return;
      }
      this.touches.set(p.id, { x: p.x, y: p.y });
      if (!this.gesture.moved && Math.hypot(p.x - this.gesture.x, p.y - this.gesture.y) < 8 * this.px) return;
      this.gesture.moved = true;
      this.pan(p.x - prev.x, p.y - prev.y);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (!this.touches.has(p.id)) return;
      this.touches.delete(p.id);
      if (this.touches.size > 0) return;
      const g = this.gesture;
      this.gesture = null;
      if (g && !g.moved) this.pick(...this.toWorld(p.x, p.y));
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomAt(p.x, p.y, this.view.zoom * Math.exp(-dy * 0.0015));
    });
  }

  /** Камера рисует только видимую часть: то, что под нижним листом, в кадр не считается */
  private fitViewport(): void {
    const cam = this.cameras.main;
    const { width: w, height: h } = this.scale;
    const vh = Math.max(80, h - this.covered * this.px);
    if (cam.width !== w || cam.height !== vh) {
      // Верх карты остаётся на месте — лист наезжает снизу
      const top = this.view.cy - cam.height / 2 / this.view.zoom;
      cam.setViewport(0, 0, w, vh);
      this.view.cy = top + vh / 2 / this.view.zoom;
    }
    this.applyView();
  }

  /** Нижний лист открылся или закрылся: сколько CSS-пикселей карты он теперь закрывает */
  setCovered(css: number): void {
    this.covered = Math.max(0, css);
    if (!this.highlight) return; // сцена ещё не создана — применится при создании
    this.fitViewport();
    if (this.selectedPlace) this.reveal(this.selectedPlace.rect);
    else if (this.selected?.visible) this.reveal({ x: this.selected.pos.x - 20, y: this.selected.pos.y - 60, w: 40, h: 70 });
  }

  private toWorld(sx: number, sy: number): [number, number] {
    const cam = this.cameras.main;
    return [this.view.cx + (sx - cam.width / 2) / this.view.zoom, this.view.cy + (sy - cam.height / 2) / this.view.zoom];
  }

  private pan(dx: number, dy: number): void {
    this.view.cx -= dx / this.view.zoom;
    this.view.cy -= dy / this.view.zoom;
    this.applyView();
  }

  /** Масштаб вокруг точки экрана: то, что под пальцем, остаётся под пальцем */
  private zoomAt(sx: number, sy: number, zoom: number): void {
    const [lo, hi] = this.zoomLimits();
    const z = Phaser.Math.Clamp(zoom, lo, hi);
    const [wx, wy] = this.toWorld(sx, sy);
    const cam = this.cameras.main;
    this.view.zoom = z;
    this.view.auto = false;
    this.view.cx = wx - (sx - cam.width / 2) / z;
    this.view.cy = wy - (sy - cam.height / 2) / z;
    this.applyView();
  }

  /** Кнопки +/−: масштаб вокруг центра экрана; «вся улица» — вернуть исходный вид */
  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    this.zoomAt(cam.width / 2, cam.height / 2, this.view.zoom * factor);
  }

  fitView(): void {
    const [lo] = this.zoomLimits();
    // Повторное нажатие на «вся улица», когда масштаб уже исходный, — показать улицу целиком
    const base = this.baseZoom();
    this.view.zoom = Math.abs(this.view.zoom - base) < 0.01 ? lo : base;
    this.view.auto = this.view.zoom === base;
    this.view.cx = WORLD.width / 2;
    this.applyView();
  }

  private applyView(): void {
    const cam = this.cameras.main;
    const v = this.view;
    const [lo, hi] = this.zoomLimits();
    v.zoom = Phaser.Math.Clamp(v.zoom, lo, hi);
    const vw = cam.width / v.zoom;
    const vh = cam.height / v.zoom;
    v.cx = vw >= WORLD.width ? WORLD.width / 2 : Phaser.Math.Clamp(v.cx, vw / 2, WORLD.width - vw / 2);
    v.cy = vh >= WORLD.height ? WORLD.height / 2 : Phaser.Math.Clamp(v.cy, vh / 2, WORLD.height - vh / 2);
    cam.setZoom(v.zoom);
    cam.centerOn(v.cx, v.cy);
    // Подписи не мельче ~11 px на экране
    const k = Math.max(1, (0.62 * this.px) / v.zoom);
    for (const l of this.labels) l.setScale(k);
  }

  /** Прокрутить карту так, чтобы прямоугольник был в кадре (если уже виден — не трогаем) */
  private reveal(r: { x: number; y: number; w: number; h: number }): void {
    const cam = this.cameras.main;
    const v = this.view;
    const vw = cam.width / v.zoom;
    const vh = cam.height / v.zoom;
    const inX = r.x >= v.cx - vw / 2 && r.x + r.w <= v.cx + vw / 2;
    const inY = r.y >= v.cy - vh / 2 && r.y + r.h <= v.cy + vh / 2;
    if (inX && inY) return;
    v.cx = r.x + r.w / 2;
    v.cy = r.y + r.h / 2;
    this.applyView();
  }

  update(time: number, delta: number): void {
    const realSeconds = Math.min(delta, 250) / 1000;
    this.hooks.sim.advance(realSeconds * GAME_MINUTES_PER_SECOND * this.hooks.getSpeed());
    this.handleEvents();
    this.drawCafe();
    this.drawNight();
    this.art2.sync();
    this.drawSky(time);
    this.drawPeople(time);
    this.traffic.update(realSeconds * this.hooks.getSpeed(), this.hooks.sim.minute);
    this.updateSound();
    this.hooks.onFrame();
  }

  select(resident: Resident | null): void {
    this.selected = resident;
    if (resident) this.selectPlace(null, false);
    this.hooks.onSelect(resident);
  }

  selectPlace(p: Place | null, notify = true): void {
    this.selectedPlace = p;
    const g = this.highlight;
    g.clear();
    if (p && p.kind !== 'park') {
      const r = p.rect;
      g.lineStyle(6, 0xffffff, 0.95);
      g.strokeRoundedRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10);
      g.lineStyle(3, COLORS.outline, 1);
      g.strokeRoundedRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 12);
    }
    if (p) this.reveal(p.rect);
    if (notify) {
      if (p) this.selected = null;
      this.hooks.onPlace(p);
    }
  }

  private pick(x: number, y: number): void {
    let best: Resident | null = null;
    // Палец толще курсора: на мелком масштабе радиус попадания больше
    let bestDist = Math.max(26, (20 * this.px) / this.view.zoom);
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
    if (best) {
      this.select(best);
      return;
    }
    // Мимо жителей — может, в здание или сквер
    const hit = PLACES.find((p) => x >= p.rect.x && x <= p.rect.x + p.rect.w && y >= p.rect.y && y <= p.rect.y + p.rect.h);
    if (hit) {
      this.selectPlace(hit === this.selectedPlace ? null : hit);
      return;
    }
    if (this.selectedPlace) this.selectPlace(null);
    else this.select(null);
  }

  private handleEvents(): void {
    const sim = this.hooks.sim;
    for (const e of sim.drainEvents()) {
      if (e.type === 'sale') {
        sound.sale();
        // Купил кофе — выходит со стаканчиком (в зале допивает на месте, но стакан с собой тоже бывает)
        if (sim.cafe.menu.find((m) => m.id === e.itemId)?.kind === 'coffee') this.walkers[e.residentId].coffeeUntil = sim.time + COFFEE_MINUTES;
        if (sim.cafe.menu.find((m) => m.id === e.itemId)?.kind === 'coffee' && Math.random() < 0.3) sound.play('sfx-coffee', 0.6);
        const c = place(sim.shopId).rect;
        this.float(c.x + c.w / 2, c.y + Math.min(c.h - 70, 30), `+${formatMoney(e.price)}`, '#2e8b57', 24);
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
      } else if (e.type === 'rival' && sim.rival) {
        const c = place(sim.rival.placeId).rect;
        this.float(c.x + c.w / 2, c.y + 40, e.what === 'open' ? 'Открылся конкурент' : 'У конкурента акция', '#c0392b', 22);
      } else if (e.type === 'bankrupt') {
        this.hooks.onBankrupt();
      }
    }
  }

  private wasOpen = false;
  private wasBroken = false;

  /** Звук улицы по времени суток и погоде; дверь утром и поломка — по смене состояния */
  private updateSound(): void {
    const sim = this.hooks.sim;
    sound.update(sim.minute, sim.weather.kind === 'rain', sim.effects.some((e) => e.type === 'boost' && e.day === sim.today));
    const open = sim.cafe.opened && sim.cafe.isOpenAt(sim.minute);
    if (open && !this.wasOpen) sound.play('sfx-door', 0.7);
    this.wasOpen = open;
    const broken = sim.effects.some((e) => e.type === 'broken' && sim.time < e.until);
    if (broken && !this.wasBroken) sound.play('sfx-broken', 0.8);
    this.wasBroken = broken;
  }

  /** Всплывающая подпись: поднимается и тает за ~1,5 с реального времени */
  private floats = 0;

  private float(x: number, y: number, text: string, color: string, size: number): void {
    // На высокой скорости событий много — не заваливаем экран надписями
    if (this.floats >= 8) return;
    this.floats++;
    // На мелком масштабе подпись крупнее в мире, чтобы на экране оставалась читаемой (~12 px)
    const px = Math.round(Math.max(size, (13 * this.px) / this.view.zoom));
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${px}px`,
        fontStyle: 'bold',
        color,
        stroke: '#ffffff',
        strokeThickness: Math.round(px / 3.2),
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
    const sim = this.hooks.sim;
    const { cafe } = sim;
    const open = cafe.isOpenAt(sim.minute);
    const mineId = cafe.opened ? sim.shopId : null;
    const rival = sim.rival && sim.cafe.opened && sim.today >= sim.rival.opensDay ? sim.rival : null;
    for (const shop of this.shops) {
      const art = PREMISES_ART[shop.place.id];
      const mine = shop.place.id === mineId;
      const theirs = rival?.placeId === shop.place.id;
      const theirsOpen = theirs && rival!.isOpen(sim.today, sim.minute);
      const frame = theirs ? art.rival : mine ? art.open : art.rent;
      if (shop.sprite.frame.name !== frame) shop.sprite.setTexture(textureOf(frame), frame);
      const lights = this.windowLights.find((w) => w.place === shop.place)?.image;
      const lightFrame = theirs ? `${art.rival}-lights` : art.lights;
      if (lights && lights.frame.name !== lightFrame) lights.setTexture(textureOf(lightFrame), lightFrame);
      // До открытия подписаны оба помещения; после — своё и конкурент
      const name = mine ? cafe.title : theirs ? rival!.t.name : cafe.opened ? '' : 'Сдаётся';
      const status = mine ? (open ? 'открыто' : 'закрыто') : theirs ? `конкурент · ${theirsOpen ? 'открыто' : 'закрыто'}` : cafe.opened ? '' : shop.place.name;
      shop.name.setText(name).setVisible(name !== '');
      shop.status.setText(status).setVisible(status !== '');
      shop.status.setColor(mine && open ? '#2e8b57' : theirs ? '#c0392b' : '#6b7080');
      // Подпись не уезжает за левый край карты, даже когда длинная
      const x0 = shop.place.rect.x + art.labelX;
      const half = Math.max(shop.name.displayWidth, shop.status.displayWidth) / 2 + 6;
      shop.name.setX(Math.max(x0, half));
      shop.status.setX(Math.max(x0, half));
    }
    this.menuBoard.setVisible(mineId === 'cafe');
    this.terrace.setVisible(mineId === 'cafe' || rival?.placeId === 'cafe');
    this.showcase.setVisible(mineId === 'cafe' && cafe.has('showcase') && open);
    this.interior.setVisible(mineId === 'cafe' && cafe.has('interior'));
    const broken = sim.effects.some((e) => e.type === 'broken' && !e.slow && sim.time < e.until);
    this.noCoffee.setVisible(mineId === 'cafe' && broken);
    this.tent.setVisible(sim.effects.some((e) => e.type === 'boost' && e.day === sim.today));

    // Гости в витринах; когда закрыто — свет в окнах погашен
    const g = this.guests;
    g.clear();
    this.guestSpots = [];
    if (!mineId) return;
    const r = place(mineId).rect;
    if (!open) {
      g.fillStyle(0x4a5563, 0.7);
      const windows = mineId === 'cafe' ? [...CAFE_WINDOWS, CAFE_DOOR_GLASS] : PREMISES_ART[mineId].windows;
      for (const w of windows) g.fillRect(r.x + w.x, r.y + w.y, w.w, w.h);
      return;
    }
    if (mineId !== 'cafe') return; // в киоске не сидят
    const spots: { x: number; y: number }[] = [];
    for (const w of CAFE_WINDOWS) for (let x = w.x + 8; x < w.x + w.w - 4; x += 12) spots.push({ x: r.x + x, y: r.y + w.y + 20 });
    let n = 0;
    for (const res of this.hooks.sim.residents) {
      if (res.placeId !== mineId || res.walking || n >= spots.length) continue;
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
    for (const pool of this.pools) pool.setAlpha(k).setVisible(k > 0.01);
    for (const { place: p, image } of this.spills) {
      const open =
        p.kind === 'shop'
          ? h >= 8 && h < 22
          : (sim.cafe.opened && p.id === sim.shopId && sim.cafe.isOpenAt(minute)) || (sim.rival?.placeId === p.id && sim.rival.isOpen(sim.today, minute));
      const a = open ? k : 0;
      image.setAlpha(a).setVisible(a > 0.01);
    }
    for (const { place: p, image } of this.windowLights) {
      let on = 0;
      if (p.kind === 'cafe')
        on = sim.cafe.opened && p.id === sim.shopId ? (sim.cafe.isOpenAt(minute) ? 1 : 0) : sim.rival?.placeId === p.id && sim.rival.isOpen(sim.today, minute) ? 1 : 0;
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
    const t = this.add
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
    t.setScale(Math.max(1, (0.62 * this.px) / this.view.zoom));
    this.labels.push(t);
    return t;
  }

  /** Жители: спрайт по направлению движения, 4 кадра шага, стоя — кадр «стоит» */
  private drawPeople(time: number): void {
    const sim = this.hooks.sim;
    sim.residents.forEach((r, i) => {
      const w = this.walkers[i];
      const s = w.sprite;
      s.setVisible(r.visible);
      if (!r.visible) w.acc.setVisible(false);
      if (!r.visible) {
        if (r.placeId === 'shop') w.inShop = true;
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
      // Аксессуар: что в руках сейчас, иначе — то, что носит этот тип жителя
      if (r.placeId === 'shop' && !r.walking) w.inShop = true;
      else if (w.inShop && r.walking) {
        w.inShop = false;
        w.bagUntil = sim.time + BAG_MINUTES;
      }
      const acc: Accessory | undefined =
        sim.time < w.coffeeUntil ? 'coffee' : sim.time < w.bagUntil ? 'shopping-bag' : KIND_ACCESSORY[r.kind];
      if (acc) {
        // Покачивается в такт шагу: на шагах 1 и 3 чуть выше
        const bob = phase % 2 === 1 ? -0.7 : 0;
        w.acc
          .setFrame(`acc-${acc}-${w.facing}`)
          .setFlipX(w.flip)
          .setPosition(r.pos.x, r.pos.y + bob)
          .setDepth(r.pos.y + 0.01)
          .setVisible(true);
      } else w.acc.setVisible(false);
    });

    // Знакомые лица: звёздочка над головой — золотая у постоянных
    const f = this.faces;
    f.clear();
    for (const reg of sim.regulars) {
      const r = sim.residents[reg.residentId];
      if (!r.visible) continue;
      drawStar(f, r.pos.x, r.pos.y - 56, reg.status === 'regular' ? 0xf2b33d : 0xffffff);
    }

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
      // Названия домов не висят на крышах: нажми на здание — название и жильцы будут в панели
      if (!sprite) continue;
      const base = p.rect.y + p.rect.h;
      const img = this.add
        .image(p.rect.x, p.rect.y, textureOf(sprite), sprite)
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth(base);
      this.buildingSprites.set(p.id, img);
      const art = PREMISES_ART[p.id];
      if (art) this.shops.push({ place: p, sprite: img } as Shop);
      const lightFrame = art ? art.lights : `${sprite}-lights`;
      const light = this.add
        .image(p.rect.x, p.rect.y, textureOf(lightFrame), lightFrame)
        .setOrigin(0)
        .setScale(1 / ART_SCALE)
        .setDepth(DEPTH.lights)
        .setVisible(false);
      this.windowLights.push({ place: p, image: light });
    }
  }

  /** Свет поверх ночной улицы: мягкое пятно с центром в точке */
  private light(frame: string, x: number, y: number): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, textureOf(frame), frame)
      .setScale(1 / ART_SCALE)
      .setDepth(DEPTH.lights)
      .setVisible(false);
  }

  private prop(frame: string, x: number, y: number): Phaser.GameObjects.Image {
    return this.add
      .image(x, y, textureOf(frame), frame)
      .setOrigin(0.5, 1)
      .setScale(1 / ART_SCALE)
      .setDepth(y);
  }
}

/** Кто что носит всегда; стаканчик и пакет — на время */
const KIND_ACCESSORY: Partial<Record<Resident['kind'], Accessory>> = { office: 'briefcase', student: 'backpack', pensioner: 'cane' };
const COFFEE_MINUTES = 30;
const BAG_MINUTES = 40;

/** Ряд клеток с пешеходным переходом */
const CROSSWALK_Y = 520;

/** Какая клетка земли лежит в точке (x, y) — левый верхний угол клетки */
function groundTile(x: number, y: number): string {
  if (y >= PARK_TOP) return 'tile-grass';
  if (y >= ROAD.bottom) return 'tile-sidewalk';
  if (x >= ROAD.left && x < ROAD.right) {
    // Переход между кафе и «Продуктами»
    if (y === CROSSWALK_Y) return 'tile-road-crosswalk';
    return x === ROAD.left + GRID.size ? 'tile-road-marking' : 'tile-road-asphalt';
  }
  if (x === ROAD.left - GRID.size) return 'tile-sidewalk-curb-left';
  if (x === ROAD.right) return 'tile-sidewalk-curb-right';
  if (x < GRID.offsetX || x >= WORLD.width - GRID.offsetX) return 'tile-grass';
  return 'tile-sidewalk';
}

/** Пятиконечная звёздочка с контуром, ~12 px */
function drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 11 : 5;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rad, y + Math.sin(a) * rad));
  }
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  g.lineStyle(2, COLORS.outline, 1);
  g.strokePoints(pts, true);
}
