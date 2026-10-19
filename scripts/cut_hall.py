"""Режет зал кафе на кусочки мебели: каждая вещь — разница между картинкой с ней и пустой комнатой.

Запуск из корня репозитория:  python3 scripts/cut_hall.py

Исходники — art-src/v2/hall3: пустая комната (empty.png) и её правки «тот же зал, но с мебелью / с гостями».
Все правки сделаны поверх одной комнаты, поэтому кусочек ложится ровно на своё место, без белой каймы:
вокруг вещи тот же пол, что под ней. Тени становятся полупрозрачным затемнением — так они ложатся и на коврик.

Выход: src/game/art/hall3/*.webp и src/game/hallFrames.ts (где лежит каждый кусочек в пикселях комнаты).
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'hall3'
OUT = ROOT / 'src' / 'game' / 'art' / 'hall3'
THRESHOLD = 45  # сумма разниц по RGB, ниже — шум перерисовки

# Раскладки: какая вещь на каком месте и прямоугольник места (в пикселях 1024×768).
# Порядок важен: пиксель достаётся первому прямоугольнику, в который попал.
LAYOUTS = {
    'L1': {
        'states': {'': 'L1', 'half': 'L1h', 'full': 'L1f'},
        'slots': [
            ('wall-1', 'picture', (305, 190, 362, 262)),
            ('wall-2', 'clock', (350, 136, 406, 196)),
            ('nook', 'monstera', (178, 232, 246, 345)),
            ('corner', 'sofa', (240, 270, 392, 395)),
            ('shelf', 'bookshelf', (392, 178, 484, 384)),
            ('small-1', 'floorlamp', (44, 400, 122, 570)),
            ('window', 'bar', (88, 296, 246, 530)),
            ('table-2', 'table2', (222, 488, 418, 608)),
            ('table-3', 'table2', (438, 488, 640, 608)),
            ('table-1', 'table2', (340, 392, 525, 497)),
        ],
        # Где искать гостей: впереди стоящие места первыми, чтобы их головы не достались столу позади
        'guests': [
            ('table-2', (222, 430, 418, 610)),
            ('table-3', (438, 430, 640, 610)),
            ('corner', (246, 262, 340, 425)),
            ('corner', (340, 262, 374, 372)),
            ('window', (88, 270, 250, 530)),
            ('table-1', (340, 300, 532, 497)),
        ],
    },
    'L2': {
        'states': {'': 'L2b', 'half': 'L2bh', 'full': 'L2bf'},
        # В картинки с гостями модель перетащила обстановку из L1 (диван, стойку, шкаф) — её не берём
        'bleed': ['L1'],
        'slots': [
            ('wall-1', None, (290, 135, 410, 258)),
            ('corner', 'games', (236, 285, 416, 384)),
            ('shelf', 'monstera', (392, 245, 506, 386)),
            ('nook', 'floorlamp', (180, 236, 250, 392)),
            ('small-1', 'plant', (56, 448, 140, 576)),
            ('table-2', 'table4', (210, 452, 404, 618)),
            ('table-3', 'table4', (430, 466, 620, 628)),
            ('table-4', 'table4', (636, 496, 830, 640)),
            ('table-1', 'table4', (414, 396, 545, 500)),
        ],
        'guests': [
            ('table-2', (205, 420, 410, 620)),
            ('table-3', (428, 420, 625, 630)),
            ('table-4', (634, 430, 840, 642)),
            ('table-1', (392, 310, 552, 502)),
        ],
    },
    'L3': {
        'states': {'': 'L3', 'half': 'L3h', 'full': 'L3f'},
        'slots': [
            ('shelf', 'games', (405, 212, 488, 384)),
            ('corner', 'bookshelf', (232, 138, 412, 388)),
            ('nook', 'plant', (172, 262, 246, 392)),
            ('small-1', 'monstera', (52, 402, 182, 578)),
            ('table-4', 'table2', (656, 446, 862, 604)),
        ],
        'guests': [('table-4', (596, 400, 870, 610))],
    },
    'R': {'states': {'': 'R'}, 'slots': [('rug', 'rug', (150, 380, 700, 640))]},
}
# Место с вещью None — лишнее, что модель дорисовала сама: забираем пиксели, но не сохраняем.
# Вещи, которые есть в нескольких раскладках, берутся из первой
SEATED = {'table2', 'table4', 'sofa', 'bar'}


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.int32)


def changed(empty: np.ndarray, img: np.ndarray) -> np.ndarray:
    m = np.abs(empty - img).sum(2) > THRESHOLD
    m = nd.binary_opening(m)
    m = nd.binary_closing(m, iterations=2)
    # Маленькие дырки (столешница цвета пола) заливаем, большие — пол между ножками — оставляем прозрачными
    holes = nd.binary_fill_holes(m) & ~m
    lab, n = nd.label(holes)
    if n:
        sizes = nd.sum(holes, lab, range(1, n + 1))
        small = np.isin(lab, np.nonzero(sizes < 500)[0] + 1)
        m |= small
    return m


def assign(m: np.ndarray, slots) -> np.ndarray:
    """Номер места для каждого изменённого пикселя: по прямоугольникам, остальное — к ближайшему"""
    seed = np.zeros(m.shape, np.int32)
    for i, (_, _, (x0, y0, x1, y1)) in enumerate(slots):
        box = np.zeros(m.shape, bool)
        box[y0:y1, x0:x1] = True
        seed[(seed == 0) & box & m] = i + 1
    dist, (iy, ix) = nd.distance_transform_edt(seed == 0, return_indices=True)
    lab = seed[iy, ix]
    lab[~m] = 0
    lab[dist > 70] = 0  # далеко от всех мест — случайная перерисовка, не берём
    return lab


def assign_guests(empty, base, base_lab, pic, slots, guests, bleed=()) -> tuple[np.ndarray, np.ndarray]:
    """Картинка с гостями: мебель остаётся за своим местом (и берётся из картинки без гостей),
    а всё новое (гости, чашки) раздаётся по прямоугольникам гостей — впереди стоящие места первыми.
    Что вне прямоугольников — лишняя перерисовка. Возвращает места и картинку, из которой брать цвета"""
    index = {slot: i + 1 for i, (slot, _, _) in enumerate(slots)}
    lab = base_lab.copy()
    new = changed(empty, pic) & (np.abs(base - pic).sum(2) > THRESHOLD)
    for other in bleed:
        new &= np.abs(other - pic).sum(2) > THRESHOLD
    new = nd.binary_closing(nd.binary_opening(new), iterations=2)
    taken = np.zeros(new.shape, bool)
    for slot, (x0, y0, x1, y1) in guests:
        box = np.zeros(new.shape, bool)
        box[y0:y1, x0:x1] = True
        part = new & box & ~taken
        lab[part] = index[slot]
        taken |= part
    return lab, np.where(taken[..., None], pic, base)


def rgba(empty: np.ndarray, img: np.ndarray, mask: np.ndarray, soft: bool) -> np.ndarray:
    """Вещь непрозрачная. Для коврика (soft) тень — ровное затемнение пола, примыкающее к краю куска, —
    становится полупрозрачным чёрным: тогда она ложится на коврик, а не закрывает его голым полом"""
    out = np.zeros((*mask.shape, 4), np.uint8)
    shadow = np.zeros(mask.shape, bool)
    if soft:
        a = empty.astype(np.float32) + 1
        b = img.astype(np.float32) + 1
        ratio = b.sum(2) / a.sum(2)
        resid = np.abs(b - a * ratio[..., None]).max(2)
        flat = nd.maximum_filter(resid, size=5) < 10
        cand = nd.binary_opening(mask & flat & (ratio < 0.99) & (ratio > 0.6))
        # Оставляем только то, что касается пола снаружи куска: плоские доски стула внутри контура — не тень
        outside = nd.binary_dilation(~mask, iterations=1)
        lab, n = nd.label(cand)
        if n:
            touching = np.unique(lab[outside & cand])
            shadow = np.isin(lab, touching[touching > 0])
    solid = mask & ~shadow
    out[solid, :3] = img[solid]
    out[solid, 3] = 255
    if soft:
        out[shadow, 3] = np.clip((1 - ratio[shadow]) * 255, 0, 255).astype(np.uint8)
    return out


def room(empty: np.ndarray) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Комната без белого фона вокруг и её рамка в исходной картинке"""
    white = (empty > 232).all(2)
    lab, _ = nd.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg = nd.binary_erosion(bg, iterations=1, border_value=1)
    ys, xs = np.nonzero(~bg)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    im = np.dstack([empty.astype(np.uint8), np.where(bg, 0, 255).astype(np.uint8)])
    return Image.fromarray(im).crop(box), box


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.webp'):
        f.unlink()
    empty = load('empty')
    img, (ox, oy, ox1, oy1) = room(empty)
    img.save(OUT / 'room.webp', quality=90)
    frames: list[str] = []
    seen: set[tuple[str, str]] = set()
    for layout in LAYOUTS.values():
        slots = layout['slots']
        base_name = layout['states']['']
        base = load(base_name)
        base_lab = assign(changed(empty, base), slots)
        for state, src in layout['states'].items():
            if not (SRC / f'{src}.png').exists():
                print('нет исходника:', src)
                continue
            if state:
                bleed = [load(b) for b in layout.get('bleed', [])]
                lab, pic = assign_guests(empty, base, base_lab, load(src), slots, layout['guests'], bleed)
            else:
                lab, pic = base_lab, base
            for i, (slot, item, _) in enumerate(slots):
                if item is None or (state and item not in SEATED):
                    continue
                key = (slot, f'{item}{"-" + state if state else ""}')
                if key in seen:
                    continue
                # +2 px: контур вещи часто почти цвета пола и выпадает из разницы — без него край «пунктирный»
                mask = nd.binary_dilation(lab == i + 1, iterations=2) & ((lab == 0) | (lab == i + 1))
                if mask.sum() < 50:
                    print('пусто:', slot, item, state)
                    continue
                seen.add(key)
                ys, xs = np.nonzero(mask)
                x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                name = f'{slot}-{key[1]}'
                # Столы стоят на коврике — им нужен ещё вариант с прозрачным полом
                for soft in (False, True) if slot.startswith('table') else (False,):
                    piece = rgba(empty, pic, mask, soft)[y0:y1, x0:x1]
                    file = name + ('~rug' if soft else '')
                    Image.fromarray(piece).save(OUT / f'{file}.webp', lossless=False, quality=90, alpha_quality=100)
                    frames.append(f"  '{file}': [{x0 - ox}, {y0 - oy}, {x1 - x0}, {y1 - y0}],")
    ts = [
        '// Сгенерировано scripts/cut_hall.py — не править руками',
        f'export const HALL_ROOM = {{ w: {ox1 - ox}, h: {oy1 - oy} }};',
        '/** Кусочки зала «место-вещь[-half|-full]»: x, y, w, h в пикселях комнаты */',
        'export const HALL_FRAMES: Record<string, [number, number, number, number]> = {',
        *sorted(frames),
        '};',
        '',
    ]
    (ROOT / 'src' / 'game' / 'hallFrames.ts').write_text('\n'.join(ts))
    print(len(frames), 'кусочков')


if __name__ == '__main__':
    main()
