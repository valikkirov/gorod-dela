"""Животные «Графики 2.0»: листы поз (Magnific) → src/game/art/animals.png и src/game/animalFrames.ts.

Исходник — art-src/v2/animals/<вид>.png: на белом фоне одно животное в ряд в позах из POSES, все смотрят вправо
(влево — отражением в игре). Кадр вписывается в прежнюю рамку BOX (единицы мира) с общим масштабом на вид —
сидящая и идущая кошка одного размера; низ кадра — лапы.
Запуск из корня: python3 scripts/pack_animals.py  (заменяет прежний scripts/draw_animals.py)
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'animals'
OUT_PNG = ROOT / 'src' / 'game' / 'art' / 'animals.png'
OUT_TS = ROOT / 'src' / 'game' / 'animalFrames.ts'
SCALE = 2

POSES = {
    'pigeon': ['stand', 'walk1', 'walk2', 'peck', 'fly1', 'fly2'],
    'squirrel': ['sit', 'run1', 'run2'],
    'cat-ginger': ['sit', 'walk1', 'walk2', 'sleep'],
    'cat-gray': ['sit', 'walk1', 'walk2', 'sleep'],
    'cat-black': ['sit', 'walk1', 'walk2', 'sleep'],
    'dog-brown': ['walk1', 'walk2', 'sit'],
    'dog-cream': ['walk1', 'walk2', 'sit'],
    'dog-black': ['walk1', 'walk2', 'sit'],
}
BOX = {'pigeon': (22, 18), 'squirrel': (26, 24), 'cat': (30, 26), 'dog': (34, 28)}


def cut(im: Image.Image, n: int) -> list[Image.Image]:
    a = np.asarray(im.convert('RGB')).astype(int)
    fg = a.min(2) < 238
    for it in (8, 6, 4, 3, 2, 1, 0):
        cols = nd.binary_closing(fg.any(0), iterations=it) if it else fg.any(0)
        lab, k = nd.label(cols)
        runs = sorted(nd.find_objects(lab), key=lambda r: r[0].stop - r[0].start, reverse=True)
        if k >= n:
            break
    runs = sorted(runs[:n], key=lambda r: r[0].start)
    out = []
    for (sx,) in runs:
        band = fg[:, sx]
        white = ~band
        wl, _ = nd.label(white)
        edge = set(np.unique(np.concatenate([wl[0], wl[-1], wl[:, 0], wl[:, -1]]))) - {0}
        m = ~np.isin(wl, list(edge))
        rows = np.nonzero(m.any(1))[0]
        sy = slice(rows.min(), rows.max() + 1)
        alpha = nd.gaussian_filter(m[sy].astype(float), 0.7)
        out.append(Image.fromarray(np.dstack([a[sy, sx].astype(np.uint8), (alpha * 255).clip(0, 255).astype(np.uint8)]), 'RGBA'))
    return out


def main() -> None:
    frames: dict[str, Image.Image] = {}
    for kind, poses in POSES.items():
        f = SRC / f'{kind}.png'
        if not f.exists():
            raise SystemExit(f'нет {f}')
        imgs = cut(Image.open(f), len(poses))
        bw, bh = BOX[kind.split('-')[0]]
        bw, bh = bw * SCALE, bh * SCALE
        k = min(min(bw / i.width, bh / i.height) for i in imgs)
        for pose, img in zip(poses, imgs):
            small = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
            cell = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
            cell.alpha_composite(small, ((bw - small.width) // 2, bh - small.height))
            frames[f'{kind}-{pose}'] = cell
    W = 560
    x = y = row = 0
    place = {}
    for name, img in frames.items():
        if x + img.width > W:
            x, y, row = 0, y + row + 10, 0
        place[name] = (x, y)
        x += img.width + 10
        row = max(row, img.height)
    sheet = Image.new('RGBA', (W, y + row), (0, 0, 0, 0))
    for name, img in frames.items():
        sheet.alpha_composite(img, place[name])
    sheet.save(OUT_PNG, optimize=True)
    lines = ['// Создано scripts/pack_animals.py — не править руками.',
             '/** Кадры животных: [x, y, w, h] в единицах мира (PNG в 2×). Все смотрят вправо. */',
             'export const ANIMAL_FRAMES: Record<string, [number, number, number, number]> = {']
    for name, img in frames.items():
        px, py = place[name]
        lines.append(f"  '{name}': [{px / SCALE:g}, {py / SCALE:g}, {img.width // SCALE}, {img.height // SCALE}],")
    lines.append('};\n')
    OUT_TS.write_text('\n'.join(lines))
    print('кадров:', len(frames), sheet.size)


if __name__ == '__main__':
    main()
