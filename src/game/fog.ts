// «Туман войны» вокруг района: облака закрывают всё, что дальше границ (лес, насыпи, река видны
// только у края), край облаков неровный — как у берега в стратегиях. Считается один раз при старте:
// облачная текстура на холсте, сверху — маска прозрачности по расстоянию от района плюс шум.
// Второй слой облаков медленно плывёт — туман живой.
import Phaser from 'phaser';
import { WORLD } from '../sim/world';

/** Сколько мира закрывает туман вокруг района (дальше камера не уходит) */
export const FOG_FAR = 1400;
/** Где начинается туман и где он становится сплошным — расстояние от края мира наружу */
const EDGE = { from: 150, to: 330 };
/** Насколько край гуляет туда-сюда (шум), в единицах мира */
const WOBBLE = 150;
/** Холст тумана мельче мира: 1 пиксель — RES единиц мира (облака мягкие, деталей не нужно) */
const RES = 4;
/** Размер облачной текстуры на карте, в единицах мира */
const CLOUD_TILE = 900;

/** Плавный шум по сетке со сглаживанием: одинаковый при каждом запуске */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Несколько октав: крупные заливы и мелкие клочки */
function fbm(x: number, y: number): number {
  let sum = 0;
  let amp = 0.55;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise(x * f, y * f);
    f *= 2.1;
    amp *= 0.5;
  }
  return sum; // ~0…1
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Fog {
  private drift: Phaser.GameObjects.TileSprite[] = [];

  constructor(scene: Phaser.Scene, depth: number) {
    const left = -FOG_FAR;
    const top = -FOG_FAR;
    const w = WORLD.width + 2 * FOG_FAR;
    const h = WORLD.height + 2 * FOG_FAR;
    const cw = Math.ceil(w / RES);
    const ch = Math.ceil(h / RES);
    // Туман одинаковый во всех районах: посчитан при первом показе — берём готовый
    if (!scene.textures.exists('fog-map')) this.paint(scene, cw, ch, left, top);
    scene.add.image(left, top, 'fog-map').setOrigin(0).setScale(RES).setDepth(depth);
    this.addDrift(scene, depth, left, top, w);
  }

  private paint(scene: Phaser.Scene, cw: number, ch: number, left: number, top: number): void {
    const tex = scene.textures.createCanvas('fog-map', cw, ch);
    if (!tex) return;
    const ctx = tex.getContext();
    // Облака: текстура повторяется, привязана к миру
    const img = scene.textures.get('tex-clouds').getSourceImage() as HTMLImageElement;
    const tile = CLOUD_TILE / RES;
    for (let y = 0; y < ch; y += tile) for (let x = 0; x < cw; x += tile) ctx.drawImage(img, x, y, tile, tile);
    // Маска: прозрачно над районом, плотнее к краю, край неровный
    const data = ctx.getImageData(0, 0, cw, ch);
    const px = data.data;
    for (let j = 0; j < ch; j++) {
      const wy = top + j * RES;
      const dy = wy < 0 ? -wy : wy > WORLD.height ? wy - WORLD.height : 0;
      for (let i = 0; i < cw; i++) {
        const wx = left + i * RES;
        const dx = wx < 0 ? -wx : wx > WORLD.width ? wx - WORLD.width : 0;
        // Расстояние от прямоугольника района наружу (внутри — отрицательное, по ближнему краю)
        let d = Math.hypot(dx, dy);
        if (dx === 0 && dy === 0) d = -Math.min(wx, WORLD.width - wx, wy, WORLD.height - wy);
        const n = (fbm(wx / 190, wy / 190) - 0.5) * 2 * WOBBLE;
        const a = smooth(EDGE.from, EDGE.to, d + n);
        const k = (j * cw + i) * 4;
        px[k + 3] = Math.round(a * 255);
        // У самого края облака чуть темнее снизу — край читается объёмом
        if (a > 0 && a < 0.6) {
          const shade = 1 - 0.12 * (1 - a / 0.6);
          px[k] *= shade;
          px[k + 1] *= shade;
          px[k + 2] *= shade;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    tex.refresh();
  }

  private addDrift(scene: Phaser.Scene, depth: number, left: number, top: number, w: number): void {
    // Плывущий слой: только там, где туман уже сплошной (за краем EDGE.to + WOBBLE)
    const solid = EDGE.to + WOBBLE + 40;
    const bands: [number, number, number, number][] = [
      [left, top, w, FOG_FAR - solid],
      [left, WORLD.height + solid, w, FOG_FAR - solid],
      [left, -solid, FOG_FAR - solid, WORLD.height + 2 * solid],
      [WORLD.width + solid, -solid, FOG_FAR - solid, WORLD.height + 2 * solid],
    ];
    for (const [x, y, bw, bh] of bands) {
      const k = 768 / CLOUD_TILE;
      this.drift.push(
        scene.add
          .tileSprite(x, y, bw * k, bh * k, 'tex-clouds')
          .setOrigin(0)
          .setScale(1 / k)
          .setAlpha(0.35)
          .setDepth(depth + 0.1),
      );
    }
  }

  /** dt — секунды реального времени: облака плывут и на паузе */
  update(dt: number): void {
    for (const t of this.drift) {
      t.tilePositionX += dt * 6;
      t.tilePositionY += dt * 2;
    }
  }
}
