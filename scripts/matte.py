"""Восстанавливает прозрачность из двух снимков одного атласа: на белом и на чёрном фоне.

Figma отдаёт скриншоты без альфа-канала, поэтому атлас снимается дважды.
Для каждого пикселя: alpha = 1 - (белый - чёрный), цвет = чёрный / alpha.

python3 scripts/matte.py white.png black.png out.png
"""
import sys

import numpy as np
from PIL import Image

white = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float64) / 255
black = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.float64) / 255
alpha = np.clip(1 - (white - black).mean(axis=2), 0, 1)
safe = np.where(alpha > 1e-3, alpha, 1)[..., None]
rgb = np.clip(black / safe, 0, 1)
out = np.dstack([rgb, alpha[..., None]])
out[alpha < 2 / 255] = 0
Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(sys.argv[3], optimize=True)
print(sys.argv[3], Image.open(sys.argv[3]).size)
