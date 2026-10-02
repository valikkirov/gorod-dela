import Phaser from 'phaser';
import { GAME_MINUTES_PER_SECOND } from '../sim/clock';
import type { Resident } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { WANT_LABEL } from '../sim/demand';
import { formatMoney } from '../sim/economy';
import { place, PLACES, ROAD, SIDEWALK, WORLD, type Place } from '../sim/world';
import { COLORS, PLACE_FILL, RESIDENT_COLOR } from './palette';
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
function darkness(minute: number): number {
  const h = minute / 60;
  const MAX = 0.42;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return ((h - 18) / 3) * MAX;
  if (h >= 5 && h < 7) return ((7 - h) / 2) * MAX;
  return MAX;
}

const RADIUS = 9;

export class StreetScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private people!: Phaser.GameObjects.Graphics;
  private cafeShade!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Graphics;
  private sky!: Phaser.GameObjects.Graphics;
  private cafeName!: Phaser.GameObjects.Text;
  private cafeStatus!: Phaser.GameObjects.Text;
  private selected: Resident | null = null;

  constructor() {
    super('street');
  }

  init(hooks: SceneHooks): void {
    this.hooks = hooks;
  }

  create(): void {
    this.drawMap();
    this.night = this.add.graphics();
    this.sky = this.add.graphics().setDepth(5);
    this.cafeShade = this.add.graphics();
    const c = place('cafe').rect;
    this.cafeName = this.label(c.x + c.w / 2, c.y + c.h / 2 - 12, '', 26, true);
    this.cafeStatus = this.label(c.x + c.w / 2, c.y + c.h / 2 + 20, '', 17, false);
    this.people = this.add.graphics();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pick(p.worldX, p.worldY));
  }

  update(_time: number, delta: number): void {
    const realSeconds = Math.min(delta, 250) / 1000;
    this.hooks.sim.advance(realSeconds * GAME_MINUTES_PER_SECOND * this.hooks.getSpeed());
    this.handleEvents();
    this.drawCafe();
    this.drawSky(_time);
    this.drawPeople();
    this.hooks.onFrame();
  }

  select(resident: Resident | null): void {
    this.selected = resident;
    this.hooks.onSelect(resident);
  }

  private pick(x: number, y: number): void {
    let best: Resident | null = null;
    let bestDist = RADIUS * 2.2;
    for (const r of this.hooks.sim.residents) {
      if (!r.visible) continue;
      const d = Math.hypot(r.pos.x - x, r.pos.y - y);
      if (d < bestDist) {
        best = r;
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
        this.float(c.x + c.w / 2, c.y + 18, `+${formatMoney(e.price)}`, '#2e8b57', 24);
      } else if (e.type === 'reject') {
        const r = sim.residents[e.residentId];
        if (!r.visible) continue;
        const text =
          e.reason === 'not-open' ? `хочет ${WANT_LABEL[r.decision?.want ?? 'coffee']}` : REASON_SHORT[e.reason];
        this.float(r.pos.x, r.pos.y - 22, text, e.reason === 'not-open' ? '#5b6270' : '#c0392b', 18);
      } else if (e.type === 'aware') {
        const r = sim.residents[e.residentId];
        if (r.visible) this.float(r.pos.x, r.pos.y - 22, e.source === 'walk' ? 'заметил кафе' : 'узнал о кафе', '#2f6fb0', 16);
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
      .setDepth(10);
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
    this.cafeName.setText(cafe.opened ? 'Твоё кафе' : 'Сдаётся');
    this.cafeStatus.setText(cafe.opened ? (open ? 'открыто' : 'закрыто') : 'свободное помещение');
    this.cafeStatus.setColor(open ? '#2e8b57' : '#6b7080');
    // Вечером город темнеет; открытое кафе светится
    const dark = darkness(this.hooks.sim.minute);
    this.night.clear();
    if (dark > 0) {
      this.night.fillStyle(0x1b2340, dark);
      this.night.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    const g = this.cafeShade;
    g.clear();
    const r = place('cafe').rect;
    if (!cafe.opened) {
      g.fillStyle(0xffffff, 0.45);
      g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 12);
    } else if (open && dark > 0) {
      g.fillStyle(0xffd27a, Math.min(0.9, dark * 2.2));
      g.fillRoundedRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 12);
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
      })
      .setOrigin(0.5)
      .setResolution(2);
  }

  private drawPeople(): void {
    const g = this.people;
    g.clear();

    const sel = this.selected;
    if (sel?.walking && sel.path.length > 0) {
      g.lineStyle(2, COLORS.path, 0.35);
      g.beginPath();
      g.moveTo(sel.pos.x, sel.pos.y);
      for (const p of sel.path) g.lineTo(p.x, p.y);
      g.strokePath();
    }

    for (const r of this.hooks.sim.residents) {
      if (!r.visible) continue;
      g.fillStyle(0x000000, 0.15);
      g.fillCircle(r.pos.x + 1.5, r.pos.y + 2.5, RADIUS);
      g.fillStyle(RESIDENT_COLOR[r.kind], 1);
      g.fillCircle(r.pos.x, r.pos.y, RADIUS);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(r.pos.x, r.pos.y, RADIUS);
    }

    // Гости внутри кафе — видны через «витрину»
    const c = place('cafe').rect;
    let n = 0;
    for (const r of this.hooks.sim.residents) {
      if (r.placeId !== 'cafe' || r.walking) continue;
      const x = c.x + 22 + (n % 10) * 22;
      const y = c.y + c.h - 18 - Math.floor(n / 10) * 20;
      g.fillStyle(RESIDENT_COLOR[r.kind], 1);
      g.fillCircle(x, y, 7);
      if (r === sel) {
        g.lineStyle(3, COLORS.outline, 1);
        g.strokeCircle(x, y, 12);
      }
      n++;
    }

    if (sel?.visible) {
      g.lineStyle(3, COLORS.outline, 1);
      g.strokeCircle(sel.pos.x, sel.pos.y, RADIUS + 6);
    }
  }

  private drawMap(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ground, 1);
    g.fillRect(0, 0, WORLD.width, WORLD.height);

    // Тротуары и дорога
    g.fillStyle(COLORS.sidewalk, 1);
    g.fillRect(ROAD.left - SIDEWALK.width, ROAD.top, ROAD.right - ROAD.left + SIDEWALK.width * 2, ROAD.bottom);
    g.fillStyle(COLORS.road, 1);
    g.fillRect(ROAD.left, ROAD.top, ROAD.right - ROAD.left, ROAD.bottom);
    g.fillStyle(COLORS.roadMark, 0.8);
    const cx = (ROAD.left + ROAD.right) / 2;
    for (let y = 120; y < ROAD.bottom - 20; y += 48) g.fillRect(cx - 3, y, 6, 24);

    for (const p of PLACES) this.drawPlace(g, p);
  }

  private drawPlace(g: Phaser.GameObjects.Graphics, p: Place): void {
    const { x, y, w, h } = p.rect;
    g.fillStyle(PLACE_FILL[p.kind], 1);
    g.fillRoundedRect(x, y, w, h, 14);

    if (p.kind === 'park') {
      g.fillStyle(0x7fb069, 1);
      const trees: [number, number, number][] = [
        [70, 1070, 26], [150, 1200, 32], [600, 1080, 30], [660, 1210, 22], [250, 1110, 20], [520, 1215, 24],
      ];
      for (const [tx, ty, tr] of trees) g.fillCircle(tx, ty, tr);
      g.fillStyle(0xa0855b, 1);
      g.fillRect(330, 1150, 60, 10);
      g.fillRect(420, 1100, 10, 50);
    } else {
      g.lineStyle(p.kind === 'cafe' ? 4 : 2, COLORS.outline, p.kind === 'cafe' ? 1 : 0.35);
      g.strokeRoundedRect(x, y, w, h, 14);
      // Вход
      g.fillStyle(COLORS.outline, 0.85);
      if (p.side === 'center') g.fillRect(p.door.x - 20, p.door.y - 4, 40, 8);
      else g.fillRect(p.door.x - 4, p.door.y - 16, 8, 32);
    }

    if (p.kind === 'cafe') return; // подпись кафе живая — см. drawCafe
    const label = p.kind === 'metro' ? 'М  Метро' : p.name;
    this.add
      .text(x + w / 2, p.kind === 'park' ? y + 24 : y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: p.kind === 'metro' ? 'bold' : 'normal',
        color: p.kind === 'metro' ? '#ffffff' : COLORS.label,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(2);
  }
}
