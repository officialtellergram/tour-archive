/**
 * A square hero for eBay's gallery, from the garment's outline.
 *
 * eBay's gallery tile is square; our heroes are 3:4 portraits, so eBay
 * letterboxes them in grey. This finds the garment against the wall (every
 * pixel that differs from the border's median colour), takes its bounding
 * box with a margin, and makes that square. Where the square runs past the
 * photograph, the photograph's own edge pixels are continued outward and
 * then softened, so the wall carries on as a smooth tone with no band and
 * no reflection, and the garment is never cropped.
 *
 * If the outline looks wrong (a white tee on an off-white wall can hide from
 * the mask), the fallback is the whole photograph made square the same way:
 * still better than eBay's grey, and nothing is lost.
 */
import sharp from 'sharp';

const SIDE = 1200; // eBay wants ≥ 500 px; 1200 matches the heroes
const MARGIN = 0.06; // around the garment, as a fraction of the longer side
const THRESHOLD = 34; // colour distance from the wall that counts as garment
const SOFTEN = 22; // blur sigma on the continued strips, in source pixels

export async function squareHero(src, out) {
  const { width: W, height: H } = await sharp(src).metadata();
  const small = 240;
  const { data, info } = await sharp(src).resize({ width: small }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const px = (x, y) => [data[(y * w + x) * ch], data[(y * w + x) * ch + 1], data[(y * w + x) * ch + 2]];

  // wall colour: median of the border pixels
  const border = [];
  for (let x = 0; x < w; x++) border.push(px(x, 0), px(x, h - 1));
  for (let y = 0; y < h; y++) border.push(px(0, y), px(w - 1, y));
  const med = (i) => border.map((p) => p[i]).sort((a, b) => a - b)[border.length >> 1];
  const wall = [med(0), med(1), med(2)];

  // garment mask → bounding box
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const rowHits = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(x, y);
      const d = Math.hypot(p[0] - wall[0], p[1] - wall[1], p[2] - wall[2]);
      if (d > THRESHOLD) {
        rowHits[y] += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  // stray rows (a nail, a shadow line) do not stretch the box; rows with substance do
  const solid = rowHits.map((n) => n >= Math.max(3, w * 0.03));
  const firstSolid = solid.indexOf(true);
  const lastSolid = solid.lastIndexOf(true);
  if (firstSolid >= 0) { y0 = Math.min(y0, firstSolid); y1 = Math.max(y1, lastSolid); }

  const scale = W / w;
  const plausible = x1 > x0 && y1 > y0 && (y1 - y0) / h >= 0.4 && (x1 - x0) / w >= 0.25;
  let box;
  if (plausible) {
    const bw = (x1 - x0 + 1) * scale;
    const bh = (y1 - y0 + 1) * scale;
    const side = Math.round(Math.max(bw, bh) * (1 + 2 * MARGIN));
    const cx = (x0 + x1 + 1) / 2 * scale;
    const cy = (y0 + y1 + 1) / 2 * scale;
    box = { left: Math.round(cx - side / 2), top: Math.round(cy - side / 2), side };
  } else {
    const side = Math.max(W, H);
    box = { left: Math.round((W - side) / 2), top: Math.round((H - side) / 2), side };
  }

  // the part of the square inside the photograph, continued outward
  const il = Math.max(0, box.left);
  const it = Math.max(0, box.top);
  const ir = Math.min(W, box.left + box.side);
  const ib = Math.min(H, box.top + box.side);
  const pad = { left: il - box.left, top: it - box.top, right: box.left + box.side - ir, bottom: box.top + box.side - ib };
  const extended = await sharp(src)
    .extract({ left: il, top: it, width: ir - il, height: ib - it })
    .extend({ ...pad, extendWith: 'copy' })
    .png()
    .toBuffer();

  // soften the continued strips: blur the whole continued image, then lay
  // the untouched photograph back over its own place, so only the strips
  // are soft and streaks of a textured edge become a tone
  // (sharp resizes before it composites, so the overlay happens at full size
  //  in its own pass and the resize in a second one)
  const photo = await sharp(src).extract({ left: il, top: it, width: ir - il, height: ib - it }).png().toBuffer();
  const softened = await sharp(extended)
    .blur(SOFTEN)
    .composite([{ input: photo, left: pad.left, top: pad.top }])
    .png()
    .toBuffer();
  await sharp(softened)
    .resize(SIDE, SIDE, { fit: 'fill' })
    .jpeg({ quality: 86 })
    .toFile(out);
  return { plausible, box, wall };
}
