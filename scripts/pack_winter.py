"""Новогодний сезон: зимние текстуры земли, иконки сезонного меню, ёлка в сквере.

Запуск из корня репозитория:  python3 scripts/pack_winter.py

Исходники — art-src/v2/winter (Magnific): *-raw.png — точные правки летних текстур «то же, но в снегу»
(Ideogram 4.5), <id>.raw.png — иконки (GPT 2 по образцу иконок меню, фон убран), city-tree.png — ёлка (GPT 2, фон убран).
Текстуры делаются бесшовными: края смешиваются с той же картинкой, сдвинутой на половину (сетка плитки 80 px
при сдвиге 320 не сбивается).
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'winter'
ART = ROOT / 'src' / 'game' / 'art'


def seamless(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    rolled = np.roll(img, (h // 2, w // 2), axis=(0, 1))
    # Вес исходной картинки: 1 в середине, 0 у краёв (там видна сдвинутая — её края из середины, без шва)
    wy = 1 - np.abs(np.linspace(-1, 1, h))
    wx = 1 - np.abs(np.linspace(-1, 1, w))
    wgt = np.clip(np.minimum.outer(wy, wx) * 3, 0, 1)[..., None]
    return img * wgt + rolled * (1 - wgt)


def textures() -> None:
    for name in ['grass', 'forest', 'sidewalk', 'rail']:
        f = SRC / f'tex-{name}-raw.png'
        img = np.asarray(Image.open(f).convert('RGB')).astype(float)
        out = seamless(img) if name == 'forest' else img
        Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(ART / f'tex-{name}-winter.webp', quality=88)


def trim(im: Image.Image) -> Image.Image:
    return im.crop(im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())


def icons() -> None:
    for f in sorted(SRC.glob('*.raw.png')):
        im = trim(Image.open(f).convert('RGBA'))
        im.thumbnail((116, 116), Image.LANCZOS)
        box = Image.new('RGBA', (128, 128))
        box.alpha_composite(im, ((128 - im.width) // 2, (128 - im.height) // 2))
        box.save(ROOT / 'art-src' / 'v2' / 'icons' / f.name.replace('.raw', ''))


def tree() -> None:
    im = trim(Image.open(SRC / 'city-tree.png').convert('RGBA'))
    # В мире ёлка около 170 px высотой (в 2× — 340)
    im.thumbnail((200, 340), Image.LANCZOS)
    im.save(ART / 'city-tree.webp', quality=90)
    print('ёлка', im.size)


# Летний кадр → зимний: правка была сделана по картинке с полями 40 px на белом, поля срезаем
# и сводим к размеру летнего кадра (в 2×), чтобы зимний встал ровно на то же место
PROPS = {'prop-tree-round': (83, 100), 'prop-tree-tall': (57, 100), 'prop-pond': (290, 125)}
PAD = 40


def props() -> None:
    for name, (w, h) in PROPS.items():
        im = Image.open(SRC / f'{name}.png').convert('RGBA')
        im = im.crop((PAD, PAD, im.width - PAD, im.height - PAD)).resize((w * 2, h * 2), Image.LANCZOS)
        im.save(ART / f'{name}-winter.webp', quality=90)


if __name__ == '__main__':
    props()
    textures()
    icons()
    tree()
