"""Границы района (ноябрь 2026): листы Magnific → исходники art-src/v2/props и art-src/v2/textures.

Исходники — art-src/v2/borders/raw/*.png (GPT 2, белый фон, тот же рецепт «Графики 2.0»):
- rail-v2.png  — насыпь с двумя путями сверху вниз → бесшовная текстура tex-rail (200 мира в ширину)
- river.png    — набережная и река слева направо   → бесшовная текстура tex-river (260 мира в высоту)
- bridge.png   — путепровод: настил с перилами и фасад с аркой → prop-rail-bridge, prop-rail-deck
- train.png    — электричка сверху: головной и прицепной вагоны → prop-train-head, prop-train-car
- forest.png   — восемь деревьев леса в два ряда → prop-forest-1…8
- park.png     — пруд, ограда по горизонтали и по вертикали → prop-pond, prop-fence-h, prop-fence-v
- freight.png  — товарный поезд: тепловоз, цистерна, крытый вагон → prop-freight-loco, -tank, -box
- boats.png    — речной трамвайчик и катер носом вправо → prop-boat-tram, prop-boat-motor
- city.png     — соседний квартал в масштабе района → бесшовная tex-haze (за насыпями, дымку рисует код)
- forest-floor.png — лесная подстилка → бесшовная tex-forest (затемнена: под деревьями тень)

После этого скрипта — python3 scripts/pack_v2.py (он собирает атласы и atlasFrames.ts).
Запуск из корня: python3 scripts/pack_borders.py
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'art-src' / 'v2' / 'borders' / 'raw'
PROPS = ROOT / 'art-src' / 'v2' / 'props'
TEX = ROOT / 'art-src' / 'v2' / 'textures'
ART = ROOT / 'src' / 'game' / 'art'
S = 2  # исходники в 2× мира


def objects(im: Image.Image, min_area: int = 4000) -> list[tuple[Image.Image, tuple[int, int, int, int]]]:
    """Предметы на белом фоне: связные пятна не-белого; белое внутри контура остаётся предметом"""
    a = np.asarray(im.convert('RGB')).astype(int)
    fg = a.min(2) < 238
    fg = nd.binary_closing(fg, iterations=3)
    lab, n = nd.label(fg)
    out = []
    for i, sl in enumerate(nd.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        if m.sum() < min_area:
            continue
        m = nd.binary_fill_holes(m)
        alpha = nd.gaussian_filter(m.astype(float), 0.7)
        rgba = np.dstack([a[sl].astype(np.uint8), (alpha * 255).clip(0, 255).astype(np.uint8)])
        out.append((Image.fromarray(rgba, 'RGBA'), (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)))
    return out


def by_rows(objs, rows: int):
    """Сортировка: сверху вниз по рядам, в ряду — слева направо"""
    objs = sorted(objs, key=lambda o: o[1][1])
    if rows == 1:
        return sorted(objs, key=lambda o: o[1][0])
    ys = np.array([(o[1][1] + o[1][3]) / 2 for o in objs])
    cut = np.sort(ys)
    gaps = np.diff(cut)
    edges = np.sort(np.argsort(gaps)[-(rows - 1):])
    bounds = [cut[e] for e in edges]
    res = []
    for r in range(rows):
        lo = -1e9 if r == 0 else bounds[r - 1]
        hi = 1e9 if r == rows - 1 else bounds[r]
        res += sorted([o for o, y in zip(objs, ys) if lo < y <= hi], key=lambda o: o[1][0])
    return res


def height_to(img: Image.Image, world_h: float) -> Image.Image:
    h = round(world_h * S)
    return img.resize((max(2, round(img.width * h / img.height)), h), Image.LANCZOS)


def width_to(img: Image.Image, world_w: float) -> Image.Image:
    w = round(world_w * S)
    return img.resize((w, max(2, round(img.height * w / img.width))), Image.LANCZOS)


def seamless(a: np.ndarray, axis: int, band: int) -> np.ndarray:
    """Бесшовность по оси: последние band строк (столбцов) плавно переходят в первые, хвост отрезается"""
    a = a.astype(float)
    n = a.shape[axis]
    head = np.take(a, range(band), axis=axis)
    tail = np.take(a, range(n - band, n), axis=axis)
    t = np.linspace(0, 1, band)
    t = t.reshape((-1, 1, 1) if axis == 0 else (1, -1, 1))
    blended = tail * (1 - t) + head * t
    body = np.take(a, range(band, n - band), axis=axis)
    return np.concatenate([body, blended], axis=axis).clip(0, 255).astype(np.uint8)


def main() -> None:
    # Насыпь: 200 мира в ширину, повтор сверху вниз
    rail = width_to(Image.open(RAW / 'rail-v2.png').convert('RGB'), 200)
    Image.fromarray(seamless(np.asarray(rail), 0, 60)).save(TEX / 'tex-rail.png')
    # Набережная с рекой: 260 мира в высоту, повтор слева направо
    river = height_to(Image.open(RAW / 'river.png').convert('RGB'), 260)
    Image.fromarray(seamless(np.asarray(river), 1, 80)).save(TEX / 'tex-river.png')

    # Путепровод: целиком (через реку) и только настил с перилами (над улицей)
    (bridge, _), = objects(Image.open(RAW / 'bridge.png'))
    bridge = width_to(bridge, 104)
    bridge.save(PROPS / 'prop-rail-bridge.png')
    a = np.asarray(bridge)
    # Фасад — нижняя часть, где непрозрачный ряд шире настила: режем по верхнему краю фасада
    face_top = int(a.shape[0] * 0.68)
    Image.fromarray(a[:face_top]).save(PROPS / 'prop-rail-deck.png')

    # Электричка: головной и прицепной вагоны
    cars = by_rows(objects(Image.open(RAW / 'train.png')), 1)
    for name, (img, _) in zip(['prop-train-head', 'prop-train-car'], cars):
        width_to(img, 40).save(PROPS / f'{name}.png')

    # Лес: два ряда по 3 и 5 деревьев
    trees = by_rows(objects(Image.open(RAW / 'forest.png')), 2)
    # Ели (верхний ряд) выше, ниже — сосны, лиственные и берёзка; круглое дерево улицы — 100
    for i, ((img, _), h) in enumerate(zip(trees, [130, 115, 100, 115, 105, 100, 95, 95]), 1):
        height_to(img, h).save(PROPS / f'prop-forest-{i}.png')

    # Сквер: пруд, ограда по горизонтали и по вертикали
    park = by_rows(objects(Image.open(RAW / 'park.png'), 800), 1)
    pond, fence_h, fence_v = [o[0] for o in park]
    width_to(pond, 190).save(PROPS / 'prop-pond.png')
    width_to(fence_h, 80).save(PROPS / 'prop-fence-h.png')
    height_to(fence_v, 80).save(PROPS / 'prop-fence-v.png')
    # Товарный поезд
    freight = by_rows(objects(Image.open(RAW / 'freight.png')), 1)
    for name, (img, _) in zip(['prop-freight-loco', 'prop-freight-tank', 'prop-freight-box'], freight):
        width_to(img, 40).save(PROPS / f'{name}.png')
    # Река: трамвайчик сверху, катер снизу
    tram_boat, motor = [o[0] for o in by_rows(objects(Image.open(RAW / 'boats.png')), 2)]
    width_to(tram_boat, 190).save(PROPS / 'prop-boat-tram.png')
    width_to(motor, 74).save(PROPS / 'prop-boat-motor.png')
    # Соседние кварталы: тот же масштаб, что у домов района (чуть мельче — дальше), повтор сверху вниз.
    # Дымку поверх рисует код: чем дальше от насыпи, тем бледнее
    city = width_to(Image.open(RAW / 'city.png').convert('RGB'), 640)
    # Большая и без прозрачности — в игру идёт JPEG (PNG весил бы ~4 МБ), кадр задан в atlas.ts
    Image.fromarray(seamless(np.asarray(city), 0, 90)).save(ART / 'tex-haze.jpg', quality=84, optimize=True)
    # Лесная подстилка: бесшовная во все стороны и в тени
    floor = Image.open(RAW / 'forest-floor.png').convert('RGB').resize((720, 720), Image.LANCZOS)
    f = seamless(seamless(np.asarray(floor), 0, 80), 1, 80).astype(float) * 0.72
    Image.fromarray(f.clip(0, 255).astype(np.uint8)).save(TEX / 'tex-forest.png')
    print('ok', len(cars), len(trees), len(park), len(freight))


if __name__ == '__main__':
    main()
