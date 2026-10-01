"""Contact sheet of a match proposal, for checking by eye before placing.

    python scripts/photo-sheet.py <folder> [out.jpg]

Reads <folder>/match.json (from photo-match.py) and draws one row per piece:
the hero first, then every shot assigned to it, rotated as proposed, labelled
with its filename, margin and any duplicate / low-confidence flag. The sheet
stays under 1750 px on its long side so it can be read as a single image.

The matcher is a histogram and a thumbnail. It has put shots on the wrong
piece and turned upright close-ups sideways; this sheet is the check.
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK = os.path.join(ROOT, 'public', 'stock')
LIMIT = 1750


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    folder = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(folder, 'match-sheet.jpg')
    matches = json.load(io.open(os.path.join(folder, 'match.json'), encoding='utf-8'))
    by = {}
    for m in matches:
        by.setdefault(m['slug'], []).append(m)
    cols = 1 + max(len(v) for v in by.values())
    tw = min(220, (LIMIT - 8) // cols - 8)
    th = int(tw * 4 / 3)
    rows = len(by)
    if rows * (th + 30) + 8 > LIMIT:
        th = (LIMIT - 8) // rows - 30
        tw = int(th * 3 / 4)
    sheet = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 30) + 8), 'white')
    draw = ImageDraw.Draw(sheet)
    for r, (slug, shots) in enumerate(sorted(by.items())):
        y = 8 + r * (th + 30)
        cells = [(os.path.join(STOCK, slug + '.jpg'), 0, 'HERO ' + slug[:26])]
        for m in sorted(shots, key=lambda m: m['file']):
            flag = ' DUP' if m.get('duplicate') else ('' if m['confident'] else ' ?')
            cells.append((os.path.join(folder, m['file']), m['rotate'], '%s m%.2f%s' % (m['file'][:12], m['margin'], flag)))
        for c, (path, rot, label) in enumerate(cells):
            im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
            if rot:
                im = im.rotate(rot, expand=True)
            im.thumbnail((tw, th))
            x = 8 + c * (tw + 8)
            sheet.paste(im, (x, y))
            draw.text((x, y + th + 4), label, fill='black')
    sheet.save(out, quality=85)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
