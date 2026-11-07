"""Картинки игры в WebP: атласы и текстуры src/game/art/*.png → .webp (в 4–8 раз легче, качество на глаз то же).
Запускается последним шагом scripts/pack_v2.py, можно и отдельно: python3 scripts/webp.py
PNG после конвертации удаляются — в коде подключаются .webp (src/game/atlas.ts)."""
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parent.parent / 'src' / 'game' / 'art'
# Свет в окнах и мелкие спрайты — повыше качество, у остального глаз разницы не видит
QUALITY = {'lights': 92, 'people': 92, 'animals': 92}


def main() -> None:
    before = after = 0
    for f in sorted(ART.glob('*.png')):
        im = Image.open(f)
        out = f.with_suffix('.webp')
        q = QUALITY.get(f.stem, 88)
        im.save(out, 'WEBP', quality=q, alpha_quality=100, method=6)
        before += f.stat().st_size
        after += out.stat().st_size
        print(f'{f.name}: {f.stat().st_size // 1024} КБ → {out.stat().st_size // 1024} КБ')
        f.unlink()
    if before:
        print(f'итого {before / 1e6:.1f} МБ → {after / 1e6:.1f} МБ')


if __name__ == '__main__':
    main()
