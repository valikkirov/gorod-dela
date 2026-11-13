"""Цветы в горшках: между листьями модель оставила кусок стены (бежевый, светлый или в тени).
Листья зелёные (G ≥ R), горшок — терракота (R намного больше G) или ниже листьев; стена — тёплая и без зелени.
Над горшком всё «тёплое, но не терракота» делаем прозрачным. Вызывается из cut_hall.py после вырезки."""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd


def clean_leaves(path: Path) -> None:
    im = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
    ys, _ = np.nonzero(a > 40)
    if not len(ys):
        return
    top, bot = ys.min(), ys.max()
    upper = np.zeros(a.shape, bool)
    upper[: int(top + 0.62 * (bot - top))] = True
    lum = (r + g + b) / 3
    warm = r - g
    wall = (warm > 5) & (warm < 38) & (lum > 60) & upper & (a > 0)
    wall = nd.binary_opening(wall, iterations=1)
    a2 = np.where(wall, 0, a)
    lab, n = nd.label(a2 > 40)
    if n > 1:
        sizes = nd.sum(a2 > 40, lab, range(1, n + 1))
        keep = np.isin(lab, np.nonzero(sizes >= sizes.max() * 0.03)[0] + 1)
        a2 = a2 * nd.binary_dilation(keep, iterations=1)
    Image.fromarray(np.dstack([im[..., :3], a2]).astype(np.uint8)).save(path, quality=92, alpha_quality=100)
