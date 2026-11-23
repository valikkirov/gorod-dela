"""Английские вывески на зданиях — для игры на английском.

Вывески нарисованы прямо на фасадах. Скрипт стирает русскую надпись (заливает её цветом таблички
с inpaint, чтобы сохранить фактуру) и пишет английскую тем же цветом, шрифтом Inter ExtraBold.
Рамки надписей — в SIGNS (координаты в исходниках art-src/v2/buildings, 2×).

Собирает два атласа с той же раскладкой, что у русских:
  src/game/art/buildings-en.webp         — по art-src/v2/buildings
  src/game/art/buildings-winter-en.webp  — по зимним зданиям (pack_winter.snow_cut)
Кадры совпадают с BUILDING_FRAMES / BUILDING_WINTER_FRAMES (скрипт это проверяет).

Запуск: python3 scripts/en_signs.py  (после pack_v2.py и pack_winter.py)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'buildings'
ART = ROOT / 'src' / 'game' / 'art'
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'

# имя здания: (x0, y0, x1, y1 — где стоит русская надпись, английский текст)
SIGNS: dict[str, list[tuple[tuple[int, int, int, int], str]]] = {
    'bakery-open': [((100, 124, 265, 152), 'BAKERY')],
    'bc-right': [((255, 404, 450, 436), 'BUSINESS CENTER')],
    'bistro-open': [((150, 177, 320, 206), 'BISTRO')],
    'bistro-rent': [((232, 257, 342, 281), 'FOR RENT')],
    'cafe-open': [((160, 118, 320, 150), 'COFFEE')],
    'cafe-rent': [((107, 240, 166, 259), 'FOR RENT')],
    'cafe-rival': [((150, 116, 335, 152), 'SILVER SPOON')],
    'dl-alfa': [((360, 190, 435, 206), 'ALFA')],
    'dl-apart-1': [((40, 302, 95, 318), 'City')],
    'dl-bank': [((185, 339, 295, 366), 'BANK'), ((362, 372, 399, 381), 'ATM')],
    'dl-cowork': [((397, 293, 423, 305), 'HIVE')],
    'dl-east': [((180, 274, 290, 290), 'EASTGATE')],
    'dl-glass': [((422, 307, 468, 321), 'GLASS')],
    'dl-gym': [((150, 150, 305, 177), 'FITNESS')],
    'dl-institute': [((150, 75, 330, 91), 'INSTITUTE OF ECONOMICS')],
    'dl-meridian': [((150, 255, 325, 275), 'MERIDIAN')],
    'dl-shop': [((120, 74, 360, 101), 'SNACK')],
    'dl-tower': [((158, 487, 294, 509), 'DOWNTOWN')],
    'home-d-right': [((140, 220, 345, 247), 'PHARMACY')],
    'kiosk-open': [((25, 41, 183, 57), 'COFFEE TO GO')],
    'kiosk-rent': [((55, 100, 91, 111), 'FOR RENT')],
    'kiosk-rival': [((24, 41, 184, 58), 'RUSH BREW')],
    'premises2-open': [((60, 126, 300, 152), 'COFFEE')],
    'school': [((203, 156, 276, 173), 'SCHOOL')],
    'shop-right': [((70, 106, 410, 140), 'GROCERY')],
}


# Зимой у некоторых вывесок край закрыт снегом — надпись ставим правее
WINTER: dict[str, list[tuple[tuple[int, int, int, int], str]]] = {
    'kiosk-rival': [((46, 41, 184, 58), 'RUSH BREW')],
}


def two_colors(px: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Табличка (больше пикселей) и буквы: k-means на 2 кластера"""
    data = px.reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, lab, cen = cv2.kmeans(data, 2, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    lab = lab.reshape(px.shape[:2])
    plate = 0 if (lab == 0).sum() >= (lab == 1).sum() else 1
    return cen[plate], cen[1 - plate], lab != plate


def fit_font(text: str, cap: float, max_w: float) -> ImageFont.FreeTypeFont:
    size = 4.0
    while True:
        f = ImageFont.truetype(FONT, int(size * 4))
        b = f.getbbox('H')
        if (b[3] - b[1]) / 4 >= cap:
            break
        size += 0.25
    while size > 4:
        f = ImageFont.truetype(FONT, int(size * 4))
        b = f.getbbox(text)
        if (b[2] - b[0]) / 4 <= max_w:
            return f
        size -= 0.25
    return ImageFont.truetype(FONT, int(size * 4))


def relabel(img: Image.Image, rect: tuple[int, int, int, int], text: str, dy: int = 0) -> Image.Image:
    x0, y0, x1, y1 = rect
    y0 += dy
    y1 += dy
    rgba = np.asarray(img.convert('RGBA')).copy()
    rgb = np.ascontiguousarray(rgba[..., :3])
    box = rgb[y0:y1, x0:x1].astype(np.float32)
    plate, ink, is_ink = two_colors(box)
    # Доля «буквы» у каждого пикселя: проекция на отрезок табличка → буква (сглаженные края тоже стираем)
    d = ink - plate
    t = ((box - plate) @ d) / max(float(d @ d), 1.0)
    # Стираем и буквы, и их тень: всё, что заметно отличается от таблички
    far = np.linalg.norm(box - plate, axis=2) > 0.22 * np.sqrt(float(d @ d))
    mask = ((t > 0.18) | far).astype(np.uint8)
    ys, xs = np.where(is_ink & (t > 0.5))
    if len(ys):  # только вокруг самой надписи — края таблички не трогаем
        keep = np.zeros_like(mask)
        keep[max(0, ys.min() - 3):ys.max() + 4, max(0, xs.min() - 3):xs.max() + 4] = 1
        mask &= keep
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
    strong = box[t > 0.8]
    if len(strong) > 8:
        ink = np.median(strong, axis=0)
    ys, xs = np.where(is_ink & (t > 0.5))
    cy = (ys.min() + ys.max()) / 2 if len(ys) else (y1 - y0) / 2
    cx = (xs.min() + xs.max()) / 2 if len(xs) else (x1 - x0) / 2
    cap = (ys.max() - ys.min() + 1) if len(ys) else (y1 - y0) * 0.6
    full = np.zeros(rgb.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = mask * 255
    clean = cv2.inpaint(rgb, full, 3, cv2.INPAINT_TELEA)
    out = rgba.copy()
    out[..., :3] = clean
    # Новая надпись: рисуем в 4×, сжимаем — мягкий край как у нарисованных букв
    W, H = x1 - x0, y1 - y0
    font = fit_font(text, cap * 0.92, W * 0.94)
    big = Image.new('L', (W * 4, H * 4), 0)
    dr = ImageDraw.Draw(big)
    bb = dr.textbbox((0, 0), text, font=font)
    hb = font.getbbox('H')
    tw = bb[2] - bb[0]
    tx = min(max(cx * 4 - tw / 2, 0), W * 4 - tw) - bb[0]  # по центру прежней надписи, но в рамке
    ty = cy * 4 - (hb[3] - hb[1]) / 2 - hb[1]
    dr.text((tx, ty), text, font=font, fill=255)
    a = np.asarray(big.resize((W, H), Image.LANCZOS)).astype(np.float32)[..., None] / 255
    region = out[y0:y1, x0:x1, :3].astype(np.float32)
    out[y0:y1, x0:x1, :3] = np.clip(region * (1 - a) + ink * a, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def english(name: str, img: Image.Image, dy: int = 0, winter: bool = False) -> Image.Image:
    key = name.removeprefix('building-')
    for rect, text in (WINTER.get(key) if winter and key in WINTER else SIGNS.get(key, [])):
        img = relabel(img, rect, text, dy)
    return img


def frames_of(ts_file: Path, const: str) -> dict[str, list[int]]:
    src = ts_file.read_text()
    body = src[src.index(const):]
    return {m[0]: [int(v) for v in m[1:]] for m in re.findall(r"'([\w-]+)': \[(\d+), (\d+), (\d+), (\d+)\]", body)}


def save(items, name: str, check: dict) -> None:
    sys.path.insert(0, str(ROOT / 'scripts'))
    from pack_v2 import pack
    png = ART / f'{name}.png'
    frames = pack(items, png)
    for k, v in frames.items():
        assert list(v) == check[k], f'{name}: кадр {k} {v} ≠ {check[k]}'
    im = Image.open(png)
    im.save(ART / f'{name}.webp', 'WEBP', quality=88, alpha_quality=100, method=6)
    png.unlink()
    print(name, im.size, len(items))


def main() -> None:
    sys.path.insert(0, str(ROOT / 'scripts'))
    from pack_v2 import even
    import pack_winter

    only = sys.argv[1:]
    summer = []
    for f in sorted(SRC.glob('building-*.png')):
        img = Image.open(f).convert('RGBA')
        summer.append((f.stem, even(english(f.stem, img))))
    if only:  # предпросмотр: только PNG нужных зданий
        out = ROOT / 'art-src' / 'v2' / 'buildings-en-preview'
        out.mkdir(exist_ok=True)
        for n, im in summer:
            if n.removeprefix('building-') in only:
                im.save(out / f'{n}.png')
        return
    save(summer, 'buildings-en', frames_of(ROOT / 'src/game/atlasFrames.ts', 'BUILDING_FRAMES'))

    winter = []
    for f in sorted(pack_winter.BUILDINGS.glob('building-*.png')):
        w = pack_winter.snow_cut(f.stem)
        h = Image.open(SRC / f'{f.stem}.png').height
        winter.append((f.stem, even(english(f.stem, w, w.height - h, winter=True))))
    save(winter, 'buildings-winter-en', frames_of(ROOT / 'src/game/atlasWinterFrames.ts', 'BUILDING_WINTER_FRAMES'))


if __name__ == '__main__':
    main()
