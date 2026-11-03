"""Деловой квартал (ноябрь 2026): здания из Magnific → исходники art-src/v2/buildings и art-src/v2/lights.

Исходники — art-src/v2/delovoy/raw/<имя>.png: одно здание на белом фоне (GPT 2 с образцом
«style-buildings-v2», рецепт «Графики 2.0»). Здание замкнуто контуром, поэтому фон снимается здесь:
всё белое снаружи контура — прозрачное. Свет в окнах берётся с дневной картинки: тёплые яркие пиксели
окон плюс мягкое свечение (как у офисов Кленовой).

После этого скрипта — python3 scripts/pack_v2.py. Запуск из корня: python3 scripts/pack_delovoy.py
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'art-src' / 'v2' / 'delovoy' / 'raw'
BUILD = ROOT / 'art-src' / 'v2' / 'buildings'
LIGHTS = ROOT / 'art-src' / 'v2' / 'lights'

# Файл → кадр и ширина в пикселях исходника (2× мира): все здания по ширине своего места
SPRITES = {
    'bc-alfa': ('building-dl-alfa', 480),
    'bistro': ('building-bistro-open', 480),
    'bistro-rent': ('building-bistro-rent', 480),
    'cowork': ('building-dl-cowork', 480),
    'bc-meridian': ('building-dl-meridian', 480),
    'bc-tower': ('building-dl-tower', 480),
    'shop': ('building-dl-shop', 480),
    'apart-1': ('building-dl-apart-1', 480),
    'bc-east': ('building-dl-east', 480),
    'bc-bank': ('building-dl-bank', 480),
    'institute': ('building-dl-institute', 480),
    'gym': ('building-dl-gym', 480),
    'apart-2': ('building-dl-apart-2', 480),
    'bc-glass': ('building-dl-glass', 480),
}


# Не выше, чем позволяет место (в мире): иначе крыша залезет на соседа или на улицу
MAX_H = {'building-dl-cowork': 182, 'building-dl-apart-1': 190, 'building-dl-apart-2': 180}


def cut(im: Image.Image) -> Image.Image:
    """Самое большое пятно не-белого с залитыми дырами — здание; остальное прозрачное"""
    a = np.asarray(im.convert('RGB')).astype(int)
    fg = nd.binary_closing(a.min(2) < 240, iterations=3)
    lab, _ = nd.label(fg)
    sizes = nd.sum(fg, lab, range(1, lab.max() + 1))
    m = nd.binary_fill_holes(lab == (int(np.argmax(sizes)) + 1))
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    alpha = nd.gaussian_filter(m.astype(float), 0.6)[y0:y1, x0:x1]
    rgba = np.dstack([a[y0:y1, x0:x1].astype(np.uint8), (alpha * 255).clip(0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def lights(img: Image.Image) -> Image.Image:
    """Слой света: тёплые яркие окна с дневной картинки и мягкое свечение вокруг них"""
    a = np.asarray(img).astype(float)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    # Тёплый свет в окнах насыщеннее бежевых стен: отделяем по насыщенности
    sat = (np.maximum(r, np.maximum(g, b)) - np.minimum(r, np.minimum(g, b))) / np.maximum(r, 1)
    warm = (r > 185) & (g > 140) & (r - b > 85) & (sat > 0.48) & (al > 200)
    # Крыша не светится: верхняя четверть картинки — крыша и карниз
    warm[: int(a.shape[0] * 0.22)] = False
    warm = nd.binary_opening(warm, iterations=1)
    warm = nd.binary_closing(warm, iterations=2)
    core = nd.gaussian_filter(warm.astype(float), 0.8)
    glow = nd.gaussian_filter(warm.astype(float), 6) * 0.55
    alpha = np.clip(core * 0.95 + glow, 0, 1)
    col = np.where(warm[..., None], np.clip(a[..., :3] * 1.12 + 12, 0, 255), np.array([255, 214, 140]))
    out = np.dstack([col, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def main() -> None:
    for src, (frame, width) in SPRITES.items():
        f = RAW / f'{src}.png'
        if not f.exists():
            print('нет', f.name)
            continue
        b = cut(Image.open(f))
        h = round(b.height * width / b.width)
        cap = MAX_H.get(frame, 10_000) * 2
        if h > cap:
            width, h = round(width * cap / h), cap
        b = b.resize((width, h), Image.LANCZOS)
        b.save(BUILD / f'{frame}.png')
        lights(b).save(LIGHTS / f'{frame}-lights.png')
        print(frame, b.size)


if __name__ == '__main__':
    main()
