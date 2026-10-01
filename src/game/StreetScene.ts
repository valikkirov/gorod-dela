import Phaser from 'phaser';
import { GAME_MINUTES_PER_SECOND } from '../sim/clock';
import type { Resident } from '../sim/residents';
import type { Simulation } from '../sim/simulation';
import { PLACES, ROAD, SIDEWALK, WORLD, type Place } from '../sim/world';
import { COLORS, PLACE_FILL, RESIDENT_COLOR } from './palette';

export interface SceneHooks {
  sim: Simulation;
  getSpeed: () => number;
  onSelect: (resident: Resident | null) => void;
  onFrame: () => void;
}

const RADIUS = 9;

export class StreetScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private people!: Phaser.GameObjects.Graphics;
  private selected: Resident | null = null;

  constructor() {
    super('street');
  }

  init(hooks: SceneHooks): void {
    this.hooks = hooks;
  }

  create(): void {
    this.drawMap();
    this.people = this.add.graphics();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pick(p.worldX, p.worldY));
  }

  update(_time: number, delta: number): void {
    const realSeconds = Math.min(delta, 250) / 1000;
    this.hooks.sim.advance(realSeconds * GAME_MINUTES_PER_SECOND * this.hooks.getSpeed());
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

    const label = p.kind === 'metro' ? 'М  Метро' : p.name;
    this.add
      .text(x + w / 2, p.kind === 'park' ? y + 24 : y + h / 2, label, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: p.kind === 'cafe' ? '26px' : '22px',
        fontStyle: p.kind === 'cafe' || p.kind === 'metro' ? 'bold' : 'normal',
        color: p.kind === 'metro' ? '#ffffff' : COLORS.label,
        align: 'center',
      })
      .setOrigin(0.5)
      .setResolution(2);
  }
}
