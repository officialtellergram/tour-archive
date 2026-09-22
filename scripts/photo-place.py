"""Place matched photographs into a piece's carousel.

    python scripts/photo-place.py <folder> [--all] [--only=<slug>,<slug>]

Reads <folder>/match.json (from photo-match.py). For every CONFIDENT match
— or every match with --all, after a human has checked the table — it
rotates the shot as the matcher found best, fits it to the house 1200x1600
through photo-fit.py, and writes it into public/stock/carousel/<slug>/.
Frame 01 is always the existing hero so the rail is complete; new shots
follow in filename order. The manifest entry's photos[] is rewritten and
_photosPulled stamped. Never runs git.

Eight frames is the cap (the audit's, and Stripe's). Extras are reported,
not silently dropped.
"""
import io
import json
import os
import subprocess
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOCK = os.path.join(ROOT, 'public', 'stock')
MANIFEST = os.path.join(STOCK, 'manifest.json')
FIT = os.path.join(ROOT, 'scripts', 'photo-fit.py')
CAP = 8


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    folder = sys.argv[1]
    take_all = '--all' in sys.argv
    only = next((set(a.split('=', 1)[1].split(',')) for a in sys.argv if a.startswith('--only=')), None)
    matches = json.load(io.open(os.path.join(folder, 'match.json'), encoding='utf-8'))
    manifest = json.load(io.open(MANIFEST, encoding='utf-8'))
    by_id = {e['id']: e for e in manifest['items']}

    groups = {}
    for m in matches:
        if not (take_all or m['confident']):
            continue
        if m.get('duplicate'):
            continue  # the hero itself, already frame 01
        if only and m['slug'] not in only:
            continue
        groups.setdefault(m['slug'], []).append(m)

    tmp = os.path.join(os.environ.get('TEMP', '/tmp'), 'photo-place')
    os.makedirs(tmp, exist_ok=True)
    placed = 0
    for slug, shots in groups.items():
        entry = by_id.get(f'stock-{slug}')
        if not entry or not entry.get('file'):
            print('!! no manifest entry/hero for', slug, file=sys.stderr)
            continue
        shots.sort(key=lambda m: m['file'])
        if len(shots) > CAP - 1:
            print('  %s: %d shots, keeping the first %d (cap %d incl. hero)' % (slug, len(shots), CAP - 1, CAP))
            shots = shots[:CAP - 1]
        outdir = os.path.join(STOCK, 'carousel', slug)
        os.makedirs(outdir, exist_ok=True)
        frames = []
        # 01 = the hero, re-fitted so every frame shares one geometry
        subprocess.run([sys.executable, FIT, os.path.join(STOCK, entry['file']), os.path.join(outdir, '01.jpg')], check=True, capture_output=True)
        frames.append(f'carousel/{slug}/01.jpg')
        for i, m in enumerate(shots, start=2):
            im = ImageOps.exif_transpose(Image.open(os.path.join(folder, m['file']))).convert('RGB')
            if m['rotate']:
                im = im.rotate(m['rotate'], expand=True)
            staged = os.path.join(tmp, f'{slug}-{i:02d}.jpg')
            im.save(staged, 'JPEG', quality=92)
            r = subprocess.run([sys.executable, FIT, staged, os.path.join(outdir, f'{i:02d}.jpg')], capture_output=True, text=True)
            if r.returncode != 0:
                print('  !! %s frame %02d: %s' % (slug, i, (r.stderr or r.stdout).strip()[:160]))
                continue
            frames.append(f'carousel/{slug}/{i:02d}.jpg')
            print('  %s  <- %s%s' % (frames[-1], m['file'], f'  (rotated {m["rotate"]}°)' if m['rotate'] else ''))
        entry['photos'] = frames
        entry['_photosPulled'] = __import__('datetime').date.today().isoformat()
        io.open(MANIFEST, 'w', encoding='utf-8', newline='').write(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
        placed += 1
        print('  ok %s - %d frames' % (slug, len(frames)))
    print('\n%d piece(s) given a carousel' % placed)


if __name__ == '__main__':
    main()
