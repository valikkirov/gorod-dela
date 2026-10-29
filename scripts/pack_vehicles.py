"""Транспорт «Графики 2.0»: листы из трёх ракурсов (Magnific) → атлас src/game/art/vehicles.png.

Исходник — art-src/v2/vehicles/<вид>.png: на белом фоне одна машина три раза, слева направо:
едет к нам (вниз), едет от нас (вверх), едет вправо. Влево — зеркало правого.
Размер в мире задаёт таблица SIZE: ширина машины, едущей вниз, и длина машины, едущей вбок.
Мигалки скорой и полиции — отдельные кадры *-flash: поверх крыши рисуется цветной отблеск.

Выход: src/game/art/vehicles.png (2× мира) и src/game/vehicleFrames.ts (кадры в единицах 1×).
Запуск из корня: python3 scripts/pack_vehicles.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'vehicles'
OUT_PNG = ROOT / 'src' / 'game' / 'art' / 'vehicles.png'
OUT_TS = ROOT / 'src' / 'game' / 'vehicleFrames.ts'
SCALE = 2  # атлас крупнее мира в 2 раза

# вид: (ширина вниз/вверх, длина вбок) в единицах мира; кадры называются <вид>-<направление>
SIZE = {
    'car-a': (36, 64), 'car-b': (36, 66), 'car-c': (36, 66),
    'van': (40, 72), 'truck': (44, 104), 'ambulance': (42, 78), 'police': (36, 66), 'bus': (46, 126),
    'garbage': (44, 100), 'scooter': (16, 30), 'bike': (16, 36), 'tram': (50, 190),
}
# На листе сбоку машина смотрит влево (капот слева) — тогда «вправо» — это зеркало
FACES_LEFT = {'car-a', 'car-b', 'car-c', 'police'}
# Надпись на боку (доли ширины и высоты бокового вида): в зеркальном кадре её возвращаем читаемой
TEXT_BOX = {'ambulance': (0.15, 0.49, 0.36, 0.58), 'police': (0.31, 0.48, 0.49, 0.58)}
FLASH = {'ambulance': [(230, 40, 40), (40, 90, 230)], 'police': [(40, 90, 230), (230, 40, 40)]}


def cutout(im: Image.Image, fill: bool = True) -> list[Image.Image]:
    """Три ракурса на белом фоне: делим лист на три полосы по пустым столбцам, фон — белое, связанное с краем.
    fill=False — для велосипеда и самоката: просветы между спицами и рамой остаются прозрачными."""
    a = np.asarray(im.convert('RGB')).astype(int)
    fg = a.min(2) < 236
    cols = nd.binary_closing(fg.any(0), iterations=6)
    lab, n = nd.label(cols)
    runs = sorted(nd.find_objects(lab), key=lambda r: r[0].stop - r[0].start, reverse=True)[:3]
    runs = sorted(runs, key=lambda r: r[0].start)
    out = []
    for (sx,) in runs:
        band = fg[:, sx]
        rows = np.nonzero(band.any(1))[0]
        sy = slice(rows.min(), rows.max() + 1)
        m = band[sy]
        if fill:
            # Белое внутри контура (кузов скорой, полиции) — часть машины; фон — белое, касающееся края
            white = ~m
            wl, _ = nd.label(white)
            edge = set(np.unique(np.concatenate([wl[0], wl[-1], wl[:, 0], wl[:, -1]]))) - {0}
            m = ~np.isin(wl, list(edge))
        alpha = nd.gaussian_filter(m.astype(float), 0.7)
        rgba = np.dstack([a[sy, sx].astype(np.uint8), (alpha * 255).clip(0, 255).astype(np.uint8)])
        out.append(Image.fromarray(rgba, 'RGBA'))
    return out


def fit(img: Image.Image, w: int | None = None, h: int | None = None) -> Image.Image:
    # Размеры чётные: в мире кадр — ровно половина пикселей атласа
    if w:
        h = 2 * round(img.height * w / img.width / 2)
    else:
        w = 2 * round(img.width * h / img.height / 2)
    return img.resize((w, h), Image.LANCZOS)


def flash(img: Image.Image, color) -> Image.Image:
    """Отблеск мигалки над крышей"""
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    w, h = img.size
    d.ellipse([w * 0.18, -h * 0.05, w * 0.82, h * 0.32], fill=color + (150,))
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.08))
    out = img.copy()
    out.alpha_composite(Image.composite(glow, Image.new('RGBA', img.size, (0, 0, 0, 0)), img.split()[3]))
    return out


def main() -> None:
    frames: dict[str, Image.Image] = {}
    for kind, (wid, length) in SIZE.items():
        f = SRC / f'{kind}.png'
        if not f.exists():
            continue
        down, up, side = cutout(Image.open(f), fill=kind not in ('scooter', 'bike', 'tram'))
        mirror = side.transpose(Image.FLIP_LEFT_RIGHT)
        if kind in TEXT_BOX:
            w, h = side.size
            x0, y0, x1, y1 = (round(v * (w if i % 2 == 0 else h)) for i, v in enumerate(TEXT_BOX[kind]))
            mirror.paste(side.crop((x0, y0, x1, y1)), (w - x1, y0))
        right, left = (mirror, side) if kind in FACES_LEFT else (side, mirror)
        views = {
            'down': fit(down, w=wid * SCALE),
            'up': fit(up, w=wid * SCALE),
            'right': fit(right, w=length * SCALE),
            'left': fit(left, w=length * SCALE),
        }
        for d, img in views.items():
            frames[f'{kind}-{d}'] = img
            if kind in FLASH:
                frames[f'{kind}-{d}-flash'] = flash(img, FLASH[kind][0 if d in ('down', 'right') else 1])
    # Простая упаковка рядами
    W = 1024
    x = y = row = 0
    place = {}
    for name, img in frames.items():
        if x + img.width + 4 > W:
            x, y, row = 0, y + row + 4, 0
        place[name] = (x, y)
        x += img.width + 4
        row = max(row, img.height)
    H = y + row + 4
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for name, img in frames.items():
        sheet.alpha_composite(img, place[name])
    sheet.save(OUT_PNG, optimize=True)
    lines = ['// Сгенерировано scripts/pack_vehicles.py — не править руками', 'export const VEHICLE_FRAMES: Record<string, [number, number, number, number]> = {']
    for name, img in frames.items():
        px, py = place[name]
        lines.append(f"  '{name}': [{px / SCALE}, {py / SCALE}, {img.width / SCALE}, {img.height / SCALE}],")
    lines.append('};\n')
    OUT_TS.write_text('\n'.join(lines))
    print('кадров:', len(frames), 'атлас', sheet.size)


if __name__ == '__main__':
    main()
