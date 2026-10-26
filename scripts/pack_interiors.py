"""Картинки зданий изнутри для карточек: art-src/v2/interiors/*.png (1536×1024) → src/game/art/interiors/*.webp (768×512).

Запуск: python3 scripts/pack_interiors.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'v2' / 'interiors'
OUT = ROOT / 'src' / 'game' / 'art' / 'interiors'
OUT.mkdir(parents=True, exist_ok=True)
for f in sorted(SRC.glob('*.png')):
    im = Image.open(f).convert('RGB').resize((768, 512), Image.LANCZOS)
    im.save(OUT / (f.stem + '.webp'), 'WEBP', quality=82, method=6)
print('ok', len(list(OUT.glob('*.webp'))))
