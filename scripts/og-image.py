"""
Share image — public/brand/og.jpg.

The card a link unfurls into on iMessage, X, LinkedIn, Slack and in Google's
Discover feed. Every one of those crops to roughly 1.91:1, so the portrait
lockup (1067x1419) came through as a sliver of navy with the signature lost.

This writes a 1200x630 JPEG: the site's navy (#101e38, --navy in app.css)
edge to edge, the lockup scaled to sit inside a generous margin, nothing else.
The lockup's own background is already that navy, so it disappears into the
canvas; the cream is lifted through a luminance mask rather than pasted, which
keeps the anti-aliased brush edges clean and drops the one-pixel fringe the
PNG carries along its border.

Re-run after any change to the lockup:

    python scripts/og-image.py

Quality 85, target under 150 KB. Bump ?v= on the og:image tag in index.html
when the output changes — Pages serves public/ unhashed and Cloudflare caches
it, and the social scrapers cache harder still.
"""

from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "brand" / "lockup.png"
OUT = ROOT / "public" / "brand" / "og.jpg"

W, H = 1200, 630
NAVY = (0x10, 0x1E, 0x38)
CREAM = (255, 255, 237)  # the lockup's ink, sampled from the PNG
MARGIN = 65  # px top and bottom; the mark keeps its aspect inside that box
TRIM = 3  # px shaved off every edge of the PNG before masking
FLOOR = 8  # alpha below this is export speckle, not brush
LIMIT_KB = 150


def main() -> None:
    lockup = Image.open(SRC).convert("RGB")
    # The PNG has a one-pixel light border (an export artefact, (195,198,205)
    # along the top). Cropped off, or the card shows a hairline box.
    lockup = lockup.crop((TRIM, TRIM, lockup.width - TRIM, lockup.height - TRIM))

    # Luminance mask: 0 where the pixel is the navy ground, 255 where it is
    # cream, in between along the brush edges. Anything under FLOOR is ground
    # noise ((18,30,56) speckle in the export), not brush, and is zeroed.
    lum = lockup.convert("L")
    navy_l = int(0.299 * NAVY[0] + 0.587 * NAVY[1] + 0.114 * NAVY[2])
    cream_l = int(0.299 * CREAM[0] + 0.587 * CREAM[1] + 0.114 * CREAM[2])

    def to_alpha(v: int) -> int:
        a = round((v - navy_l) * 255 / (cream_l - navy_l))
        return 0 if a < FLOOR else min(255, a)

    mask = lum.point(to_alpha)

    # Fit the mark inside the height budget; the canvas is wider than the
    # mark is tall, so height is the binding constraint.
    target_h = H - 2 * MARGIN
    scale = target_h / lockup.height
    target_w = round(lockup.width * scale)
    mask = mask.resize((target_w, target_h), Image.LANCZOS)

    canvas = Image.new("RGB", (W, H), NAVY)
    ink = Image.new("RGB", (target_w, target_h), CREAM)
    x = (W - target_w) // 2
    y = (H - target_h) // 2
    canvas.paste(ink, (x, y), mask)

    canvas.save(OUT, "JPEG", quality=85, optimize=True, progressive=True, subsampling=0)
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)} {W}x{H} — mark {target_w}x{target_h} at ({x},{y}) — {kb:.0f} KB")
    if kb > LIMIT_KB:
        raise SystemExit(f"og.jpg is {kb:.0f} KB, over the {LIMIT_KB} KB budget")

    # Sanity: the corners must be the site navy exactly, or the card shows a
    # seam against a navy page.
    check = Image.open(OUT).convert("RGB")
    corner = check.getpixel((2, 2))
    diff = ImageChops.difference(Image.new("RGB", (1, 1), corner), Image.new("RGB", (1, 1), NAVY)).getpixel((0, 0))
    if max(diff) > 3:
        raise SystemExit(f"corner pixel {corner} drifted from navy {NAVY}")


if __name__ == "__main__":
    main()
