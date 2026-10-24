"""Иконки интерфейса: art-src/v2/icons/*.png (128×128) → src/game/art/icons/*.webp (96×96).

96 px — с запасом для экрана 2× при показе 32–48 px. Запуск: python3 scripts/pack_icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'icons'
OUT = ROOT / 'src' / 'game' / 'art' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
for f in sorted(SRC.glob('*.png')):
    im = Image.open(f).convert('RGBA').resize((96, 96), Image.LANCZOS)
    im.save(OUT / (f.stem + '.webp'), 'WEBP', quality=90, method=6)
print('ok', len(list(OUT.glob('*.webp'))))
