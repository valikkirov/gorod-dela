// Земля из бесшовных текстур: трава, плитка, асфальт. Раскладка — по клеткам сетки (groundTile),
// разметка, зебра и бордюры дорисовываются поверх. Плитка в текстуре совпадает с клеткой 40×40.
import type Phaser from 'phaser';

export interface Cell {
  x: number;
  y: number;
  size: number;
}

const PAINT = 'rgba(246, 240, 226, 0.92)';

export function paintGround(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  S: number,
  cells: Cell[],
  tileAt: (x: number, y: number) => string,
): void {
  const pattern = (key: string) =>
    ctx.createPattern(scene.textures.get(key).getSourceImage() as HTMLImageElement, 'repeat')!;
  const grass = pattern('tex-grass');
  const sidewalk = pattern('tex-sidewalk');
  const asphalt = pattern('tex-asphalt');
  const kinds = cells.map((c) => tileAt(c.x, c.y));
  // Узор привязан к началу холста, поэтому соседние клетки стыкуются без швов
  cells.forEach(({ x, y, size }, i) => {
    const kind = kinds[i];
    ctx.fillStyle = kind === 'tile-grass' ? grass : kind.startsWith('tile-sidewalk') ? sidewalk : asphalt;
    ctx.fillRect(x * S, y * S, size * S, size * S);
  });
  cells.forEach(({ x, y, size }, i) => {
    const kind = kinds[i];
    if (kind === 'tile-road-marking') {
      // Прерывистая осевая: штрих в каждой клетке
      ctx.fillStyle = PAINT;
      ctx.fillRect((x + size / 2 - 1.5) * S, (y + 6) * S, 3 * S, (size / 2) * S);
    } else if (kind === 'tile-road-crosswalk') {
      ctx.fillStyle = PAINT;
      for (let k = 0; k < 2; k++) ctx.fillRect((x + 5 + k * 20) * S, (y + 3) * S, 10 * S, (size - 6) * S);
    } else if (kind === 'tile-sidewalk-curb-left' || kind === 'tile-sidewalk-curb-right') {
      // Бордюр со стороны дороги и тень от него на асфальт
      const left = kind === 'tile-sidewalk-curb-left';
      const bx = left ? x + size - 4 : x;
      ctx.fillStyle = '#d8d0bf';
      ctx.fillRect(bx * S, y * S, 4 * S, size * S);
      ctx.fillStyle = 'rgba(110, 92, 72, 0.55)';
      ctx.fillRect((left ? bx + 4 : bx) * S - 1, y * S, 2, size * S);
    }
  });
}
