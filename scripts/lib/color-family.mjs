/**
 * Which colour family a photographed garment belongs to.
 *
 * The hero photograph is a hanger shot on the studio wall. The garment's box
 * comes from the same detector the eBay square crop uses (ebay-square.mjs);
 * inside it, every pixel that is clearly not the wall (far from its row's
 * wall colour at either end) is sorted into a family by hue, saturation and
 * lightness, and the family with the most pixels wins. The mean colour of
 * those pixels is kept as a swatch. A white garment on the pale wall can
 * fail the wall test almost everywhere; then the whole box is read instead.
 *
 * Families are the ids in src/data/colors.js. The thresholds were set by
 * eye against the catalogue (13 Nov 2026) and will drift as stock does —
 * `colorFamily` on a manifest entry overrides the camera for one piece.
 *
 *   colorFamilyOf(src) → { family, swatch, share, detected }
 */
import sharp from 'sharp';
import { garmentBox } from './ebay-square.mjs';

const WALL_DISTANCE = 22; // RGB distance from the row's wall that counts as garment

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

export function familyOfRGB(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  if (l > 0.74 && s < 0.35) return 'cream';
  if (l < 0.16) return 'black';
  if (s < 0.14) return l > 0.68 ? 'cream' : 'grey';
  if (h < 14 || h >= 340) return l < 0.42 && s < 0.5 ? 'purple' : 'red';
  if (h < 42) return s < 0.5 || l < 0.45 ? 'brown' : 'red';
  if (h < 68) return l < 0.35 ? 'brown' : 'yellow';
  if (h < 170) return 'green';
  if (h < 262) return 'navy';
  if (h < 340) return 'purple';
  return 'red';
}

export async function colorFamilyOf(src) {
  const gb = await garmentBox(src);
  const { data, info } = await sharp(src).resize({ width: 160 }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const sx = w / gb.W;
  const box = gb.plausible
    ? { x0: gb.box.x0 * sx, y0: gb.box.y0 * sx, x1: gb.box.x1 * sx, y1: gb.box.y1 * sx }
    : { x0: w * 0.25, y0: h * 0.3, x1: w * 0.75, y1: h * 0.8 };
  // the inner 70% of the box, so the wall around the sleeves stays out
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const X0 = Math.max(0, Math.round(box.x0 + bw * 0.15)), X1 = Math.min(w, Math.round(box.x1 - bw * 0.15));
  const Y0 = Math.max(0, Math.round(box.y0 + bh * 0.15)), Y1 = Math.min(h, Math.round(box.y1 - bh * 0.15));

  const px = (x, y) => [data[(y * w + x) * ch], data[(y * w + x) * ch + 1], data[(y * w + x) * ch + 2]];
  const med3 = (pts) => [0, 1, 2].map((c) => pts.map((p) => p[c]).sort((a, b) => a - b)[pts.length >> 1]);
  const wallL = [], wallR = [];
  for (let y = 0; y < h; y++) {
    wallL.push(med3(Array.from({ length: 5 }, (_, i) => px(i, y))));
    wallR.push(med3(Array.from({ length: 5 }, (_, i) => px(w - 1 - i, y))));
  }
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

  const tally = (keepWallToo) => {
    const count = {};
    const sum = {};
    let kept = 0, seen = 0;
    for (let y = Y0; y < Y1; y++) {
      for (let x = X0; x < X1; x++) {
        const p = px(x, y);
        seen++;
        if (!keepWallToo && dist(p, x < w / 2 ? wallL[y] : wallR[y]) < WALL_DISTANCE) continue;
        kept++;
        const f = familyOfRGB(p[0], p[1], p[2]);
        count[f] = (count[f] || 0) + 1;
        const s = (sum[f] ||= [0, 0, 0]);
        s[0] += p[0]; s[1] += p[1]; s[2] += p[2];
      }
    }
    return { count, sum, kept, seen };
  };
  let t = tally(false);
  if (t.kept < t.seen * 0.05) t = tally(true);
  const total = Object.values(t.count).reduce((a, b) => a + b, 0);
  if (!total) return { family: '', swatch: '', share: 0, detected: gb.plausible };
  const [top, n] = Object.entries(t.count).sort((a, b) => b[1] - a[1])[0];
  const mean = t.sum[top].map((v) => Math.round(v / n));
  const swatch = '#' + mean.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { family: top, swatch, share: Math.round((n / total) * 100) / 100, detected: gb.plausible };
}
