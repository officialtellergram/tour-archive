"""Hero plate builder — Drive folder in, public/hero derivatives out.

Replaces the old out-of-repo make-plates.py. That script had to live outside
the repo because its masters were licensed Adobe Stock; these masters are the
team's OWN course photographs, so the only reason to keep them out is weight
(4 MB phone JPEGs). They stay in Google Drive, synced to this machine; only
the derivatives are committed.

    python scripts/hero-plates.py            # build the plates in PLATES
    python scripts/hero-plates.py --list     # show what's in the Drive folder
    python scripts/hero-plates.py --preview  # contact sheet of the outputs

Geometry, inherited from the plates already proven on the live site:
  * output 1760 wide, ratio held near 1.33 — plate 1 shipped 1760x1324
    (1.329) and clears the 390x844 floor through the 1.09 drift with room.
  * `pad` adds feathered synthetic sky ABOVE the photograph, in file. This
    is compositional, not decorative: object-position Y is a no-op at
    height-fit viewports, so in-file headroom is the ONLY way to push a
    horizon down clear of the header and wordmark. Phone photos are already
    4:3 with generous sky, so most need little or none.
  * a whisper of blur (0.45) before encode — it costs nothing visible under
    the parchment veil and buys a lot of bytes.
  * every output is asserted under the 200 KB plate budget the audit warns
    at; quality steps down until it fits.
"""
import argparse
import os
import sys

from PIL import Image, ImageFilter, ImageOps

SRC = os.environ.get('HERO_SOURCE_DIR', r'G:\My Drive\Landing Page Photos')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'public', 'hero')
BUDGET = 204_800
WIDTH = 1760

# The rotation, in order. `pad` is source-scale pixels of feathered sky added
# above the frame; `crop` is an optional (l, t, r, b) box applied first.
PLATES = [
    # first slide — also the one index.html preloads
    dict(src='IMG_5602.JPG', out='ocean-hole.jpg', pad=120, crop=None),
    dict(src='IMG_2870.JPG', out='links-sky.jpg', pad=0, crop=None),
    dict(src='IMG_1887.JPG', out='sunset-water.jpg', pad=0, crop=None),
]


def feather_pad(im, pad_px, feather_rows, sample_rows=24, blur=40):
    """pad_px of synthetic sky above the photo: per-column mean colour of the
    top sample_rows, blurred, then a linear feather into the photograph."""
    if pad_px <= 0:
        return im
    w, h = im.size
    strip = im.crop((0, 0, w, sample_rows)).resize((w, 1), Image.BOX).resize((w, pad_px), Image.NEAREST)
    strip = strip.filter(ImageFilter.GaussianBlur(blur))
    canvas = Image.new('RGB', (w, h + pad_px))
    canvas.paste(strip, (0, 0))
    canvas.paste(im, (0, pad_px))
    top = canvas.crop((0, pad_px, w, pad_px + feather_rows))
    fill = strip.crop((0, pad_px - 1, w, pad_px)).resize((w, feather_rows), Image.NEAREST)
    mask = Image.linear_gradient('L').resize((w, feather_rows))  # 0 top -> 255 bottom
    canvas.paste(Image.composite(top, fill, mask), (0, pad_px))
    return canvas


def encode(img, name, blur=0.45):
    """Step quality down until the plate fits the budget. Never ships over."""
    img = img.filter(ImageFilter.GaussianBlur(blur))
    path = os.path.join(OUT, name)
    for quality in (66, 62, 58, 54, 50):
        img.save(path, 'JPEG', quality=quality, optimize=True, progressive=True, subsampling=2)
        size = os.path.getsize(path)
        if size <= BUDGET:
            print('  %-22s %dx%d  q%d  %,d B'.replace('%,d', '%d') % (name, img.width, img.height, quality, size))
            return path
    print('!! %s over budget at every quality' % name, file=sys.stderr)
    sys.exit(1)


def build():
    if not os.path.isdir(SRC):
        print('source folder not found: %s' % SRC, file=sys.stderr)
        print('(is Google Drive for Desktop running? set HERO_SOURCE_DIR to override)', file=sys.stderr)
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)
    print('building %d plates from %s' % (len(PLATES), SRC))
    for p in PLATES:
        path = os.path.join(SRC, p['src'])
        if not os.path.exists(path):
            print('!! missing source: %s' % path, file=sys.stderr)
            sys.exit(1)
        # EXIF transpose FIRST — a phone photo's orientation lives in metadata
        # and Pillow will otherwise hand back a sideways frame.
        im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
        if p['crop']:
            im = im.crop(p['crop'])
        im = feather_pad(im, p['pad'], feather_rows=max(80, p['pad'] // 2))
        h = round(im.height * WIDTH / im.width)
        im = im.resize((WIDTH, h), Image.LANCZOS)
        print('  %-22s <- %-14s ratio %.3f' % (p['out'], p['src'], WIDTH / h))
        encode(im, p['out'])
    print('\nplates written to public/hero/ — bump ?v in HERO_BACKDROPS or the CDN serves the old ones for 4h')


def listing():
    files = sorted(f for f in os.listdir(SRC) if f.lower().endswith(('.jpg', '.jpeg', '.png')))
    print('%d photo(s) in %s' % (len(files), SRC))
    for f in files:
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, f)))
        print('  %-16s %dx%d  %.1f MB' % (f, im.width, im.height, os.path.getsize(os.path.join(SRC, f)) / 1048576))


def preview():
    """Contact sheet of the BUILT plates, with the header band drawn on, so the
    headroom can be judged the way a visitor meets it."""
    from PIL import ImageDraw
    names = [p['out'] for p in PLATES]
    cell_w = 880
    sheet_h = 0
    ims = []
    for n in names:
        im = Image.open(os.path.join(OUT, n)).convert('RGB')
        im = im.resize((cell_w, round(im.height * cell_w / im.width)), Image.LANCZOS)
        ims.append((n, im))
        sheet_h += im.height + 30
    sheet = Image.new('RGB', (cell_w, sheet_h), (238, 234, 226))
    d = ImageDraw.Draw(sheet, 'RGBA')
    y = 0
    for n, im in ims:
        sheet.paste(im, (0, y))
        # the header band a visitor sees over the plate (~88px of a 900px stage)
        d.rectangle([0, y, cell_w, y + round(im.height * 0.12)], fill=(16, 30, 56, 90))
        d.text((8, y + 6), 'header band', fill=(255, 255, 255))
        d.text((8, y + im.height + 8), '%s  %dx%d' % (n, im.width, im.height), fill=(30, 30, 30))
        y += im.height + 30
    out = os.path.join(os.environ.get('TEMP', '/tmp'), 'hero-preview.jpg')
    sheet.save(out, quality=84)
    print('preview:', out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()
    if a.list:
        listing()
    elif a.preview:
        preview()
    else:
        build()
