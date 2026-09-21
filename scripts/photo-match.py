"""Match loose photographs to archived pieces by resemblance to their heroes.

    python scripts/photo-match.py <folder> <slug> [<slug> ...]
    python scripts/photo-match.py <folder> --collection=presidents-cup-2026

For a folder of unlabelled shots (a Drive dump, a camera roll) and a set of
manifest entries that already have a hero photograph, this scores every
shot against every hero and proposes an assignment — with the rotation that
fit best, so shots saved sideways still match — plus a margin between the
best and second-best candidate. A wide margin is a confident match; a narrow
one is flagged for a human, because a wrong photograph on a listing is worse
than a missing one.

Two features, combined: an RGB histogram (what the garment is coloured) and
a coarse 16x20 thumbnail of the centre (where the garment sits). Neither is
clever; together they separate a purple polo from a navy sweater reliably,
which is the job.

Prints a table and writes <folder>/match.json for photo-place.py to act on.
"""
import io
import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK = os.path.join(ROOT, 'public', 'stock')
MANIFEST = os.path.join(STOCK, 'manifest.json')
THUMB = (16, 20)


def load(path):
    return ImageOps.exif_transpose(Image.open(path)).convert('RGB')


def features(im):
    """Histogram (colour) + centre thumbnail (layout), both normalised."""
    w, h = im.size
    # centre 70% — the garment, not the floor or the hanger rail
    cx, cy = int(w * 0.15), int(h * 0.15)
    core = im.crop((cx, cy, w - cx, h - cy))
    hist = core.resize((128, 128), Image.BOX).histogram()
    total = float(sum(hist)) or 1.0
    hist = [v / total for v in hist]
    t = core.resize(THUMB, Image.BOX)
    px = [c / 255.0 for p in t.getdata() for c in p]
    return hist, px


def distance(a, b):
    ha, pa = a
    hb, pb = b
    dh = sum(abs(x - y) for x, y in zip(ha, hb))           # 0..2
    dp = sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa)  # 0..1
    return 0.6 * dh + 0.4 * dp * 2


def rotations(im):
    yield 0, im
    for deg in (90, 180, 270):
        yield deg, im.rotate(deg, expand=True)


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    folder = sys.argv[1]
    manifest = json.load(io.open(MANIFEST, encoding='utf-8'))
    coll = next((a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('--collection=')), None)
    if coll:
        slugs = [e['id'].replace('stock-', '') for e in manifest['items'] if e.get('collection') == coll and e.get('file')]
    else:
        slugs = sys.argv[2:]
    heroes = {}
    for slug in slugs:
        p = os.path.join(STOCK, f'{slug}.jpg')
        if not os.path.exists(p):
            print('!! no hero for', slug, file=sys.stderr)
            continue
        heroes[slug] = features(load(p))
    if not heroes:
        sys.exit(1)

    files = sorted(f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f)))
    result = []
    print('%-28s %-46s %6s %5s %s' % ('photo', 'best match', 'rot', 'dist', 'margin'))
    for f in files:
        try:
            im = load(os.path.join(folder, f))
        except Exception as e:  # noqa: BLE001
            print('%-28s UNREADABLE %s' % (f, e))
            continue
        scored = []
        for deg, r in rotations(im):
            fr = features(r)
            for slug, hf in heroes.items():
                scored.append((distance(fr, hf), slug, deg))
        scored.sort()
        best = scored[0]
        # margin against the best score for a DIFFERENT piece
        other = next((s for s in scored if s[1] != best[1]), None)
        margin = (other[0] - best[0]) if other else 9.9
        flag = '' if margin >= 0.06 else '  <- check'
        print('%-28s %-46s %6s %5.3f %6.3f%s' % (f[:28], best[1], f'{best[2]}°', best[0], margin, flag))
        result.append({'file': f, 'slug': best[1], 'rotate': best[2], 'dist': round(best[0], 4), 'margin': round(margin, 4), 'confident': margin >= 0.06})

    out = os.path.join(folder, 'match.json')
    io.open(out, 'w', encoding='utf-8').write(json.dumps(result, indent=2))
    print('\nwrote', out)
    by = {}
    for r in result:
        by.setdefault(r['slug'], []).append(r['file'])
    for slug, fs in by.items():
        print('  %-46s %d shot(s)' % (slug, len(fs)))


if __name__ == '__main__':
    main()
