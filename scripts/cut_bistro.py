"""Зал бистро: кусочки мебели. Каждая вещь нарисована отдельно в Magnific (Nano Banana 2.1) правкой картинки
зала: «оставь только эту вещь, всё остальное — сплошной пурпур #FF00FF». Вещь остаётся на своём месте, заслонённое
дорисовано (полка за лампой, лавка за столиком, гости целиком), а фон снимается по цвету — без кусков старой
стены и пола.

Запуск из корня репозитория:  python3 scripts/cut_bistro.py  (потом pack_bistro_style.py)

Исходники — art-src/v2/bistro: empty.png (пустой зал), L1/L1h/L1f/L2 (зал с мебелью — по ним выравниваем кусочки),
iso/<имя>.png (вещи на пурпуре, см. PIECES). Выход: src/game/art/bistro/*.webp и src/game/bistroFrames.ts.
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'bistro'
ISO = SRC / 'iso'
OUT = ROOT / 'src' / 'game' / 'art' / 'bistro'
# Комната на картинке 1200×896 и размер, в котором её рисует игра (как у зала кафе)
CROP = (15, 93, 1185, 785)
ROOM_W, ROOM_H = 997, 590
W, H = 1200, 896

# Кусочек: картинка на пурпуре, зал, по которому выравниваем, и где он лежит (по середине пятна, пиксели исходника)
PIECES: dict[str, tuple[str, str, tuple[int, int, int, int]]] = {
    'b-front-1-table2': ('front1', 'L1', (230, 540, 490, 745)),
    'b-front-2-table2': ('front2', 'L1', (515, 540, 780, 745)),
    'b-side-booth': ('booth', 'L1', (790, 440, 1070, 760)),
    'b-door-coatstand': ('coats', 'L1', (950, 270, 1160, 710)),
    'b-corner-cooler': ('cooler', 'L1', (200, 280, 420, 490)),
    'b-window-stools': ('stools', 'L1', (50, 290, 310, 670)),
    'b-center-commune': ('commune', 'L1', (340, 430, 730, 610)),
    'b-wall-l-herbs': ('shelf', 'L1', (210, 140, 430, 290)),
    'b-wall-c-clock': ('clockmenu', 'L1', (460, 120, 560, 220)),
    'b-wall-r-menuboard': ('clockmenu', 'L1', (590, 120, 940, 300)),
    'b-front-1-table2-half': ('front1-half', 'L1h', (230, 470, 490, 745)),
    'b-front-2-table2-half': ('front2', 'L1', (515, 540, 780, 745)),
    'b-side-booth-half': ('booth-half', 'L1h', (790, 400, 1070, 760)),
    'b-window-stools-half': ('stools-half', 'L1h', (50, 260, 310, 670)),
    'b-center-commune-half': ('commune-half', 'L1h', (340, 380, 730, 640)),
    'b-front-1-table2-full': ('front1-full', 'L1f', (230, 470, 490, 745)),
    'b-front-2-table2-full': ('front1-full', 'L1f', (515, 470, 780, 745)),
    'b-side-booth-full': ('booth-full', 'L1f', (790, 400, 1070, 760)),
    'b-window-stools-full': ('stools-full2', 'L1f', (50, 260, 310, 670)),
    'b-center-commune-full': ('commune-full', 'L1f', (340, 380, 730, 640)),
    'b-side-table4': ('table4plant', 'L2', (790, 420, 1030, 670)),
    'b-door-plant': ('table4plant', 'L2', (1030, 420, 1160, 710)),
    'b-corner-palm': ('palm', 'L2', (200, 200, 400, 500)),
    'b-window-ficus': ('ficuspalm', 'L2', (40, 300, 240, 680)),
    'b-center-pair4': ('pair4', 'L2', (270, 400, 770, 600)),
    'b-center-pair4-half': ('l2-half', 'L2h', (270, 340, 770, 610)),
    'b-side-table4-half': ('l2-half', 'L2h', (790, 370, 1030, 680)),
    'b-center-pair4-full': ('l2-full', 'L2f', (270, 340, 770, 610)),
    'b-side-table4-full': ('l2-full', 'L2f', (790, 370, 1030, 680)),
    'b-wall-l-poster': ('postertv', 'L2', (310, 140, 440, 300)),
    'b-wall-r-tv': ('postertv', 'L2', (650, 140, 860, 290)),
    # Новогодний декор (сезон 15.12–12.01): зал NY.png — L1 с ёлкой у двери и гирляндой на окне
    'b-tree-tree': ('nytree', 'NY', (880, 280, 1040, 530)),
    'b-garland-garland': ('nygarland', 'NY', (55, 180, 232, 540)),
}
# Вещи, нарисованные вместе с соседом: его пиксели (там, где виден именно он) вычитаем
MINUS = {'b-window-ficus': 'palm'}
MAGENTA = np.array([255, 0, 255], np.float32)


def rgb(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB').resize((W, H))).astype(np.float32)


def blur(a: np.ndarray) -> np.ndarray:
    return nd.uniform_filter(a, size=(5, 5, 1))


def to_room(x: float, y: float) -> tuple[float, float]:
    k = ROOM_W / (CROP[2] - CROP[0])
    return (x - CROP[0]) * k, (y - CROP[1]) * k


def key(name: str) -> tuple[np.ndarray, np.ndarray]:
    """Цвет и альфа вещи с пурпурной картинки"""
    a = np.asarray(Image.open(ISO / f'{name}.png').convert('RGB').resize((W, H), Image.LANCZOS)).astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    # Насколько пиксель пурпурный: красный и синий выше зелёного
    m = np.clip((np.minimum(R, B) - G - 30) / 110, 0, 1)
    alpha = 1 - m
    # Снять пурпур с полупрозрачного края, а с тёмной обводки — пурпурный оттенок
    aa = np.clip(alpha, 0.05, 1)[..., None]
    col = np.clip((a - (1 - aa) * MAGENTA) / aa, 0, 255)
    col = np.where(alpha[..., None] > 0.98, a, col)
    edge = nd.binary_dilation(alpha < 0.98, iterations=4)
    spill = np.clip(np.minimum(col[..., 0], col[..., 2]) - col[..., 1], 0, None)
    col[..., 0] -= spill * edge
    col[..., 2] -= spill * edge
    return col, alpha


def pick(alpha: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Пятна, чья середина в box; крошки и бледные следы (контуры, что модель оставила на пурпуре) — прочь.
    Если вещь срослась с соседней (гость тянется к соседнему столу), пятна разделяются сужением"""
    fg = alpha > 0.6
    x0, y0, x1, y1 = box
    for erode in (0, 2, 4, 6, 9):
        core = nd.binary_erosion(fg, iterations=erode) if erode else fg
        lab, n = nd.label(core)
        if not n:
            break
        idx = range(1, n + 1)
        sizes = nd.sum(core, lab, idx)
        centers = nd.center_of_mass(core, lab, idx)
        keep = [i for i, s, (cy, cx) in zip(idx, sizes, centers) if s >= 40 and x0 <= cx < x1 and y0 <= cy < y1]
        if not keep:
            continue
        mine = np.isin(lab, keep)
        # Пятно сильно вылезает за своё место — срослось с соседом: делим сильнее
        inside = np.zeros_like(mine)
        inside[y0:y1, x0:x1] = True
        if erode < 9 and (mine & ~inside).sum() > 0.08 * mine.sum():
            continue
        if erode:
            # Вернуть сужение: каждому пикселю — ближайшее ядро; берём пиксели, чьё ядро — наше
            others = (lab > 0) & ~mine
            _, (iy, ix) = nd.distance_transform_edt(lab == 0, return_indices=True)
            nearest_mine = mine[iy, ix] & ~others[iy, ix]
            mine = fg & nearest_mine
        ok = nd.binary_dilation(mine, iterations=2)
        # Чужое, что модель дорисовала рядом и что срослось с вещью, — за пределами места
        ok &= nd.binary_dilation(inside, iterations=6)
        return alpha * ok
    return np.zeros_like(alpha)


def align(col: np.ndarray, alpha: np.ndarray, ref: np.ndarray) -> tuple[int, int]:
    """Сдвиг (dx, dy), при котором вещь лучше всего ложится на свой зал"""
    ys, xs = np.nonzero(alpha > 0.9)
    if len(ys) < 50:
        return 0, 0
    sel = np.random.default_rng(1).choice(len(ys), min(4000, len(ys)), replace=False)
    ys, xs = ys[sel], xs[sel]
    best, arg = None, (0, 0)
    g = col.mean(2)
    r = ref.mean(2)
    for dy in range(-8, 9):
        for dx in range(-8, 9):
            yy, xx = np.clip(ys + dy, 0, H - 1), np.clip(xs + dx, 0, W - 1)
            e = np.abs(g[ys, xs] - r[yy, xx]).mean()
            if best is None or e < best:
                best, arg = e, (dx, dy)
    return arg


def shift(a: np.ndarray, dx: int, dy: int) -> np.ndarray:
    return nd.shift(a, (dy, dx) + (0,) * (a.ndim - 2), order=0, mode='constant')


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('b-*.webp'):
        f.unlink()
    empty = rgb('empty')
    room = Image.fromarray(empty.astype(np.uint8)).crop(CROP).resize((ROOM_W, ROOM_H), Image.LANCZOS)
    room.save(OUT / 'room.webp', quality=90)
    # Лампы висят перед стеной: на вещах на стене их место прозрачное, лампа из зала видна поверх
    _, lamps = key('lamps')
    lamps = nd.binary_dilation(lamps > 0.5, iterations=1)
    refs: dict[str, np.ndarray] = {}
    keyed: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    frames: dict[str, tuple[int, int, int, int]] = {}
    k = ROOM_W / (CROP[2] - CROP[0])
    for name, (iso, ref, box) in PIECES.items():
        if not (ISO / f'{iso}.png').exists():
            print('нет', iso)
            continue
        if iso not in keyed:
            keyed[iso] = key(iso)
        if ref not in refs:
            refs[ref] = rgb(ref)
        col, alpha = keyed[iso]
        if name in MINUS and (ISO / f'{MINUS[name]}.png').exists():
            oc, oa = key(MINUS[name])
            theirs = (oa > 0.5) & (np.abs(oc - col).sum(2) < 60)
            alpha = np.where(nd.binary_opening(theirs, iterations=1), 0, alpha)
        alpha = pick(alpha, box)
        dx, dy = align(col, alpha, refs[ref])
        col, alpha = shift(col, dx, dy), shift(alpha, dx, dy)
        if name.startswith('b-wall'):
            alpha = np.where(lamps, 0, alpha)
        ys, xs = np.nonzero(alpha > 0.04)
        if not len(ys):
            print('пусто', name)
            continue
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([col, alpha * 255]).clip(0, 255).astype(np.uint8)[y0:y1, x0:x1]
        w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
        Image.fromarray(rgba).resize((w, h), Image.LANCZOS).save(OUT / f'{name}.webp', quality=92, alpha_quality=100)
        rx, ry = to_room(x0, y0)
        frames[name] = (round(rx), round(ry), w, h)
        print(f'{name}: сдвиг {dx},{dy}')
    lines = [
        '// Сгенерировано scripts/cut_bistro.py — не править руками',
        f'export const BISTRO_ROOM = {{ w: {ROOM_W}, h: {ROOM_H} }};',
        '/** Кусочки зала бистро «место-вещь[-half|-full]»: x, y, w, h в пикселях комнаты */',
        'export const BISTRO_FRAMES: Record<string, [number, number, number, number]> = {',
        *sorted(f"  '{n}': [{x}, {y}, {w}, {h}]," for n, (x, y, w, h) in frames.items()),
        '};',
        '',
    ]
    (ROOT / 'src' / 'game' / 'bistroFrames.ts').write_text('\n'.join(lines))
    print(len(frames), 'кусочков')


if __name__ == '__main__':
    main()
