"""Фирменные вещи стилей и новогодний декор зала: каждая — разница между «пустая комната + вещь» и пустой комнатой.

Запуск из корня репозитория:  python3 scripts/cut_hall_items.py

Исходники — art-src/v2/hall3/items/<id>.png: точные правки пустой комнаты (empty-clean.png) в Magnific,
Ideogram 4.5 «добавь только одну вещь». Вещь ложится ровно туда, где её нарисовала модель.
Непрозрачность — по силе отличия: сама вещь плотная, свечение вокруг неё (неон, лампы) — полупрозрачное,
поэтому ложится и на кирпич, и на белую стену.

Выход: src/game/art/hall3/item-<id>.webp и src/game/hallItems.ts (рамка каждой вещи в пикселях комнаты).
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cut_hall import load, room, blur  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'hall3' / 'items'
OUT = ROOT / 'src' / 'game' / 'art' / 'hall3'
TS = ROOT / 'src' / 'game' / 'hallItems.ts'


def main() -> None:
    _, (bx, by, bx1, by1) = room(load('empty'))
    clean = load('empty-clean')
    frames = {}
    for f in sorted(SRC.glob('*.png')):
        img = np.asarray(Image.open(f).convert('RGB')).astype(np.int32)
        d = np.abs(blur(img) - blur(clean)).sum(2)
        core = d > 45
        core = nd.binary_opening(core, iterations=1)
        lab, n = nd.label(core)
        if not n:
            print('пусто:', f.stem)
            continue
        sizes = nd.sum(core, lab, range(1, n + 1))
        keep = np.isin(lab, np.nonzero(sizes >= max(150, sizes.max() * 0.08))[0] + 1)
        keep = nd.binary_fill_holes(nd.binary_closing(keep, iterations=3))
        # Ореол: слабое отличие рядом с вещью — свечение и тень, полупрозрачно
        near = nd.binary_dilation(keep, iterations=14)
        a = np.where(keep, 1.0, np.clip((d - 12) / 60, 0, 0.85) * near)
        a = np.maximum(a, nd.gaussian_filter(keep.astype(float), 0.8) * keep.max())
        a[: by] = 0
        ys, xs = np.nonzero(a > 0.02)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        out = np.dstack([img.astype(np.uint8), (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
        Image.fromarray(out).save(OUT / f'item-{f.stem}.webp', quality=92)
        frames[f.stem] = (int(x0 - bx), int(y0 - by), int(x1 - x0), int(y1 - y0))
        print(f.stem, frames[f.stem])
    lines = ['// Сгенерировано scripts/cut_hall_items.py — не править руками',
             '/** Фирменные вещи и декор зала: x, y, w, h в пикселях комнаты */',
             'export const HALL_ITEMS: Record<string, [number, number, number, number]> = {']
    lines += [f"  {k}: [{', '.join(map(str, v))}]," for k, v in frames.items()]
    lines.append('};')
    TS.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
