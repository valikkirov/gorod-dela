"""Собирает атласы «Графики 2.0» из исходников в art-src/v2 и пишет кадры в src/game/atlasFrames.ts.

Запуск из корня репозитория:  python3 scripts/pack_v2.py

- art-src/v2/buildings/*.png → src/game/art/buildings.png (здания днём)
- art-src/v2/lights/*.png    → src/game/art/lights.png    (свет в окнах, тот же размер, что у здания)
- art-src/v2/props/*.png     → src/game/art/ground.png    (предметы улицы, масштаб — по высоте из PROP_HEIGHT)
- art-src/v2/textures/*.png  → src/game/art/tex-*.png     (бесшовные текстуры земли, копия)

Исходники нарисованы в 2× (ART_SCALE), координаты кадров в atlasFrames.ts — в 1×.
"""
from pathlib import Path
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2'
ART = ROOT / 'src' / 'game' / 'art'
WIDTH = 2048
PAD = 8

# Высота предмета в мире (1×): как у старых кадров, чтобы предметы стояли так же
PROP_HEIGHT = {
    'prop-tree-round': 100,
    'prop-tree-tall': 100,
    'prop-lamp': 70,
    'prop-bench': 30,
    'prop-bin': 28,
    'prop-bus-stop': 60,
    'prop-menu-board': 40,
    # Сквер
    'prop-bush': 26,
    'prop-bushes': 34,
    'prop-hedge': 22,
    'prop-flowerbed': 32,
    'prop-planter': 26,
    'prop-fountain': 54,
}


def even(img: Image.Image) -> Image.Image:
    """Чётные размеры: тогда кадр в 1× — целые числа"""
    w, h = img.size
    if w % 2 == 0 and h % 2 == 0:
        return img
    c = Image.new('RGBA', (w + w % 2, h + h % 2), (0, 0, 0, 0))
    c.alpha_composite(img, (w % 2, h % 2))  # прижато к низу и вправо, низ — опора
    return c


def pack(items: list[tuple[str, Image.Image]], out: Path) -> dict[str, tuple[int, int, int, int]]:
    """Полки: высокие картинки первыми, слева направо"""
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = PAD
    shelf = 0
    pos: dict[str, tuple[int, int, int, int]] = {}
    for name, img in items:
        if x + img.width + PAD > WIDTH:
            x, y = PAD, y + shelf + PAD
            shelf = 0
        pos[name] = (x, y, img.width, img.height)
        x += img.width + PAD
        shelf = max(shelf, img.height)
    height = y + shelf + PAD
    height += height % 2
    atlas = Image.new('RGBA', (WIDTH, height), (0, 0, 0, 0))
    for name, img in items:
        atlas.alpha_composite(img, pos[name][:2])
    atlas.save(out, optimize=True)
    return {n: (x // 2, y // 2, w // 2, h // 2) for n, (x, y, w, h) in pos.items()}


def load(folder: str, fix=None) -> list[tuple[str, Image.Image]]:
    res = []
    for f in sorted((SRC / folder).glob('*.png')):
        img = Image.open(f).convert('RGBA')
        if fix:
            img = fix(f.stem, img)
        res.append((f.stem, even(img)))
    return res


def prop(name: str, img: Image.Image) -> Image.Image:
    h = PROP_HEIGHT[name] * 2
    return img.resize((max(2, round(img.width * h / img.height)), h), Image.LANCZOS)


def ts(name: str, frames: dict) -> str:
    body = '\n'.join(f"  '{k}': [{x}, {y}, {w}, {h}]," for k, (x, y, w, h) in sorted(frames.items()))
    return f'export const {name}: Record<string, [number, number, number, number]> = {{\n{body}\n}};\n'


def main() -> None:
    out = ['// Сгенерировано scripts/pack_v2.py — не править руками\n']
    out.append(ts('BUILDING_FRAMES', pack(load('buildings'), ART / 'buildings.png')))
    out.append(ts('LIGHT_FRAMES', pack(load('lights'), ART / 'lights.png')))
    out.append(ts('PROP_FRAMES', pack(load('props', prop), ART / 'ground.png')))
    tex = {}
    for f in sorted((SRC / 'textures').glob('*.png')):
        shutil.copy(f, ART / f.name)
        w, h = Image.open(f).size
        tex[f.stem] = (0, 0, w // 2, h // 2)
    out.append(ts('TEXTURE_FRAMES', tex))
    (ROOT / 'src' / 'game' / 'atlasFrames.ts').write_text('\n'.join(out))
    print('ok')


if __name__ == '__main__':
    main()
