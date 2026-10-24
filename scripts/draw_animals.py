#!/usr/bin/env python3
"""Животные улицы: голуби, белки, кошки, собаки — рисуем кодом в стиле жителей
(мягкие формы, тёмно-коричневый контур, румяные пятна), без генерации.

Каждый кадр рисуется в 4× и уменьшается до размера атласа (2× мира) — так края мягкие, как у жителей.
Выход: src/game/art/animals.png и src/game/animalFrames.ts (координаты кадров в единицах 1×).
Все животные смотрят вправо; влево — отражением в игре.

Запуск: python3 scripts/draw_animals.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SS = 4  # суперсэмплинг
OUT_SCALE = 2  # PNG крупнее мира в 2 раза, как остальные атласы
OUTLINE = (74, 52, 40, 255)
OUT_W = 1.1  # толщина контура в пикселях атласа


def ellipse_pts(cx, cy, rx, ry, angle=0.0, n=40):
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return pts


class Frame:
    """Кадр: список фигур; контур рисуется под всеми заливками одним силуэтом."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.shapes = []  # (kind, data, fill, outline?)

    def ell(self, cx, cy, rx, ry, fill, angle=0, outline=True):
        self.shapes.append(('poly', ellipse_pts(cx, cy, rx, ry, angle), fill, outline))

    def poly(self, pts, fill, outline=True):
        self.shapes.append(('poly', pts, fill, outline))

    def line(self, pts, fill, width, outline=True):
        self.shapes.append(('line', (pts, width), fill, outline))

    def dot(self, cx, cy, r, fill):
        self.shapes.append(('poly', ellipse_pts(cx, cy, r, r), fill, False))

    def render(self):
        W, H = self.w * SS, self.h * SS
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        s = lambda pts: [(x * SS, y * SS) for x, y in pts]
        o = OUT_W * SS
        # Контур: каждую фигуру рисуем раздутой
        for kind, data, fill, outline in self.shapes:
            if not outline:
                continue
            if kind == 'poly':
                d.polygon(s(data), fill=OUTLINE)
                d.line(s(data + data[:1]), fill=OUTLINE, width=int(o * 2), joint='curve')
            else:
                pts, width = data
                d.line(s(pts), fill=OUTLINE, width=int(width * SS + o * 2), joint='curve')
                for x, y in s(pts)[:1] + s(pts)[-1:]:
                    r = (width * SS + o * 2) / 2
                    d.ellipse((x - r, y - r, x + r, y + r), fill=OUTLINE)
        for kind, data, fill, outline in self.shapes:
            if kind == 'poly':
                d.polygon(s(data), fill=fill)
            else:
                pts, width = data
                d.line(s(pts), fill=fill, width=int(width * SS), joint='curve')
                for x, y in s(pts)[:1] + s(pts)[-1:]:
                    r = width * SS / 2
                    d.ellipse((x - r, y - r, x + r, y + r), fill=fill)
        return img.resize((self.w, self.h), Image.LANCZOS)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


# ——— Голубь: 22×18 ———
def pigeon(pose):
    f = Frame(22, 18)
    body, wing, head, neck = (150, 156, 172, 255), (176, 182, 196, 255), (128, 134, 152, 255), (110, 150, 138, 255)
    tail = shade(body, 0.75)
    fly = pose in ('fly1', 'fly2')
    peck = pose == 'peck'
    if not fly:
        step = {'stand': (0, 0), 'walk1': (-1, 1), 'walk2': (1, -1), 'peck': (0, 0)}[pose]
        f.line([(9 + step[0], 13), (9 + step[0], 16)], (214, 110, 110, 255), 1.0)
        f.line([(12 + step[1], 13), (12 + step[1], 16)], (214, 110, 110, 255), 1.0)
    f.poly([(1.5, 9), (6, 8), (7, 12.5), (2, 12)], tail)
    f.ell(10, 10.5, 6.5, 4.2, body, angle=-8)
    hx, hy = (16.5, 12.5) if peck else (15.5, 5.5)
    f.ell((hx + 11) / 2, (hy + 9) / 2, 3, 2.6, neck, angle=-30)
    f.ell(hx, hy, 3.2, 3.0, head)
    f.poly([(hx + 2.6, hy + 0.2), (hx + 4.6, hy + 1.0), (hx + 2.6, hy + 1.6)], (70, 60, 60, 255))
    f.dot(hx + 1.0, hy - 0.6, 0.7, (40, 30, 30, 255))
    if fly:
        up = pose == 'fly1'
        # Крыло — вытянутый овал с «пальцами» перьев на конце
        if up:
            f.ell(10.5, 4.5, 5.2, 2.2, wing, angle=-70)
            f.ell(12.5, 3.2, 3.2, 1.6, shade(wing, 0.85), angle=-70, outline=False)
        else:
            f.ell(10.5, 14, 5, 2.2, wing, angle=70)
            f.ell(12, 15.5, 2.8, 1.5, shade(wing, 0.85), angle=70, outline=False)
    else:
        f.ell(9, 10, 4.3, 2.6, wing, angle=-8)
        f.line([(6.5, 10.2), (10, 10.8)], shade(wing, 0.7), 0.6, outline=False)
    return f


# ——— Белка: 26×24 ———
def squirrel(pose):
    f = Frame(26, 24)
    fur, belly, tail_c = (196, 110, 52, 255), (244, 210, 160, 255), (210, 122, 60, 255)
    if pose == 'sit':
        f.ell(6.5, 9, 4.8, 8, tail_c, angle=-15)
        f.ell(6, 4.5, 3, 3.5, shade(tail_c, 1.12), angle=-15, outline=False)
        f.ell(13, 16, 5, 6, fur)
        f.ell(14.5, 17, 2.6, 4, belly, outline=False)
        f.ell(16, 8.5, 4.2, 3.8, fur)
        f.poly([(14.5, 5.5), (15.5, 2.3), (17, 5)], fur)
        f.dot(17.6, 8, 0.8, (40, 28, 22, 255))
        f.dot(20, 9.4, 0.7, (60, 40, 32, 255))
        f.ell(17.5, 13, 1.6, 1.2, belly)  # лапки с орешком
        f.line([(11, 21.5), (15, 21.5)], fur, 1.6)
    else:
        a = pose == 'run1'
        f.ell(5.5, 10 if a else 11.5, 6, 3.8, tail_c, angle=-25 if a else -10)
        f.ell(13, 15, 6.5 if a else 5.5, 3.6, fur, angle=-5)
        f.ell(19.5, 12.5, 3.8, 3.4, fur)
        f.poly([(18.5, 10), (19.5, 6.8), (21, 9.6)], fur)
        f.dot(21, 12, 0.8, (40, 28, 22, 255))
        if a:
            f.line([(9, 17), (6.5, 19.5)], fur, 1.6)
            f.line([(17, 17), (20, 19)], fur, 1.6)
        else:
            f.line([(10, 17.5), (12, 20)], fur, 1.6)
            f.line([(15, 17.5), (13.5, 20)], fur, 1.6)
    return f


# ——— Кошка: 30×26 ———
CAT_COLORS = {
    'ginger': ((232, 146, 70, 255), (250, 214, 168, 255), True),
    'gray': ((140, 146, 158, 255), (214, 218, 226, 255), True),
    'black': ((62, 60, 70, 255), (236, 232, 228, 255), False),
}


def cat(color, pose):
    f = Frame(30, 26)
    fur, light, stripes = CAT_COLORS[color]
    if pose == 'sit':
        # Сидит лицом к нам, хвост обёрнут вокруг лап
        f.ell(20, 22, 6, 2.2, fur, angle=-5)
        f.ell(14, 17, 6.5, 7, fur)
        f.ell(14, 19, 3.5, 4.5, light, outline=False)
        f.ell(14, 8.5, 5.8, 5.2, fur)
        f.poly([(9, 6), (9.5, 0.8), (13, 4.5)], fur)
        f.poly([(19, 6), (18.5, 0.8), (15, 4.5)], fur)
        f.poly([(10, 4.5), (10.2, 2.6), (11.7, 4.3)], (240, 160, 160, 255), outline=False)
        f.poly([(18, 4.5), (17.8, 2.6), (16.3, 4.3)], (240, 160, 160, 255), outline=False)
        f.ell(14, 10.8, 2.6, 1.6, light, outline=False)
        f.dot(11.8, 8, 0.9, (40, 34, 30, 255))
        f.dot(16.2, 8, 0.9, (40, 34, 30, 255))
        f.dot(14, 10, 0.6, (210, 110, 110, 255))
        f.dot(10.4, 10.2, 0.9, (246, 170, 160, 160))
        f.dot(17.6, 10.2, 0.9, (246, 170, 160, 160))
        f.ell(11.5, 23, 2, 1.3, light)
        f.ell(16.5, 23, 2, 1.3, light)
        if stripes:
            f.line([(14, 3.6), (14, 5.4)], shade(fur, 0.75), 0.7, outline=False)
    elif pose == 'sleep':
        f.ell(15, 19, 10, 5, fur)
        f.ell(22, 17, 4.6, 4, fur)
        f.poly([(19.5, 14.5), (20, 10.8), (22.5, 13.5)], fur)
        f.poly([(24, 13.6), (25.6, 10.8), (26, 14.6)], fur)
        f.line([(21, 17.5), (22.6, 17.8)], (40, 34, 30, 255), 0.6, outline=False)
        f.line([(23.6, 17.6), (25, 17.2)], (40, 34, 30, 255), 0.6, outline=False)
        f.line([(6, 21), (9, 23.5), (16, 23.5)], fur, 2.2)
        if stripes:
            for x in (12, 15, 18):
                f.line([(x, 14.8), (x - 0.6, 17)], shade(fur, 0.75), 0.8, outline=False)
    else:
        a = pose == 'walk1'
        f.line([(6.5, 14), (3.5, 9), (4.5, 4.5)], fur, 2.2)
        legs = [(9, 6.5), (12, 13.5), (17, 13.5), (20, 23)] if a else [(10, 10.5), (11.5, 11), (18.5, 21), (19, 18)]
        for i in range(0, 4, 2):
            x0, x1 = legs[i]
            f.line([(x0 + 1, 18), (x1 - 1 if i else x0 + 1, 22.5)], shade(fur, 0.9), 1.8)
        f.ell(14, 16, 9, 4.6, fur)
        f.ell(22.5, 10.5, 4.8, 4.4, fur)
        f.poly([(19.5, 7.6), (20, 3.4), (22.6, 6.4)], fur)
        f.poly([(23.6, 6.4), (25.8, 3.6), (26.2, 7.8)], fur)
        f.dot(24.6, 10, 0.85, (40, 34, 30, 255))
        f.ell(25.8, 12.4, 1.8, 1.2, light, outline=False)
        f.line([(11, 18.5), (10 if a else 12, 23)], fur, 1.8)
        f.line([(17, 18.5), (18 if a else 16, 23)], fur, 1.8)
        if stripes:
            for x in (10, 13.5, 17):
                f.line([(x, 11.8), (x - 0.6, 14.2)], shade(fur, 0.75), 0.8, outline=False)
        if not stripes:
            f.ell(20, 15, 2.6, 2.4, light, outline=False)
    return f


# ——— Собака: 34×28 ———
DOG_COLORS = {
    'brown': ((176, 116, 62, 255), (226, 192, 146, 255), (120, 78, 44, 255)),
    'cream': ((228, 204, 160, 255), (248, 236, 214, 255), (190, 150, 100, 255)),
    'black': ((70, 64, 66, 255), (220, 210, 200, 255), (40, 36, 38, 255)),
}


def dog(color, pose):
    f = Frame(34, 28)
    fur, light, ear = DOG_COLORS[color]
    if pose == 'sit':
        f.line([(9, 20), (5, 15)], fur, 2.2)
        f.ell(15, 18, 7, 7.5, fur)
        f.ell(17.5, 19, 3.2, 5, light, outline=False)
        f.ell(20, 9, 5.6, 5.2, fur)
        f.ell(24.8, 11, 3.4, 2.6, light)
        f.dot(27.4, 10.2, 1.0, (40, 32, 30, 255))
        f.ell(16.8, 9.5, 2.2, 4, ear, angle=15)
        f.dot(21.4, 7.6, 0.9, (40, 32, 30, 255))
        f.line([(19, 22), (19, 26)], fur, 2)
        f.line([(14, 23), (13.5, 26)], fur, 2)
        f.line([(17, 14.8), (23, 14.8)], (200, 70, 60, 255), 1.2, outline=False)  # ошейник
    else:
        a = pose == 'walk1'
        f.line([(6, 15), (2.5, 10.5) if a else (3, 9)], fur, 2.2)
        back = [(9, 6.5), (13, 11)] if a else [(11, 9.5), (11, 11)]
        f.line([(10, 19), (8 if a else 11, 25)], shade(fur, 0.85), 2.2)
        f.line([(21, 19), (23 if a else 20, 25)], shade(fur, 0.85), 2.2)
        f.ell(15, 16, 10, 5.4, fur)
        f.ell(15, 18.5, 6, 2.6, light, outline=False)
        f.line([(13, 19), (14 if a else 12, 25)], fur, 2.2)
        f.line([(24, 19), (22 if a else 25, 25)], fur, 2.2)
        f.ell(26, 9.5, 5.2, 4.8, fur)
        f.ell(30.4, 11.5, 3.2, 2.4, light)
        f.dot(32.8, 10.8, 1.0, (40, 32, 30, 255))
        f.ell(23.6, 10.5, 2.1, 3.8, ear, angle=12)
        f.dot(27.4, 8.2, 0.9, (40, 32, 30, 255))
        f.line([(21.5, 13), (22.5, 15.8)], (200, 70, 60, 255), 1.2, outline=False)
        del back
    return f


def main():
    frames = []
    for p in ('stand', 'walk1', 'walk2', 'peck', 'fly1', 'fly2'):
        frames.append((f'pigeon-{p}', pigeon(p)))
    for p in ('sit', 'run1', 'run2'):
        frames.append((f'squirrel-{p}', squirrel(p)))
    for c in CAT_COLORS:
        for p in ('sit', 'walk1', 'walk2', 'sleep'):
            frames.append((f'cat-{c}-{p}', cat(c, p)))
    for c in DOG_COLORS:
        for p in ('walk1', 'walk2', 'sit'):
            frames.append((f'dog-{c}-{p}', dog(c, p)))

    # Раскладка: ряды по 8 кадров, кадры в 2× с отступом 2
    pad = 2
    cols = 8
    cell_w = max(fr.w for _, fr in frames) * OUT_SCALE + pad
    cell_h = max(fr.h for _, fr in frames) * OUT_SCALE + pad
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    coords = {}
    for i, (name, fr) in enumerate(frames):
        # Рисуем сразу в размере атласа: тот же кадр, но в 2× единиц
        fr2 = Frame(fr.w * OUT_SCALE, fr.h * OUT_SCALE)
        k = OUT_SCALE
        for kind, data, fill, outline in fr.shapes:
            if kind == 'poly':
                fr2.shapes.append((kind, [(x * k, y * k) for x, y in data], fill, outline))
            else:
                pts, width = data
                fr2.shapes.append((kind, ([(x * k, y * k) for x, y in pts], width * k), fill, outline))
        img = fr2.render()
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        sheet.paste(img, (x, y))
        coords[name] = (x // OUT_SCALE, y // OUT_SCALE, fr.w, fr.h)
    out = os.path.join(ROOT, 'src/game/art/animals.png')
    sheet.save(out, optimize=True)
    ts = ['// Создано scripts/draw_animals.py — не править руками.',
          '/** Кадры животных: [x, y, w, h] в единицах мира (PNG в 2×). Все смотрят вправо. */',
          'export const ANIMAL_FRAMES: Record<string, [number, number, number, number]> = {']
    for name, (x, y, w, h) in coords.items():
        ts.append(f"  '{name}': [{x}, {y}, {w}, {h}],")
    ts.append('};\n')
    with open(os.path.join(ROOT, 'src/game/animalFrames.ts'), 'w') as fh:
        fh.write('\n'.join(ts))
    print(out, sheet.size, len(frames), 'frames')


if __name__ == '__main__':
    main()
