"""Границы района (ноябрь 2026): листы Magnific → исходники art-src/v2/props и art-src/v2/textures.

Исходники — art-src/v2/borders/raw/*.png (GPT 2, белый фон, тот же рецепт «Графики 2.0»):
- rail-v2.png  — насыпь с двумя путями сверху вниз → бесшовная текстура tex-rail (200 мира в ширину)
- river.png    — набережная и река слева направо   → бесшовная текстура tex-river (260 мира в высоту)
- bridge.png   — путепровод: настил с перилами и фасад с аркой → prop-rail-bridge, prop-rail-deck
- train.png    — электричка сверху: головной и прицепной вагоны → prop-train-head, prop-train-car
- trees-*.png  — деревья леса по три на лист, фон снят в Magnific → prop-forest-1…8, prop-forest-bush
- park.png     — пруд, ограда по горизонтали и по вертикали → prop-pond, prop-fence-h, prop-fence-v
- freight.png  — товарный поезд: тепловоз, цистерна, крытый вагон → prop-freight-loco, -tank, -box
- boats.png    — речной трамвайчик и катер носом вправо → prop-boat-tram, prop-boat-motor
- clouds.png   — облака «тумана войны» вокруг района → бесшовная tex-clouds.jpg
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


def alpha_objects(im: Image.Image, min_area: int = 4000):
    """Предметы на прозрачном фоне (после снятия фона): связные пятна непрозрачного"""
    a = np.asarray(im.convert('RGBA'))
    fg = nd.binary_closing(a[..., 3] > 24, iterations=2)
    lab, _ = nd.label(fg)
    out = []
    for i, sl in enumerate(nd.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < min_area:
            continue
        crop = a[sl].copy()
        crop[..., 3] = np.where(lab[sl] == i, crop[..., 3], 0)
        out.append((Image.fromarray(crop, 'RGBA'), (sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)))
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

    # Пролёт моста — из той же насыпи: середина с путями (пути совпадают до пикселя, поезд не съезжает),
    # по краям бетонные бортики с перилами. Бесшовный сверху вниз, как насыпь
    rail_tex = np.asarray(Image.open(TEX / 'tex-rail.png').convert('RGB')).astype(float)
    mid = rail_tex[:, 134:266]
    h = mid.shape[0]
    side = 30
    rng = np.random.default_rng(7)
    def band(flip: bool) -> np.ndarray:
        b = np.zeros((h, side, 3))
        b[:] = (178, 172, 162)
        b += rng.normal(0, 4, (h, side, 1))
        b[:, :3] = (74, 52, 38)          # внешний контур — тёмно-коричневый, как у всей графики
        b[:, 3:6] = (150, 144, 134)      # скос бортика
        b[:, 9:12] = (84, 88, 94)        # поручень
        b[:, side - 4:] = (120, 114, 104)  # тень бортика на балласт
        for y in range(0, h, 48):        # стойки перил
            b[y:y + 7, 7:14] = (64, 68, 74)
        return b[:, ::-1] if flip else b
    deck = np.concatenate([band(False), mid, band(True)], axis=1)
    Image.fromarray(deck.clip(0, 255).astype(np.uint8)).save(TEX / 'tex-bridge.png')

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
        width_to(img, 30).save(PROPS / f'{name}.png')

    # Лес: деревья сгенерированы по три на лист, фон снят в Magnific (без белой каймы между ветками)
    trees = []
    for f in ['trees-spruce.png', 'trees-pine.png', 'trees-round.png']:
        trees += [o[0] for o in sorted(alpha_objects(Image.open(RAW / f)), key=lambda o: o[1][0])]
    heights = [130, 145, 115, 125, 95, 100, 108, 102, 40]
    names = [f'prop-forest-{i}' for i in range(1, 9)] + ['prop-forest-bush']
    for img, h, name in zip(trees, heights, names):
        height_to(img, h).save(PROPS / f'{name}.png')

    # Сквер: пруд, ограда по горизонтали и по вертикали
    park = by_rows(objects(Image.open(RAW / 'park.png'), 800), 1)
    pond, fence_h, fence_v = [o[0] for o in park]
    width_to(pond, 190).save(PROPS / 'prop-pond.png')
    width_to(fence_h, 80).save(PROPS / 'prop-fence-h.png')
    height_to(fence_v, 80).save(PROPS / 'prop-fence-v.png')
    # Товарный поезд
    freight = by_rows(objects(Image.open(RAW / 'freight.png')), 1)
    for name, (img, _) in zip(['prop-freight-loco', 'prop-freight-tank', 'prop-freight-box'], freight):
        width_to(img, 30).save(PROPS / f'{name}.png')
    # Река: трамвайчик сверху, катер снизу
    tram_boat, motor = [o[0] for o in by_rows(objects(Image.open(RAW / 'boats.png')), 2)]
    width_to(tram_boat, 190).save(PROPS / 'prop-boat-tram.png')
    width_to(motor, 74).save(PROPS / 'prop-boat-motor.png')
    # Лесная подстилка: бесшовная во все стороны и в тени
    floor = Image.open(RAW / 'forest-floor.png').convert('RGB').resize((720, 720), Image.LANCZOS)
    f = seamless(seamless(np.asarray(floor), 0, 80), 1, 80).astype(float) * 0.72
    Image.fromarray(f.clip(0, 255).astype(np.uint8)).save(TEX / 'tex-forest.png')
    # Облака тумана: бесшовные во все стороны, JPEG (маску края считает код в fog.ts)
    clouds = np.asarray(Image.open(RAW / 'clouds.png').convert('RGB'))
    clouds = seamless(seamless(clouds, 0, 120), 1, 120)
    Image.fromarray(clouds).resize((768, 768), Image.LANCZOS).save(ART / 'tex-clouds.jpg', quality=82, optimize=True)
    print('ok', len(cars), len(trees), len(park), len(freight))


if __name__ == '__main__':
    main()
