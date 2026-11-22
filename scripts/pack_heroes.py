"""Герои на карте: свои человечки у Марины, Лёши, Зинаиды Петровны и архитектора.

Исходник — лист 3×3 из Magnific (art-src/v2/heroes/sheet-<id>.png): ряды — спереди, сзади, сбоку вправо;
в ряду — стоит, шаг, другой шаг. Скрипт снимает белый фон, режет девять фигур, масштабирует под жителей
(рост 82 px в 2×, стопы на 84) и собирает src/game/art/heroes.webp в раскладке людей:
ряд — герой, 15 кадров (вниз, вверх, вправо × стоит + 4 фазы шага), ячейка 32×48 (1×).
Фазы шага: 1 — шаг, 2 — стоит, 3 — другой шаг, 4 — стоит.

Запуск: python3 scripts/pack_heroes.py
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'heroes'
OUT = ROOT / 'src' / 'game' / 'art' / 'heroes.webp'
HEROES = ['marina', 'lesha', 'zinaida', 'architect']  # порядок рядов = HERO_ORDER в atlas.ts
CELL_W, CELL_H, HEIGHT, FEET = 56, 88, 82, 84


def cutout(rgb: np.ndarray) -> np.ndarray:
    """Белый фон, связанный с краями, — в прозрачность, с мягким краем"""
    light = (rgb.min(axis=2) > 232).astype(np.uint8)
    _, lab = cv2.connectedComponents(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    a = cv2.GaussianBlur((~bg).astype(np.float32), (3, 3), 0)
    return np.dstack([rgb, (np.clip(a * 1.3, 0, 1) * 255).astype(np.uint8)])


def figures(sheet: np.ndarray) -> list[list[np.ndarray]]:
    """Девять фигур по сетке 3×3: в каждой трети — рамка по непрозрачному"""
    h, w = sheet.shape[:2]
    rows = []
    for r in range(3):
        row = []
        for c in range(3):
            cell = sheet[r * h // 3:(r + 1) * h // 3, c * w // 3:(c + 1) * w // 3]
            ys, xs = np.where(cell[..., 3] > 40)
            row.append(cell[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        rows.append(row)
    return rows


def main() -> None:
    atlas = Image.new('RGBA', ((4 + 15 * 32) * 2, (4 + len(HEROES) * 48) * 2), (0, 0, 0, 0))
    for row, hero in enumerate(HEROES):
        rgb = np.asarray(Image.open(SRC / f'sheet-{hero}.png').convert('RGB'))
        figs = figures(cutout(rgb))
        k = HEIGHT / figs[0][0].shape[0]  # по стоящему спереди — все кадры героя в одном масштабе
        for f in range(3):  # вниз, вверх, вправо
            stand, step_a, step_b = figs[f]
            for phase, fig in enumerate([stand, step_a, stand, step_b, stand]):
                im = Image.fromarray(fig)
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
                if im.width > CELL_W:
                    im = im.resize((CELL_W, round(im.height * CELL_W / im.width)), Image.LANCZOS)
                x = (4 + (f * 5 + phase) * 32) * 2 + (CELL_W - im.width) // 2
                y = (4 + row * 48) * 2 + FEET - im.height
                atlas.alpha_composite(im, (x, max(0, y)))
    atlas.save(OUT, 'WEBP', quality=90, alpha_quality=100, method=6)
    print('ok', atlas.size)


if __name__ == '__main__':
    main()
