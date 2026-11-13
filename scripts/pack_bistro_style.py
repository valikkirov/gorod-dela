"""Отделка зала бистро: стены и пол каждого стиля — слои размером с комнату, их можно сочетать как угодно.
Картинка стиля (art-src/v2/bistro/style/<стиль>.png) — правка пустого зала: те же раздача, касса, окно и лампы
на тех же местах. Слой стен — вся комната стиля, слой пола — многоугольник пола (у края — по разнице с пустым залом).

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
    # Комната — всё, что не белый фон вокруг: стены-слой покрывает её целиком (раздача, окно, лампы
    # на картинке стиля те же, что в пустом зале, — так на стене не остаётся непокрытых пятен)
    white = (empty.min(2) > 235)
    lab, _ = nd.label(white)
    outside = np.isin(lab, np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    outside &= white
    room = nd.binary_erosion(~outside, iterations=1)
    for f in sorted((SRC / 'style').glob('*.png')):
        pic = np.asarray(Image.open(f).convert('RGB').resize((1200, 896))).astype(np.float32)
        diff = np.abs(blur(pic) - blur(empty)).sum(2)
        changed = nd.binary_opening(nd.binary_closing(diff > 30, iterations=3), iterations=1)
        # Пол: весь многоугольник пола, а у края — по тому, где картинка стиля правда другая
        core = nd.binary_erosion(floor, iterations=6)
        edge = changed & nd.binary_dilation(floor, iterations=12) & room
        fl = nd.binary_fill_holes(core | (edge & ~nd.binary_erosion(floor, iterations=40)))
        for part, zone in (('walls', room), ('floor', fl)):
            a = nd.gaussian_filter(zone.astype(np.float32), 0.8) * room
            rgba = np.dstack([pic, a * 255]).clip(0, 255).astype(np.uint8)
            im = Image.fromarray(rgba).crop(CROP).resize((ROOM_W, ROOM_H), Image.LANCZOS)
            im.save(OUT / f'{part}-{f.stem}.webp', quality=90, alpha_quality=90)
            print(part, f.stem)


if __name__ == '__main__':
    main()
