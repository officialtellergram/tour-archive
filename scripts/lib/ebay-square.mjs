/**
 * Square crops for eBay — a plain crop, nothing painted in.
 *
 * eBay's store grid and gallery tiles are square; our photographs are 3:4,
 * so each tile showed the piece letterboxed between grey bars. This crops
 * each photograph to the square that is its full width, slid up or down so
 * the garment sits in the centre. The hanger hook is the first thing to go;
 * on a long piece the collar and hem lose an equal sliver each. The square
 * never reaches outside the photograph: no padding, no blur, no mirrored or
 * continued wall — the objection to the earlier attempts (see git history,
 * square-hero.mjs).
 *
 * How the garment is found (on a 240px thumbnail, then scaled up):
 *   1. wall colour per row (its two ends) and per column (its top), so the
 *      lighting gradient across the wall is not read as garment;
 *   2. garment = every pixel far from both its row's and column's wall; its
 *      bounding box, ignoring sparse rows and columns (a nail, a shadow line);
 *   3. the square is the photo's shorter edge; its centre is the box's centre,
 *      clamped so the square stays inside the photograph.
 * A frame with no plausible garment box (a close-up of a logo or label,
 * which fills the frame) gets the centred square.
 *
 * squareCrop(src, out) → { side, left, top, detected }
 */
import sharp from 'sharp';

const THRESHOLD = 34; // colour distance from the wall that counts as garment

export async function garmentBox(src) {
  const { width: W, height: H } = await sharp(src).metadata();
  const small = 240;
  const { data, info } = await sharp(src).resize({ width: small }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const px = (x, y) => [data[(y * w + x) * ch], data[(y * w + x) * ch + 1], data[(y * w + x) * ch + 2]];

  // The wall is lit unevenly (one side falls off into shadow), so one colour
  // for the whole frame reads the dark side as garment. Each row takes its
  // wall from its own two ends, each column from its own top: a pixel is
  // garment when it is far from BOTH the row's and the column's wall.
  const EDGE = 6;
  const median3 = (pts) => [0, 1, 2].map((i) => pts.map((p) => p[i]).sort((a, b) => a - b)[pts.length >> 1]);
  const rowWallL = [], rowWallR = [], colWall = [];
  for (let y = 0; y < h; y++) {
    rowWallL.push(median3(Array.from({ length: EDGE }, (_, i) => px(i, y))));
    rowWallR.push(median3(Array.from({ length: EDGE }, (_, i) => px(w - 1 - i, y))));
  }
  for (let x = 0; x < w; x++) colWall.push(median3(Array.from({ length: EDGE }, (_, i) => px(x, i))));
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

  const rowHits = new Array(h).fill(0);
  const colHits = new Array(w).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(x, y);
      // the nearer end of the row is the wall this pixel sits on (lighting runs across the frame)
      const rowWall = x < w / 2 ? rowWallL[y] : rowWallR[y];
      const d = Math.min(dist(p, rowWall), dist(p, colWall[x]));
      if (d > THRESHOLD) { rowHits[y] += 1; colHits[x] += 1; }
    }
  }
  // Rows and columns with substance bound the box; stray hits do not stretch it.
  const solidRows = rowHits.map((n) => n >= Math.max(3, w * 0.03));
  const solidCols = colHits.map((n) => n >= Math.max(3, h * 0.03));
  const y0 = solidRows.indexOf(true), y1 = solidRows.lastIndexOf(true);
  const x0 = solidCols.indexOf(true), x1 = solidCols.lastIndexOf(true);

  const scale = W / w;
  const plausible = x1 > x0 && y1 > y0 && (y1 - y0) / h >= 0.4 && (x1 - x0) / w >= 0.25 && (x1 - x0) / w < 0.98;
  return { W, H, plausible, box: plausible ? { x0: x0 * scale, y0: y0 * scale, x1: (x1 + 1) * scale, y1: (y1 + 1) * scale } : null };
}

/**
 * The square window: the photo's shorter edge on a side, centred on the
 * garment, clamped inside the photograph. Never larger than the photo.
 */
export function squareWindow({ W, H, plausible, box }) {
  const side = Math.min(W, H);
  const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
  if (!plausible) return { side, left: clamp((W - side) / 2, W - side), top: clamp((H - side) / 2, H - side), detected: false };
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return { side, left: clamp(cx - side / 2, W - side), top: clamp(cy - side / 2, H - side), detected: true };
}

export async function squareCrop(src, out, { quality = 82 } = {}) {
  const win = squareWindow(await garmentBox(src));
  await sharp(src).extract({ left: win.left, top: win.top, width: win.side, height: win.side }).jpeg({ quality }).toFile(out);
  return win;
}
