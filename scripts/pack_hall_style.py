"""Отделка зала по стилям: стены и пол — отдельные слои поверх комнаты, их можно сочетать как угодно.

Запуск из корня репозитория:  python3 scripts/pack_hall_style.py

Исходники — art-src/v2/hall3/style: правки пустой комнаты (empty-clean.png) в Magnific (Ideogram 4.5, точная правка)
«та же комната, другие стены» и «та же комната, другой пол». Слой — то, что изменилось против пустой комнаты,
внутри своей области (стены — всё выше пола, пол — многоугольник пола). Размер слоя — как у room.webp.

Выход: src/game/art/hall3/walls-*.webp и floor-*.webp.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cut_hall import load, room, changed, blur  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'hall3' / 'style'
OUT = ROOT / 'src' / 'game' / 'art' / 'hall3'
W, H = 1024, 768

# Пол в пикселях комнаты (room.webp, 997×590)
FLOOR = [(178, 286), (822, 286), (975, 488), (975, 545), (905, 582), (95, 582), (22, 545), (28, 488)]


def poly_mask(pts, off) -> np.ndarray:
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon([(x + off[0], y + off[1]) for x, y in pts], fill=255)
    return np.asarray(im) > 0


def main() -> None:
    _, box = room(load('empty'))
    clean = load('empty-clean')
    floor = poly_mask(FLOOR, box[:2])
    for f in sorted(SRC.glob('*.png')):
        kind = f.stem.split('-')[0]
        img = np.asarray(Image.open(f).convert('RGB')).astype(np.int32)
        region = floor if kind == 'floor' else ~nd.binary_dilation(floor, iterations=4)
        m = changed(clean, img) & region
        m = nd.binary_closing(m, iterations=2)
        # Плавный край в 1–2 px, чтобы не было лесенки
        a = np.clip(nd.gaussian_filter(m.astype(float), 0.8) * 1.4, 0, 1)
        a[~region] = 0
        out = np.dstack([img.astype(np.uint8), (a * 255).astype(np.uint8)])
        x0, y0, x1, y1 = box
        Image.fromarray(out[y0:y1, x0:x1]).save(OUT / f'{f.stem}.webp', quality=90)
        print(f.stem, round(float(m.mean()), 3))


if __name__ == '__main__':
    main()
