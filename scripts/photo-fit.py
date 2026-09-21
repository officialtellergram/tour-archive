"""Fit one photograph to the house stock convention: 1200x1600, 3:4, JPEG.

    python scripts/photo-fit.py <src> <dst>

Pads, never crops — a garment photographed on a hanger loses its cuffs to a
crop, and the deck/PDP stages are built for `contain` on exactly this ratio.
The padding colour is the median of the source's border pixels, so a piece
shot on a wall or a sheet gets more of that same wall, not a grey slab.
EXIF orientation is applied FIRST (phone photos carry rotation in metadata
and would otherwise land sideways). Quality steps down until the file sits
under the shared MAX_BYTES budget from scripts/lib/stock-constants.mjs.

Exit 0 on success, 1 on any failure — the drain treats a non-zero exit as
"skip this product, report it", never as "ship a broken image".
"""
import os
import sys

from PIL import Image, ImageOps

MAX_BYTES = 1_572_864  # 1.5 MiB — mirrors scripts/lib/stock-constants.mjs
W, H = 1200, 1600


def border_median(im, band=12):
    w, h = im.size
    px = []
    for box in ((0, 0, w, band), (0, h - band, w, h), (0, 0, band, h), (w - band, 0, w, h)):
        strip = im.crop(box).resize((8, 8), Image.BOX)
        px.extend(strip.getdata())
    px.sort(key=lambda p: sum(p))
    return px[len(px) // 2]


def fit(src, dst):
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    w, h = im.size
    target = W / H
    if w / h > target:            # too wide -> pad top/bottom
        nh = round(w / target)
        canvas = Image.new('RGB', (w, nh), border_median(im))
        canvas.paste(im, (0, (nh - h) // 2))
    else:                         # too tall -> pad sides
        nw = round(h * target)
        canvas = Image.new('RGB', (nw, h), border_median(im))
        canvas.paste(im, ((nw - w) // 2, 0))
    out = canvas.resize((W, H), Image.LANCZOS)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    for q in (85, 80, 75, 70, 65, 60):
        out.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(dst) <= MAX_BYTES:
            print('%s  %dx%d  q%d  %d B' % (os.path.basename(dst), W, H, q, os.path.getsize(dst)))
            return 0
    print('!! %s over budget at q60' % dst, file=sys.stderr)
    return 1


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    try:
        sys.exit(fit(sys.argv[1], sys.argv[2]))
    except Exception as e:  # noqa: BLE001 — any failure is a skip, loudly
        print('!! %s: %s' % (sys.argv[1], e), file=sys.stderr)
        sys.exit(1)
