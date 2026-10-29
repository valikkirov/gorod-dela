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
import os
MATTE = SRC / 'matte'  # альфа-маски вырезки фона (Magnific «удалить фон» по кадрам из HALL_CTX; стойка у окна — по кадру ~flat)
CTX = Path(os.environ['HALL_CTX']) if os.environ.get('HALL_CTX') else None
MARGIN = 12
W, H = 1024, 768
THRESHOLD = 30  # сумма разниц по RGB после размытия, ниже — шум перерисовки

# Раскладки: какая вещь на каком месте и прямоугольник места (в пикселях 1024×768).
# Порядок важен: пиксель достаётся первому прямоугольнику, в который попал.
LAYOUTS = {
    'L1': {
        'states': {'': 'L1', 'half': 'L1h', 'full': 'L1f'},
        # Дополнительные прямоугольники мест (проверяются первыми): стойка уходит под окно левее цветка
        'extra': [
            ('small-1', (44, 400, 118, 445)),
            ('small-1', (44, 445, 100, 570)),
            ('window', (88, 280, 192, 350)),
            ('nook', (192, 232, 246, 300)),
            ('window', (88, 440, 215, 530)),
        ],
        'slots': [
            ('wall-1', 'picture', (305, 190, 362, 262)),
            ('wall-2', 'clock', (350, 136, 398, 196)),
            ('corner', 'sofa', (240, 270, 392, 395)),
            ('nook', 'monstera', (196, 300, 236, 350)),
            ('shelf', 'bookshelf', (392, 178, 484, 384)),
            ('small-1', 'floorlamp', (44, 400, 100, 570)),
            ('window', 'bar', (88, 296, 246, 440)),
            ('table-2', 'table2', (222, 488, 418, 608)),
            ('table-3', 'table2', (438, 488, 640, 608)),
            ('table-1', 'table2', (340, 392, 525, 497)),
        ],
        # Где искать гостей: впереди стоящие места первыми, чтобы их головы не достались столу позади
        'guests': [
            ('table-2', (222, 430, 418, 610)),
            ('table-3', (438, 430, 640, 610)),
            ('corner', (246, 262, 358, 425)),
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
# Неудачные кусочки: за столом на четверых у витрины «полный» вышел с одним гостем — берётся «наполовину»
SKIP = {'table-4-table4-full'}
# Место с вещью None — лишнее, что модель дорисовала сама: забираем пиксели, но не сохраняем.
# Вещи, которые есть в нескольких раскладках, берутся из первой
SEATED = {'table2', 'table4', 'sofa', 'bar'}


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.int32)


def blur(img: np.ndarray) -> np.ndarray:
    return nd.gaussian_filter(img.astype(np.float32), sigma=(1.2, 1.2, 0))


def changed(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Где картинки различаются: размытая разница (перерисовка шумит по пикселю), без мелкого мусора"""
    m = np.abs(blur(a) - blur(b)).sum(2) > THRESHOLD
    m = nd.binary_opening(m, iterations=1)
    return nd.binary_closing(m, iterations=3)


def solid_area(m: np.ndarray, min_size: int) -> np.ndarray:
    lab, n = nd.label(m)
    if not n:
        return m
    sizes = nd.sum(m, lab, range(1, n + 1))
    return np.isin(lab, np.nonzero(sizes >= min_size)[0] + 1)


def by_rects(m: np.ndarray, rects, index, near: int) -> np.ndarray:
    """Номер места для пикселей m: первый прямоугольник, в который попал; остальное — к ближайшему не дальше near"""
    seed = np.zeros(m.shape, np.int32)
    for slot, (x0, y0, x1, y1) in rects:
        box = np.zeros(m.shape, bool)
        box[y0:y1, x0:x1] = True
        seed[(seed == 0) & box & m] = index[slot]
    if near:
        dist, (iy, ix) = nd.distance_transform_edt(seed == 0, return_indices=True)
        lab = seed[iy, ix]
        lab[(~m) | (dist > near)] = 0
        return lab
    return seed


def slot_masks(lab: np.ndarray, n: int) -> dict[int, np.ndarray]:
    """Маска каждого места: без дыр (пол между ножками — тот же пол) и с запасом в 2 px на контур"""
    out = {}
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() < 50:
            continue
        m = solid_area(m, 40)
        m = nd.binary_fill_holes(nd.binary_closing(m, iterations=3))
        out[i] = nd.binary_dilation(m, iterations=2)
    return out


def rgba(empty: np.ndarray, img: np.ndarray, mask: np.ndarray, soft: bool, keep: np.ndarray) -> np.ndarray:
    """Кусок непрозрачный, кроме мест, где он совпадает с пустой комнатой (там прозрачно — нет «ступенек»
    от чуть другого тона стены). Для коврика (soft) всё, что похоже на пол (такой же или ровно темнее — тень),
    становится полупрозрачным чёрным: кусок не закрывает коврик голым полом. keep — гости, их не трогаем"""
    out = np.zeros((*mask.shape, 4), np.uint8)
    a = blur(empty) + 1
    b = blur(img) + 1
    same = mask & ~keep & (np.abs(a - b).sum(2) < 14)
    vis = mask & ~same
    out[vis, :3] = img[vis]
    out[vis, 3] = 255
    if soft:
        ratio = b.sum(2) / a.sum(2)
        resid = np.abs(b - a * ratio[..., None]).max(2)
        floor = vis & ~keep & (nd.maximum_filter(resid, size=5) < 10) & (ratio > 0.72)
        thing = vis & ~floor
        floor |= thing & ~keep & ~solid_area(thing, 30)  # мелкие островки «вещи» среди пола — тоже пол
        out[floor, :3] = 0
        out[floor, 3] = np.clip((1 - ratio[floor]) * 255, 0, 255).astype(np.uint8)
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


# Бариста нарисован в пустой комнате за стойкой. Комната для игры — без него (empty-clean.png, Magnific
# preciseEdit «убрать бариста»), а сам он — отдельный слой barista.webp размером с комнату: виден, только
# когда бариста на смене. Меняется только прямоугольник вокруг бариста — остальная комната та же.
BARISTA_BOX = (630, 205, 770, 372)


def split_barista(empty: np.ndarray, img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    if not (SRC / 'empty-clean.png').exists():
        return img
    clean = load('empty-clean')
    x0, y0, x1, y1 = BARISTA_BOX
    diff = np.zeros(empty.shape[:2], bool)
    d = np.abs(nd.gaussian_filter(empty.astype(float), (1.5, 1.5, 0)) - nd.gaussian_filter(clean.astype(float), (1.5, 1.5, 0))).sum(2)
    diff[y0:y1, x0:x1] = d[y0:y1, x0:x1] > 40
    diff = nd.binary_closing(diff, iterations=3)
    diff = nd.binary_fill_holes(diff)
    diff = nd.binary_dilation(diff, iterations=3)
    soft = np.clip(nd.gaussian_filter(diff.astype(float), 1.2) * 1.6, 0, 1)
    ox, oy, ox1, oy1 = box
    room_rgba = np.array(img)
    sub = (slice(oy, oy1), slice(ox, ox1))
    # Комната: внутри маски — пиксели без бариста, плавно на краю
    k = soft[sub][..., None]
    room_rgba[..., :3] = (room_rgba[..., :3] * (1 - k) + clean[sub] * k).astype(np.uint8)
    # Слой бариста: исходные пиксели с альфой маски
    layer = np.zeros_like(room_rgba)
    layer[..., :3] = empty[sub]
    layer[..., 3] = (soft[sub] * 255).astype(np.uint8)
    Image.fromarray(layer).save(OUT / 'barista.webp', quality=90)
    return Image.fromarray(room_rgba)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.webp'):
        f.unlink()
    empty = load('empty')
    img, (ox, oy, ox1, oy1) = room(empty)
    img = split_barista(empty, img, (ox, oy, ox1, oy1))
    img.save(OUT / 'room.webp', quality=90)
    frames: list[str] = []
    seen: set[str] = set()
    for layout in LAYOUTS.values():
        slots = layout['slots']
        index = {}
        for i, (slot, _, _) in enumerate(slots):
            index.setdefault(slot, i + 1)
        base = load(layout['states'][''])
        rects = layout.get('extra', []) + [(s_, r) for s_, _, r in slots]
        base_lab = by_rects(changed(empty, base), rects, index, 70)
        for state, src in layout['states'].items():
            if not (SRC / f'{src}.png').exists():
                print('нет исходника:', src)
                continue
            if state:
                # Гости и чашки: что изменилось и против пустой комнаты, и против той же мебели без гостей.
                # Раздаются по прямоугольникам гостей, впереди стоящие места первыми — голова сидящего
                # впереди остаётся у переднего стола. Мебель остаётся за своими местами.
                pic = load(src)
                new = changed(empty, pic) & changed(base, pic)
                for other in layout.get('bleed', []):
                    new &= changed(load(other), pic)
                lab = base_lab.copy()
                guests = by_rects(new, layout['guests'], index, 0)
                # Гость целиком — одному месту: если почти весь он у одного стола, ноги не уходят соседнему
                comp, n = nd.label(new)
                for k in range(1, n + 1):
                    where = comp == k
                    votes = np.bincount(guests[where], minlength=len(slots) + 1)
                    votes[0] = 0
                    if votes.sum() < 0.4 * where.sum():
                        guests[where] = 0  # почти целиком вне мест — дорисованное моделью лишнее (столик у дивана и т.п.)
                    elif votes.max() >= 0.8 * votes.sum():
                        guests[where] = votes.argmax()
                lab[guests > 0] = guests[guests > 0]
            else:
                pic, lab = base, base_lab
                guests = np.zeros(lab.shape, np.int32)
            masks = slot_masks(lab, len(slots))
            for i, (slot, item, _) in enumerate(slots):
                if item is None or (state and item not in SEATED) or i + 1 not in masks:
                    continue
                name = f'{slot}-{item}' + (f'-{state}' if state else '')
                if name in seen or name in SKIP:
                    continue
                seen.add(name)
                mask = masks[i + 1]
                ys, xs = np.nonzero(mask)
                x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                # Где эту мебель закрыл гость другого места (голова сидящего впереди), берём мебель без гостей
                other = ((guests > 0) & (guests != i + 1))[..., None]
                src_img = np.where(other, base, pic)
                # Кадр с запасом — для вырезки фона (matte): так видно, что вещь, а что комната
                cx0, cy0, cx1, cy1 = max(0, x0 - MARGIN), max(0, y0 - MARGIN), min(W, x1 + MARGIN), min(H, y1 + MARGIN)
                if CTX:
                    Image.fromarray(pic[cy0:cy1, cx0:cx1].astype(np.uint8)).save(CTX / f'{name}.png')
                    # Вариант на ровном фоне: всё, что совпадает с пустой комнатой, — серое (для вещей у стены)
                    keep = nd.binary_dilation(changed(empty, pic) & nd.binary_dilation(mask, iterations=6), iterations=2)
                    flat = np.where(keep[..., None], pic, 205)[cy0:cy1, cx0:cx1].astype(np.uint8)
                    Image.fromarray(flat).save(CTX / f'{name}~flat.png')
                matte = MATTE / f'{name}.png'
                if matte.exists() and slot != 'rug':
                    # Чистая вырезка: альфа от удаления фона плюс то, что заметно отличается от пустой комнаты
                    # (стойку у стены удаление фона считает стеной). Только в пределах своего места (+8 px).
                    # Цвета — из картинки целиком: соседние куски одного состояния совпадают пиксель в пиксель.
                    a = np.zeros(mask.shape, np.float32)
                    m = Image.open(matte).convert('RGBA').resize((cx1 - cx0, cy1 - cy0), Image.LANCZOS)
                    a[cy0:cy1, cx0:cx1] = np.asarray(m)[..., 3] / 255.0
                    a *= nd.binary_dilation(mask, iterations=3)
                    # Дыры внутри вырезки: если там не пол (заметно отличается от пустой комнаты) — это вещь
                    # (столешница цвета пола), заливаем; пол между ножками остаётся прозрачным
                    solid = a > 0.5
                    holes, n_h = nd.label(nd.binary_fill_holes(nd.binary_closing(solid, iterations=8)) & ~solid)
                    if n_h:
                        d = np.abs(blur(empty) - blur(pic)).sum(2)
                        means = nd.mean(d, holes, range(1, n_h + 1))
                        cy = [c[0] for c in nd.center_of_mass(np.ones_like(d), holes, range(1, n_h + 1))]
                        ys_s = np.nonzero(solid)[0]
                        top, bottom = ys_s.min(), ys_s.max()
                        # Столешница и сиденья — в верхней части вещи; просветы между ножками — внизу, там пол
                        fillers = [k + 1 for k in range(n_h) if means[k] > 25 or cy[k] < top + 0.62 * (bottom - top)]
                        a[np.isin(holes, fillers)] = 1
                    # Оторванные кусочки (край соседнего стула, макушка соседа) — прочь: остаются крупные части
                    lab_a, n_a = nd.label(a > 0.3)
                    if n_a:
                        sizes = nd.sum(np.ones_like(a), lab_a, range(1, n_a + 1))
                        big = np.nonzero(np.array(sizes) >= 0.12 * max(sizes))[0] + 1
                        a *= nd.binary_dilation(np.isin(lab_a, big), iterations=2)
                    ys, xs = np.nonzero(a > 0.02)
                    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                    out = np.dstack([pic.astype(np.uint8), (np.clip(a, 0, 1) * 255).round().astype(np.uint8)])[y0:y1, x0:x1]
                    Image.fromarray(out).save(OUT / f'{name}.webp', quality=92, alpha_quality=100)
                    frames.append(f"  '{name}': [{x0 - ox}, {y0 - oy}, {x1 - x0}, {y1 - y0}],")
                    continue
                # Столы стоят на коврике — им нужен ещё вариант с прозрачным полом
                for soft in (False, True) if slot.startswith('table') else (False,):
                    piece = rgba(empty, src_img, mask, soft, nd.binary_dilation(guests == i + 1, iterations=2))[y0:y1, x0:x1]
                    file = name + ('~rug' if soft else '')
                    Image.fromarray(piece).save(OUT / f'{file}.webp', quality=92, alpha_quality=100)
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
