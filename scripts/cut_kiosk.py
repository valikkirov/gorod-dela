"""Киоск изнутри (вкладка «Стойка»): пустая комната + слои вещей.

Три картинки в одном ракурсе (art-src/v2/kiosk): empty — пустая стена, base — киоск сразу после
открытия (тёмная доска), full — со всеми улучшениями. Слой вещи — пиксели full, которые отличаются
от empty, внутри прямоугольника вещи. Доска «до улучшения» — отличие base от empty.
Выход: src/game/art/kiosk/*.webp, все одного размера, кладутся друг на друга.
Запуск: python3 scripts/cut_kiosk.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'kiosk'
OUT = ROOT / 'src' / 'game' / 'art' / 'kiosk'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 768, 512

# Прямоугольники вещей в координатах исходника 1536×1024
RECTS = {
    'board': (480, 80, 1030, 280),
    'machine': (210, 290, 620, 600),
    'shelves': (600, 270, 1100, 490),
    'terminal': (690, 580, 780, 690),
    'pastry': (775, 500, 1070, 685),
    'fridge': (1090, 545, 1310, 860),
}

empty = np.asarray(Image.open(SRC / 'empty.png').convert('RGB'), int)
base = np.asarray(Image.open(SRC / 'base.png').convert('RGB'), int)
full = np.asarray(Image.open(SRC / 'full.png').convert('RGB'), int)


def layer(src, rect, name):
    diff = np.abs(src - empty).sum(-1) > 45
    mask = np.zeros(diff.shape, bool)
    x0, y0, x1, y1 = rect
    mask[y0:y1, x0:x1] = diff[y0:y1, x0:x1]
    m = Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    # Мягкий край не выходит за прямоугольник вещи
    a = np.asarray(m, float)
    clip = np.zeros_like(a)
    clip[y0:y1, x0:x1] = 1
    a *= clip
    rgba = np.dstack([src, a]).astype('uint8')
    Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS).save(OUT / f'{name}.webp', 'WEBP', quality=85, method=6)


Image.fromarray(empty.astype('uint8')).resize((W, H), Image.LANCZOS).save(OUT / 'room.webp', 'WEBP', quality=82, method=6)
layer(base, (400, 60, 1100, 360), 'chalk')
for k, r in RECTS.items():
    layer(full, r, k)
print('ok', sorted(p.name for p in OUT.glob('*.webp')))
