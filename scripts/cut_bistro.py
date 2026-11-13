"""Режет зал бистро на кусочки мебели — так же, как cut_hall.py для кафе: вещь — разница между картинкой
с ней и пустой комнатой. Все картинки — правки одной пустой комнаты (Magnific, Nano Banana 2.1),
поэтому кусочек ложится ровно на своё место.

Запуск из корня репозитория:  python3 scripts/cut_bistro.py

Исходники — art-src/v2/bistro: empty.png (пустой зал с раздачей и кассой), L1/L1h/L1f (обеденная
раскладка: пусто, наполовину, полно гостей), L2 (другие вещи на тех же местах).
Выход: src/game/art/bistro/*.webp и src/game/bistroFrames.ts.
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'bistro'
OUT = ROOT / 'src' / 'game' / 'art' / 'bistro'
# Комната на картинке 1200×896 и размер, в котором её рисует игра (как у зала кафе)
CROP = (15, 93, 1185, 785)
ROOM_W, ROOM_H = 997, 590
THRESHOLD = 34

# Места: вещь и прямоугольники (в пикселях исходника). Порядок — кто забирает пиксель первым:
# передние столы раньше центрального, иначе спинки их стульев достаются общему столу
LAYOUTS = {
    'L1': [
        ('b-front-1', 'table2', [(245, 572, 472, 718)]),
        ('b-front-2', 'table2', [(533, 572, 762, 718)]),
        ('b-side', 'booth', [(812, 475, 1052, 742)]),
        ('b-door', 'coatstand', [(976, 300, 1046, 452), (1048, 440, 1138, 682)]),
        ('b-corner', 'cooler', [(290, 296, 402, 478), (222, 312, 292, 430)]),
        ('b-window', 'stools', [(72, 336, 292, 648)]),
        ('b-center', 'commune', [(356, 455, 718, 612)]),
        ('b-wall-l', 'herbs', [(228, 160, 412, 268)]),
        ('b-wall-c', 'clock', [(478, 140, 542, 206)]),
        ('b-wall-r', 'menuboard', [(622, 138, 920, 282)]),
    ],
    'L2': [
        ('b-front-1', None, [(245, 572, 472, 718)]),
        ('b-front-2', None, [(533, 572, 762, 718)]),
        ('b-side', 'table4', [(806, 450, 1015, 650)]),
        ('b-door', 'plant', [(1042, 445, 1140, 690)]),
        ('b-corner', 'palm', [(200, 250, 350, 478)]),
        ('b-window', 'ficus', [(72, 326, 248, 655)]),
        ('b-center', 'pair4', [(286, 425, 752, 592)]),
        ('b-wall-l', 'poster', [(332, 162, 424, 282)]),
        ('b-wall-r', 'tv', [(676, 156, 838, 268)]),
    ],
}
# Картинки с гостями: те же места, гостей ищем чуть выше (головы над спинками)
STATES = {'half': 'L1h', 'full': 'L1f'}
SEATED = {'table2', 'stools', 'commune', 'booth'}
HEAD = 70


def rgb(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB').resize((1200, 896))).astype(np.float32)


def blur(a: np.ndarray) -> np.ndarray:
    return nd.uniform_filter(a, size=(5, 5, 1))


def to_room(x: float, y: float) -> tuple[float, float]:
    k = ROOM_W / (CROP[2] - CROP[0])
    return (x - CROP[0]) * k, (y - CROP[1]) * k


def save_piece(pic: np.ndarray, alpha: np.ndarray, name: str) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(alpha > 0.04)
    if not len(ys):
        return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([pic, alpha * 255]).clip(0, 255).astype(np.uint8)[y0:y1, x0:x1]
    im = Image.fromarray(rgba)
    k = ROOM_W / (CROP[2] - CROP[0])
    w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
    im.resize((w, h), Image.LANCZOS).save(OUT / f'{name}.webp', quality=92, alpha_quality=100)
    rx, ry = to_room(x0, y0)
    return round(rx), round(ry), w, h


def cut(layout: str, picture: str, empty: np.ndarray, frames: dict, suffix: str = '', only_seated: bool = False) -> dict:
    kept: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    pic = rgb(picture)
    diff = np.abs(blur(pic) - blur(empty)).sum(2)
    strong = diff > THRESHOLD
    taken = np.zeros(strong.shape, bool)
    for slot, item, rects in LAYOUTS[layout]:
        area = np.zeros(strong.shape, bool)
        for x0, y0, x1, y1 in rects:
            top = y0 - (HEAD if suffix and item in SEATED else 0)
            area[max(0, top):y1, x0:x1] = True
        mine = strong & area & ~taken
        taken |= mine
        if item is None or (only_seated and item not in SEATED):
            continue
        # Крупные части и всё, что внутри них; крошки шума — прочь
        mask = nd.binary_closing(mine, iterations=3)
        mask = nd.binary_fill_holes(mask) & area
        lab, n = nd.label(mask)
        if n > 1:
            sizes = nd.sum(mask, lab, range(1, n + 1))
            mask = np.isin(lab, np.nonzero(sizes >= max(80, sizes.max() * 0.04))[0] + 1)
        # Края мягкие: тень на полу — полупрозрачная по силе разницы
        soft = np.clip((diff - 12) / 60, 0, 1) * nd.binary_dilation(mask, iterations=3) * area
        alpha = np.maximum(mask.astype(np.float32), soft)
        alpha = np.maximum(alpha, nd.gaussian_filter(mask.astype(np.float32), 0.8) * mask.max())
        # Тень на полу — тот же пол, только темнее: делаем её чёрной полупрозрачной
        e, p = blur(empty) + 1, blur(pic) + 1
        ratio = p.sum(2) / e.sum(2)
        resid = np.abs(p - e * ratio[..., None]).max(2)
        shade = (resid < 10) & (ratio < 0.98) & (ratio > 0.45) & (alpha > 0) & ~nd.binary_erosion(mask, iterations=4)
        col = pic.copy()
        col[shade] = 0
        alpha[shade] = np.minimum(alpha[shade], np.clip((1 - ratio[shade]) * 1.3, 0, 1))
        name = f'{slot}-{item}{suffix}'
        fr = save_piece(col, alpha, name)
        if fr:
            frames[name] = fr
            kept[slot] = (alpha, col)
    return kept


def guests(base: dict, picture: str, furnished: np.ndarray, frames: dict, suffix: str) -> None:
    """Гости — разница между залом с гостями и тем же залом без них. Каждого гостя (связный кусок)
    отдаём месту, в чьём прямоугольнике его середина: так гость на ближней лавке общего стола
    не достаётся переднему столику, хотя заходит на его стулья"""
    pic = rgb(picture)
    g = np.abs(blur(pic) - blur(furnished)).sum(2) > THRESHOLD + 10
    g = nd.binary_opening(nd.binary_closing(g, iterations=2), iterations=1)
    lab, n = nd.label(g)
    owner: dict[int, str] = {}
    centers = nd.center_of_mass(g, lab, range(1, n + 1))
    sizes = nd.sum(g, lab, range(1, n + 1))
    for i, ((cy, cx), size) in enumerate(zip(centers, sizes), start=1):
        if size < 150:
            continue
        for slot, item, rects in LAYOUTS['L1']:
            if item in SEATED and any(x0 <= cx < x1 and y0 - 20 <= cy < y1 for x0, y0, x1, y1 in rects):
                owner[i] = slot
                break
    for slot, item, _ in LAYOUTS['L1']:
        if item not in SEATED or slot not in base:
            continue
        mine = np.isin(lab, [i for i, o in owner.items() if o == slot])
        mine = nd.binary_fill_holes(mine)
        alpha, col = base[slot]
        a = np.maximum(alpha, nd.gaussian_filter(mine.astype(np.float32), 0.7) * mine.max())
        c = np.where(mine[..., None], pic, col)
        fr = save_piece(c, a, f'{slot}-{item}{suffix}')
        if fr:
            frames[f'{slot}-{item}{suffix}'] = fr


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.webp'):
        f.unlink()
    empty = rgb('empty')
    room = Image.fromarray(empty.astype(np.uint8)).crop(CROP).resize((ROOM_W, ROOM_H), Image.LANCZOS)
    room.save(OUT / 'room.webp', quality=90)
    frames: dict[str, tuple[int, int, int, int]] = {}
    base = {}
    for layout in LAYOUTS:
        got = cut(layout, layout, empty, frames)
        if layout == 'L1':
            base = got
    for state, picture in STATES.items():
        guests(base, picture, rgb('L1'), frames, f'-{state}')
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
