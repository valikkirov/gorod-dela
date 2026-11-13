"""Отделка зала бистро: стены и пол каждого стиля — слои размером с комнату, их можно сочетать как угодно.
Слой — то, чем картинка стиля (art-src/v2/bistro/style/<стиль>.png, правка пустого зала) отличается от пустого
зала: всё, что выше линии пола, — стены, ниже — пол. Раздача, касса, окно и лампы одинаковые и в слой не попадают.

Запуск из корня репозитория:  python3 scripts/pack_bistro_style.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from cut_bistro import CROP, ROOM_W, ROOM_H, SRC, OUT, rgb, blur

# Пол на исходнике 1200×896: от плинтуса задней стены до передней кромки
FLOOR = [(213, 446), (980, 446), (1148, 662), (1052, 742), (148, 742), (48, 662)]


def main() -> None:
    empty = rgb('empty')
    floor = Image.new('L', (1200, 896), 0)
    ImageDraw.Draw(floor).polygon(FLOOR, fill=255)
    floor = np.asarray(floor) > 0
    for f in sorted((SRC / 'style').glob('*.png')):
        pic = np.asarray(Image.open(f).convert('RGB').resize((1200, 896))).astype(np.float32)
        diff = np.abs(blur(pic) - blur(empty)).sum(2)
        changed = nd.binary_fill_holes(nd.binary_closing(diff > 40, iterations=4))
        changed = nd.binary_opening(changed, iterations=2)
        soft = nd.gaussian_filter(changed.astype(np.float32), 1.0)
        for part, zone in (('walls', ~floor), ('floor', floor)):
            a = soft * nd.gaussian_filter(zone.astype(np.float32), 0.8)
            rgba = np.dstack([pic, a * 255]).clip(0, 255).astype(np.uint8)
            im = Image.fromarray(rgba).crop(CROP).resize((ROOM_W, ROOM_H), Image.LANCZOS)
            im.save(OUT / f'{part}-{f.stem}.webp', quality=90, alpha_quality=90)
            print(part, f.stem)


if __name__ == '__main__':
    main()
