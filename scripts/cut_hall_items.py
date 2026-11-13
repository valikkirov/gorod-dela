"""Фирменные вещи стилей и новогодний декор зала: каждая — разница между «пустая комната + вещь» и пустой комнатой.

Запуск из корня репозитория:  python3 scripts/cut_hall_items.py

Исходники — art-src/v2/hall3/items/<id>.png: точные правки пустой комнаты (empty-clean.png) в Magnific,
Ideogram 4.5 «добавь только одну вещь». Вещь ложится ровно туда, где её нарисовала модель.
Непрозрачность — по силе отличия: сама вещь плотная, свечение вокруг неё (неон, лампы) — полупрозрачное,
поэтому ложится и на кирпич, и на белую стену.

Вещи на стене над диваном и светильники нарисованы в обставленном зале (furnished.png), см. FURNISHED и TOUCH.
Светильники висят вместо штатных ламп: их прячут заплатки стены без ламп (art-src/v2/hall3/nolamp/<отделка>.png).

Выход: src/game/art/hall3/item-<id>.webp, nolamp-<отделка>.webp и src/game/hallItems.ts (рамка каждой вещи в пикселях комнаты).
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cut_hall import load, room, blur  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'hall3' / 'items'
OUT = ROOT / 'src' / 'game' / 'art' / 'hall3'
TS = ROOT / 'src' / 'game' / 'hallItems.ts'


# Вещи на стене над диваном (место «акцент»): нарисованы в обставленном зале (furnished.png — та же комната
# с мебелью «Премиум» без картины и часов), чтобы встали в свободное место и не залезали на шкаф и доску
FURNISHED = {'mirror', 'neon', 'samovar', 'rack'}
# Светильники (место «штрих»): висят вместо двух штатных ламп на тех же шнурах. Штатные лампы прячет заплатка
# стены без ламп (nolamp-*.webp) — своя для каждой отделки стен
TOUCH = {'paperlamp', 'pendants', 'chandelier'}
# Где вещам «акцента» можно быть: стена над диваном (в пикселях 1024×768)
FEATURE_BOX = (236, 96, 420, 300)
WALLS = ['default', 'loft', 'scandi', 'classic', 'home']


def diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.abs(blur(a) - blur(b)).sum(2)


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB').resize((1024, 768))).astype(np.int32)


def save(img: np.ndarray, a: np.ndarray, name: str, box) -> tuple[int, int, int, int]:
    bx, by = box[0], box[1]
    a[:by] = 0
    ys, xs = np.nonzero(a > 0.02)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    out = np.dstack([img.astype(np.uint8), (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
    Image.fromarray(out).save(OUT / f'{name}.webp', quality=92)
    return (int(x0 - bx), int(y0 - by), int(x1 - x0), int(y1 - y0))


# Вещи на стене, у которых разница с залом захватывает кусок стены (тень полки, светлый фон):
# альфа — из Magnific «удалить фон» по кадру исходника. Кадр: прямоугольник в пикселях 1024×768,
# увеличенный в 3 раза; маска лежит в items/matte/<id>.png
MATTE_DIR = SRC / 'matte'
MATTE_BOX = {
    'rack': (238, 147, 403, 299),
    'samovar': (274, 108, 404, 257),
    'mirror': (267, 118, 402, 286),
}


def matte_alpha(name: str, shape) -> np.ndarray | None:
    f = MATTE_DIR / f'{name}.png'
    if name not in MATTE_BOX or not f.exists():
        return None
    x0, y0, x1, y1 = MATTE_BOX[name]
    m = Image.open(f).convert('RGBA').resize((x1 - x0, y1 - y0), Image.LANCZOS)
    a = np.zeros(shape, np.float32)
    a[y0:y1, x0:x1] = np.asarray(m)[..., 3] / 255.0
    return a


def lamps(clean: np.ndarray, nolamp: np.ndarray) -> np.ndarray:
    """Где штатные лампы со шнурами: разница пустой комнаты и той же комнаты без ламп"""
    m = diff(clean, nolamp) > 30
    m = nd.binary_opening(m, iterations=1)
    m[300:] = False
    return nd.binary_dilation(m, iterations=3)


def patches(box) -> None:
    """Заплатки стены без штатных ламп: слой размером с комнату для каждой отделки"""
    bx, by, bx1, by1 = box
    for w in WALLS:
        orig = load('empty-clean') if w == 'default' else rgb(SRC.parent / 'style' / f'walls-{w}.png')
        free = rgb(SRC.parent / 'nolamp' / f'{w}.png')
        m = lamps(orig, free)
        a = nd.gaussian_filter(m.astype(float), 1.0).clip(0, 1)
        out = np.dstack([free.astype(np.uint8), (a * 255).astype(np.uint8)])[by:by1, bx:bx1]
        Image.fromarray(out).save(OUT / f'nolamp-{w}.webp', quality=92)


def main() -> None:
    _, box = room(load('empty'))
    bx, by = box[0], box[1]
    clean = load('empty-clean')
    furnished = load('furnished')
    free = rgb(SRC.parent / 'nolamp' / 'default.png')
    old = lamps(clean, free)
    patches(box)
    frames = {}
    for f in sorted(SRC.glob('*.png')):
        img = rgb(f)
        if f.stem in TOUCH:
            # Новая лампа (отличие от зала) и шнур на месте старой (всё, что не голая стена)
            new = diff(img, furnished) > 45
            new = nd.binary_opening(new, iterations=1)
            new[320:] = False
            # Только у штатных ламп: остальное модель могла чуть перерисовать
            new &= nd.binary_dilation(old, iterations=40)
            # Там, где был старый плафон, модель нарисовала голую стену — её не берём: только то, что не стена
            bare = diff(img, free)
            new &= bare > 60
            # Шнур — тёмная тонкая линия на месте старого
            lum = img.mean(2)
            keep = new | (old & (bare > 40) & (lum < 110))
            keep = nd.binary_fill_holes(nd.binary_closing(keep, iterations=2))
            # У правой лампы — полочка со шкафа и листья цветка. Лампы одинаковые: правая — это левая,
            # сдвинутая на расстояние между штатными лампами; берём только то, что ложится на её контур
            ol, on = nd.label(old)
            if on >= 2:
                cs = sorted(nd.center_of_mass(old, ol, range(1, on + 1)), key=lambda c: c[1])
                dy, dx = round(cs[-1][0] - cs[0][0]), round(cs[-1][1] - cs[0][1])
                mid = round((cs[0][1] + cs[-1][1]) / 2)
                left = keep.copy()
                left[:, mid:] = False
                shifted = np.roll(np.roll(left, dy, axis=0), dx, axis=1)
                # Правая — копия левой целиком: со шнуром до потолка и без чужих кусков
                moved = np.roll(np.roll(img, dy, axis=0), dx, axis=1)
                img = np.where(shifted[..., None], moved, img)
                keep = left | shifted
            # Отдельные крошки рядом с лампой (край шкафа, блик) — прочь: остаются лампа со шнуром
            lab, n = nd.label(nd.binary_dilation(keep, iterations=2))
            if n > 1:
                sizes = nd.sum(keep, lab, range(1, n + 1))
                keep &= np.isin(lab, np.nonzero(sizes >= sizes.max() * 0.15)[0] + 1)
            a = np.maximum(keep.astype(float) * 1.0, nd.gaussian_filter(keep.astype(float), 0.8))
            # Без ореола: он вырезан с обычной стены и на кирпиче или обоях лёг бы бежевым пятном
            frames[f.stem] = save(img, a, f'item-{f.stem}', box)
            # Для списка — одна лампа (левая), а не две через всю стену
            if on >= 2:
                one = a.copy()
                one[:, mid:] = 0
                save(img, one, f'thumb-{f.stem}', box)
            print(f.stem, frames[f.stem])
            continue
        base = furnished if f.stem in FURNISHED else clean
        d = diff(img, base)
        # Бледная середина неоновой трубки почти цвета стены — порог ниже
        core = d > (22 if f.stem == 'neon' else 45)
        if f.stem in FURNISHED:
            x0, y0, x1, y1 = FEATURE_BOX
            clip = np.zeros_like(core)
            clip[y0:y1, x0:x1] = True
            core &= clip
            # Штатная лампа рядом нарисована заново поверх вещи — она уже есть в комнате
            # (кроме неона: его буква «к» заходит в рамку лампы, а саму лампу модель не трогала)
            if f.stem != 'neon':
                core &= ~old
        core = nd.binary_opening(core, iterations=1)
        lab, n = nd.label(core)
        if not n:
            print('пусто:', f.stem)
            continue
        sizes = nd.sum(core, lab, range(1, n + 1))
        keep = np.isin(lab, np.nonzero(sizes >= max(150, sizes.max() * 0.08))[0] + 1)
        keep = nd.binary_fill_holes(nd.binary_closing(keep, iterations=3))
        if f.stem == 'neon':
            # Только сами трубки: светлая середина и рыжий кант; розоватое свечение стены между буквами — нет
            tube = ((img[..., 1] > 210) & (img.mean(2) > 195)) | (img[..., 2] < 75)
            keep &= tube
            keep = nd.binary_closing(keep, iterations=1)
            lab, n = nd.label(keep)
            sizes = nd.sum(keep, lab, range(1, n + 1))
            keep = np.isin(lab, np.nonzero(sizes >= 20)[0] + 1)
        # Ореол: слабое отличие рядом с вещью — свечение и тень, полупрозрачно
        near = nd.binary_dilation(keep, iterations=14)
        if f.stem in FURNISHED:
            near &= ~old
            # Ореол — только у неона (это его свечение); у остальных он лёг бы пятном обычной стены на другую отделку
            if f.stem != 'neon':
                near &= False
        a = np.where(keep, 1.0, np.clip((d - 12) / 60, 0, 0.85) * near)
        a = np.maximum(a, nd.gaussian_filter(keep.astype(float), 0.8) * keep.max())
        cut = matte_alpha(f.stem, keep.shape)
        if cut is not None:
            # Чистая вырезка, но только рядом с самой вещью и без штатной лампы (она уже есть в комнате)
            # Полка с посудой висит за штатной лампой: лампу берём вместе с полкой (та же, что в комнате),
            # иначе на месте лампы в полке дыра
            behind = f.stem == 'rack'
            cut *= nd.binary_dilation(keep | (old if behind else False), iterations=6)
            if not behind:
                cut[old] = 0
            lab_c, n_c = nd.label(cut > 0.3)
            if n_c > 1:
                sizes = nd.sum(cut > 0.3, lab_c, range(1, n_c + 1))
                cut *= nd.binary_dilation(np.isin(lab_c, np.nonzero(sizes >= sizes.max() * 0.1)[0] + 1), iterations=2)
            a = cut
            if behind:
                # В списке полка без штатной лампы
                bare_cut = a.copy()
                bare_cut[old] = 0
                save(img, bare_cut, f'thumb-{f.stem}', box)
        if f.stem == 'neon':
            # Свечение неона — ровный тёплый ореол вокруг трубок, а не пиксели обычной стены:
            # иначе на кирпиче и обоях у буквы «к» видно светлое пятно от соседней лампы
            glow = nd.gaussian_filter(keep.astype(float), 5) * 0.6
            a = np.maximum(nd.gaussian_filter(keep.astype(float), 0.8), glow)
            img = np.where(keep[..., None], img, np.array([255, 165, 80]))
        frames[f.stem] = save(img, a, f'item-{f.stem}', box)
        print(f.stem, frames[f.stem])
    lines = ['// Сгенерировано scripts/cut_hall_items.py — не править руками',
             '/** Фирменные вещи и декор зала: x, y, w, h в пикселях комнаты */',
             'export const HALL_ITEMS: Record<string, [number, number, number, number]> = {']
    lines += [f"  {k}: [{', '.join(map(str, v))}]," for k, v in frames.items()]
    lines.append('};')
    TS.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
