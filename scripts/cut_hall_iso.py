"""Зал кафе: кусочки мебели, нарисованные по одному (как у бистро, см. cut_bistro.py). Каждая вещь — правка
картинки зала в Magnific: «оставь только эту вещь, всё остальное — сплошной пурпур #FF00FF». Вещь на своём месте,
заслонённое дорисовано, фон снимается по цвету — без кусков старой стены и пола.

Запуск из корня репозитория после cut_hall.py (он делает комнату, бариста и миниатюры):
    python3 scripts/cut_hall.py && python3 scripts/cut_hall_iso.py
Кусочки из PIECES заменяют вырезанные разницей; остальные остаются как были.

Исходники — art-src/v2/hall3/iso/<имя>.png (вещи на пурпуре), выравнивание — по картинкам зала L1/L2b/L3/R.
"""
import re
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cut_bistro import key as _key, pick, align, shift  # noqa: E402
import cut_bistro  # noqa: E402
import cut_hall  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'hall3'
ISO = SRC / 'iso'
OUT = ROOT / 'src' / 'game' / 'art' / 'hall3'
FRAMES = ROOT / 'src' / 'game' / 'hallFrames.ts'
W, H = 1024, 768

# Кусочек: картинка на пурпуре, зал для выравнивания, где он (по середине пятна, пиксели 1024×768)
PIECES: dict[str, tuple[str, str, tuple[int, int, int, int]]] = {
    'wall-1-picture': ('wall', 'L1', (290, 180, 372, 272)),
    'wall-2-clock': ('wall', 'L1', (336, 120, 412, 200)),
    'corner-sofa': ('sofa', 'L1', (225, 240, 400, 410)),
    'shelf-bookshelf': ('bookshelf', 'L1', (385, 160, 495, 395)),
    'small-1-floorlamp': ('lampplant', 'L1', (25, 370, 125, 590)),
    'nook-monstera': ('lampplant', 'L1', (175, 230, 255, 370)),
    'window-bar': ('bar', 'L1', (35, 250, 265, 570)),
    'table-1-table2': ('t1', 'L1', (325, 370, 545, 505)),
    'table-2-table2': ('t23', 'L1', (205, 470, 428, 625)),
    'table-3-table2': ('t23', 'L1', (428, 470, 655, 625)),
    'corner-sofa-half': ('sofa-half', 'L1h', (225, 220, 400, 430)),
    'window-bar-half': ('bar-half', 'L1h', (35, 230, 265, 570)),
    'table-1-table2-half': ('t1-half', 'L1h', (325, 290, 545, 505)),
    'table-2-table2-half': ('t23-half', 'L1h', (205, 420, 428, 625)),
    'table-3-table2-half': ('t23-half', 'L1h', (428, 420, 655, 625)),
    'corner-sofa-full': ('sofa-full', 'L1f', (225, 220, 400, 430)),
    'window-bar-full': ('bar-full', 'L1f', (35, 230, 265, 570)),
    'table-1-table2-full': ('t1-full', 'L1f', (325, 290, 545, 505)),
    'table-2-table2-full': ('t23-full', 'L1f', (205, 420, 428, 625)),
    'table-3-table2-full': ('t23-full', 'L1f', (428, 420, 655, 625)),
    'corner-games': ('l2-games', 'L2b', (228, 260, 420, 395)),
    'nook-floorlamp': ('l2-games', 'L2b', (165, 210, 228, 405)),
    'small-1-plant': ('l2-games', 'L2b', (35, 420, 155, 595)),
    'shelf-monstera': ('l2-monstera', 'L2b', (380, 220, 520, 400)),
    'table-1-table4': ('l2-t1', 'L2b', (395, 370, 565, 510)),
    'table-2-table4': ('l2-t234', 'L2b', (195, 440, 418, 640)),
    'table-3-table4': ('l2-t234', 'L2b', (418, 440, 630, 645)),
    'table-4-table4': ('l2-t234', 'L2b', (630, 460, 850, 660)),
    'table-1-table4-half': ('l2-t1-half', 'L2bh', (395, 300, 565, 510)),
    'table-2-table4-half': ('l2-t234-half', 'L2bh', (195, 400, 418, 640)),
    'table-3-table4-half': ('l2-t234-half', 'L2bh', (418, 400, 630, 645)),
    'table-4-table4-half': ('l2-t234-half', 'L2bh', (630, 410, 850, 660)),
    'table-1-table4-full': ('l2-t1-full', 'L2bf', (395, 300, 565, 510)),
    'table-2-table4-full': ('l2-t234-full', 'L2bf', (195, 400, 418, 640)),
    'table-3-table4-full': ('l2-t234-full', 'L2bf', (418, 400, 630, 645)),
    'table-4-table4-full': ('l2-t234-full', 'L2bf', (630, 410, 850, 660)),
    'corner-bookshelf': ('l3-bookcase', 'L3', (215, 110, 425, 400)),
    'shelf-games': ('l3-rest', 'L3', (395, 190, 500, 395)),
    'nook-plant': ('l3-rest', 'L3', (155, 240, 250, 405)),
    'small-1-monstera': ('l3-rest', 'L3', (35, 380, 195, 595)),
    'table-4-table2': ('l3-rest', 'L3', (630, 420, 880, 620)),
    'table-4-table2-half': ('l3-t4-half', 'L3h', (600, 370, 890, 620)),
    'table-4-table2-full': ('l3-t4-full', 'L3f', (600, 370, 890, 620)),
    'rug-rug': ('rug', 'R', (100, 340, 760, 690)),
}

# Чужие обрывки, сросшиеся с вещью (стул заднего стола, призрак витрины): пиксели 1024×768
EXCLUDE: dict[str, list[tuple[int, int, int, int]]] = {
    'table-3-table2-full': [(415, 405, 460, 495)],
    'table-3-table4-full': [(548, 385, 645, 440)],
}


def key(name: str):
    cut_bistro.ISO, cut_bistro.W, cut_bistro.H = ISO, W, H
    return _key(name)


def rgb(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB').resize((W, H))).astype(np.float32)


def main() -> None:
    _, (ox, oy, _, _) = cut_hall.room(cut_hall.load('empty'))
    text = FRAMES.read_text()
    frames = {m[0]: tuple(map(int, m[1:])) for m in re.findall(r"'([^']+)': \[(\d+), (\d+), (\d+), (\d+)\]", text)}
    lamps = None
    if (ISO / 'lamps.png').exists():
        _, la = key('lamps')
        lamps = nd.binary_dilation(la > 0.5, iterations=1)
    keyed: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    refs: dict[str, np.ndarray] = {}
    for name, (iso, ref, box) in PIECES.items():
        if not (ISO / f'{iso}.png').exists():
            print('нет', iso)
            continue
        if iso not in keyed:
            keyed[iso] = key(iso)
        if ref not in refs:
            refs[ref] = rgb(ref)
        col, alpha = keyed[iso]
        alpha = pick(alpha, box)
        for x0, y0, x1, y1 in EXCLUDE.get(name, []):
            alpha[y0:y1, x0:x1] = 0
        dx, dy = align(col, alpha, refs[ref])
        col, alpha = shift(col, dx, dy), shift(alpha, dx, dy)
        # Лампы висят перед всем, что у стены: их место прозрачное, лампа из комнаты видна поверх
        if lamps is not None:
            alpha = np.where(lamps, 0, alpha)
        ys, xs = np.nonzero(alpha > 0.04)
        if not len(ys):
            print('пусто', name)
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([col, alpha * 255]).clip(0, 255).astype(np.uint8)[y0:y1, x0:x1]
        Image.fromarray(rgba).save(OUT / f'{name}.webp', quality=92, alpha_quality=100)
        frames[name] = (int(x0 - ox), int(y0 - oy), int(x1 - x0), int(y1 - y0))
        print(f'{name}: сдвиг {dx},{dy}')
    head = text[: text.index('export const HALL_FRAMES')]
    lines = [
        'export const HALL_FRAMES: Record<string, [number, number, number, number]> = {',
        *sorted(f"  '{n}': [{x}, {y}, {w}, {h}]," for n, (x, y, w, h) in frames.items()),
        '};',
        '',
    ]
    FRAMES.write_text(head.replace('scripts/cut_hall.py', 'scripts/cut_hall.py и cut_hall_iso.py') + '\n'.join(lines))
    cut_hall.save_thumbs()
    print(len(frames), 'кусочков')


if __name__ == '__main__':
    main()
