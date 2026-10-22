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
    ctx.fillStyle = kind === 'tile-grass' ? grass : kind.startsWith('tile-sidewalk') || kind.startsWith('tile-curb') ? sidewalk : asphalt;
    ctx.fillRect(x * S, y * S, size * S, size * S);
  });
  // Бордюр со стороны дороги и тень от него на асфальт
  const curb = (x: number, y: number, size: number, side: 'left' | 'right' | 'top' | 'bottom') => {
    ctx.fillStyle = '#d8d0bf';
    const shade = 'rgba(110, 92, 72, 0.55)';
    if (side === 'left' || side === 'right') {
      const bx = side === 'right' ? x + size - 4 : x;
      ctx.fillRect(bx * S, y * S, 4 * S, size * S);
      ctx.fillStyle = shade;
      ctx.fillRect((side === 'right' ? bx + 4 : bx) * S - 1, y * S, 2, size * S);
    } else {
      const by = side === 'bottom' ? y + size - 4 : y;
      ctx.fillRect(x * S, by * S, size * S, 4 * S);
      ctx.fillStyle = shade;
      ctx.fillRect(x * S, (side === 'bottom' ? by + 4 : by) * S - 1, size * S, 2);
    }
  };
  cells.forEach(({ x, y, size }, i) => {
    const kind = kinds[i];
    ctx.fillStyle = PAINT;
    if (kind === 'tile-road-marking') {
      // Прерывистая осевая: штрих в каждой клетке
      ctx.fillRect((x + size / 2 - 1.5) * S, (y + 6) * S, 3 * S, (size / 2) * S);
    } else if (kind === 'tile-road-marking-h') {
      ctx.fillRect((x + 6) * S, (y + size / 2 - 1.5) * S, (size / 2) * S, 3 * S);
    } else if (kind === 'tile-road-crosswalk') {
      for (let k = 0; k < 2; k++) ctx.fillRect((x + 5 + k * 20) * S, (y + 3) * S, 10 * S, (size - 6) * S);
    } else if (kind === 'tile-road-crosswalk-h') {
      for (let k = 0; k < 2; k++) ctx.fillRect((x + 3) * S, (y + 5 + k * 20) * S, (size - 6) * S, 10 * S);
    } else if (kind.startsWith('tile-road-stopline-')) {
      // Стоп-линия поперёк своей полосы, у края клетки со стороны перехода
      const dir = kind.slice('tile-road-stopline-'.length);
      if (dir === 'down') ctx.fillRect(x * S, (y + size - 4) * S, size * S, 3 * S);
      if (dir === 'up') ctx.fillRect(x * S, (y + 1) * S, size * S, 3 * S);
      if (dir === 'right') ctx.fillRect((x + size - 4) * S, y * S, 3 * S, size * S);
      if (dir === 'left') ctx.fillRect((x + 1) * S, y * S, 3 * S, size * S);
    } else if (kind === 'tile-sidewalk-curb-left') curb(x, y, size, 'right');
    else if (kind === 'tile-sidewalk-curb-right') curb(x, y, size, 'left');
    else if (kind === 'tile-sidewalk-curb-top') curb(x, y, size, 'bottom');
    else if (kind === 'tile-sidewalk-curb-bottom') curb(x, y, size, 'top');
    else if (kind === 'tile-curb-corner-nw') { curb(x, y, size, 'right'); curb(x, y, size, 'bottom'); }
    else if (kind === 'tile-curb-corner-ne') { curb(x, y, size, 'left'); curb(x, y, size, 'bottom'); }
    else if (kind === 'tile-curb-corner-sw') { curb(x, y, size, 'right'); curb(x, y, size, 'top'); }
    else if (kind === 'tile-curb-corner-se') { curb(x, y, size, 'left'); curb(x, y, size, 'top'); }
  });
}
