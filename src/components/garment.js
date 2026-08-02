/**
 * Vector garment plates.
 *
 * Every product "photograph" on the site is drawn here: a flat-lay silhouette
 * built from the item's garment type, tinted with its colourway, and overlaid
 * with a pattern inferred from the piece's name (argyle, stripe, crest, mesh,
 * cable, houndstooth). Deterministic — the same item always renders identically.
 */

let uid = 0;
const nextId = () => `g${(uid += 1)}`;

/* ---------------- silhouettes ----------------
 * Drawn on a 400×460 field. Garments occupy roughly x 40–360, y 96–356,
 * which is close to the proportions of a real flat-lay: body a little wider
 * than half its length, hem slightly narrower than the chest.
 */

const NECK_L = 170;
const NECK_R = 230;
const NECK_Y = 96;
const SHOULDER_Y = 106;
const HEM_Y = 356;

/**
 * Torso with sleeves, mirrored about x=200. Points are given for the left half
 * only, top to bottom: shoulder tip → cuff outer → cuff inner → armpit → hem.
 * Explicit coordinates rather than a clever formula — flat-lay proportions are
 * a matter of taste, and these are tuned by eye against real product shots.
 */
function torsoPath({ shoulderX, cuffOut, cuffIn, pit, hemX, hemY = HEM_Y }) {
  const mx = (p) => [400 - p[0], p[1]];
  const L = (p) => `L${p[0]},${p[1]}`;
  return [
    `M${NECK_L},${NECK_Y}`,
    L([shoulderX, SHOULDER_Y]),
    L(cuffOut),
    L(cuffIn),
    L(pit),
    L([hemX, hemY]),
    L([400 - hemX, hemY]),
    L(mx(pit)),
    L(mx(cuffIn)),
    L(mx(cuffOut)),
    L([400 - shoulderX, SHOULDER_Y]),
    `L${NECK_R},${NECK_Y}`,
    'Z',
  ].join(' ');
}

const SILHOUETTES = {
  sweater: () =>
    torsoPath({ shoulderX: 130, cuffOut: [38, 248], cuffIn: [76, 282], pit: [116, 190], hemX: 104 }),
  cardigan: () =>
    torsoPath({ shoulderX: 130, cuffOut: [38, 248], cuffIn: [76, 282], pit: [116, 190], hemX: 104 }),
  rugby: () =>
    torsoPath({ shoulderX: 126, cuffOut: [34, 252], cuffIn: [72, 286], pit: [114, 192], hemX: 100 }),
  windshirt: () =>
    torsoPath({ shoulderX: 124, cuffOut: [32, 250], cuffIn: [70, 284], pit: [112, 190], hemX: 98 }),
  jacket: () =>
    torsoPath({ shoulderX: 120, cuffOut: [28, 254], cuffIn: [66, 288], pit: [108, 192], hemX: 94 }),
  polo: () =>
    torsoPath({ shoulderX: 128, cuffOut: [68, 186], cuffIn: [108, 212], pit: [122, 204], hemX: 106 }),

  // Slipover: widest at the shoulder, with a genuinely concave armhole scoop.
  vest: () =>
    `M${NECK_L},${NECK_Y} L96,116 C118,150 126,176 126,202 L112,340 ` +
    `L288,340 L274,202 C274,176 282,150 304,116 L${NECK_R},${NECK_Y} Z`,

  trousers: () =>
    `M124,98 L276,98 L288,178 L280,${HEM_Y} L232,${HEM_Y} L206,212 ` +
    `L194,212 L168,${HEM_Y} L120,${HEM_Y} L112,178 Z`,

  cap: () =>
    'M92,254 C92,172 134,134 200,134 C266,134 308,172 308,254 ' +
    'C322,258 328,270 322,280 C300,300 250,310 200,310 ' +
    'C150,310 100,300 78,280 C72,270 78,258 92,254 Z',
};

/* Neckline / construction detail. Everything here is clipped to the
   silhouette at render time, so a collar can never escape the garment. */
function detailPaths(type) {
  const V = `M${NECK_L},${NECK_Y} L200,164 L${NECK_R},${NECK_Y}`;
  switch (type) {
    case 'sweater':
      return [V, 'M177,102 L200,150 L223,102'];
    case 'vest':
      return [V, 'M177,102 L200,150 L223,102', 'M126,202 L112,340 M274,202 L288,340'];
    case 'cardigan':
      return [V, `M200,164 L200,${HEM_Y}`, 'M192,200 h4 M192,244 h4 M192,288 h4'];
    case 'windshirt':
      return [
        'M166,100 L200,140 L234,100 L238,122 L200,162 L162,122 Z',
        'M200,162 L200,256',
        'M118,300 L128,300 M272,300 L282,300',
      ];
    case 'jacket':
      return [
        'M164,100 L200,146 L236,100 L242,126 L200,170 L158,126 Z',
        `M200,170 L200,${HEM_Y}`,
        'M140,268 L172,268 M228,268 L260,268',
      ];
    case 'polo':
    case 'rugby':
      return [
        'M168,98 L200,140 L232,98 L236,120 L200,158 L164,120 Z',
        'M188,150 L188,212 M212,150 L212,212',
        'M188,166 h-6 M212,166 h6',
      ];
    case 'trousers':
      return [
        'M116,132 L284,132',
        'M200,132 L200,206',
        'M138,120 h16 M246,120 h16',
      ];
    case 'cap':
      return [
        'M200,134 L200,262',
        'M112,180 C150,208 250,208 288,180',
        'M92,254 C140,272 260,272 308,254',
      ];
    default:
      return [];
  }
}

/* ---------------- pattern inference ---------------- */

export function patternFor(item) {
  const hay = `${item.name} ${item.colorName} ${item.story}`.toLowerCase();
  if (/argyle|diamond|intarsia/.test(hay)) return 'argyle';
  if (/houndstooth|tweed/.test(hay)) return 'tweed';
  if (/stripe/.test(hay)) return 'stripe';
  if (/mesh/.test(hay)) return 'mesh';
  if (/cable/.test(hay)) return 'cable';
  if (/crest|crested|shield/.test(hay)) return 'crest';
  if (/flannel|twill|poplin|gabardine|doubleknit/.test(hay)) return 'twill';
  return 'knit';
}

function patternDefs(kind, id, colors) {
  const [c1, c2, c3] = colors;
  switch (kind) {
    case 'argyle':
      return `<pattern id="${id}" width="88" height="112" patternUnits="userSpaceOnUse">
        <rect width="88" height="112" fill="${c1}"/>
        <path d="M44,4 L84,56 L44,108 L4,56 Z" fill="${c2}" opacity="0.9"/>
        <path d="M0,56 L44,4 M44,108 L88,56" stroke="${c3}" stroke-width="2" fill="none" opacity="0.75"/>
        <path d="M0,56 L44,108 M44,4 L88,56" stroke="${c3}" stroke-width="2" fill="none" opacity="0.4"/>
      </pattern>`;
    case 'stripe':
      return `<pattern id="${id}" width="1" height="72" patternUnits="userSpaceOnUse">
        <rect width="1" height="72" fill="${c1}"/>
        <rect y="0" width="1" height="26" fill="${c2}"/>
        <rect y="34" width="1" height="8" fill="${c3}"/>
      </pattern>`;
    case 'tweed':
      return `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="${c1}"/>
        <path d="M0,0 L10,10 L0,20 Z M10,0 L20,10 L10,20 Z" fill="${c2}" opacity="0.85"/>
        <path d="M0,10 L20,10" stroke="${c3}" stroke-width="0.7" opacity="0.35"/>
      </pattern>`;
    case 'mesh':
      return `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse">
        <rect width="9" height="9" fill="${c1}"/>
        <circle cx="4.5" cy="4.5" r="2" fill="${c2}" opacity="0.5"/>
      </pattern>`;
    case 'cable':
      return `<pattern id="${id}" width="30" height="24" patternUnits="userSpaceOnUse">
        <rect width="30" height="24" fill="${c1}"/>
        <path d="M8,0 C16,8 16,16 8,24 M22,0 C14,8 14,16 22,24" stroke="${c2}" stroke-width="3.2" fill="none" opacity="0.7" stroke-linecap="round"/>
      </pattern>`;
    case 'twill':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
        <rect width="8" height="8" fill="${c1}"/>
        <rect width="3" height="8" fill="${c2}" opacity="0.42"/>
      </pattern>`;
    default: /* knit */
      return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="${c1}"/>
        <path d="M0,3 H6" stroke="${c2}" stroke-width="1.1" opacity="0.34"/>
        <path d="M3,0 V6" stroke="${c2}" stroke-width="0.7" opacity="0.18"/>
      </pattern>`;
  }
}

/* ---------------- crest badge ---------------- */

function crestMark(colors, x = 200, y = 236, s = 1) {
  const [, , c3] = colors;
  return `<g transform="translate(${x} ${y}) scale(${s})" class="crest-mark">
    <path d="M0,-30 L26,-19 L26,6 C26,22 14,32 0,38 C-14,32 -26,22 -26,6 L-26,-19 Z"
      fill="none" stroke="${c3}" stroke-width="2.4"/>
    <path d="M0,-18 L0,16 M-14,-2 L14,-2" stroke="${c3}" stroke-width="1.8"/>
    <circle cx="0" cy="-2" r="5" fill="${c3}"/>
  </g>`;
}

/* ---------------- public API ---------------- */

/**
 * Render a garment SVG.
 * @param {object} item   inventory item
 * @param {object} [opts] { view: 'front'|'detail'|'flat', showCrest: boolean }
 */
export function garmentSVG(item, opts = {}) {
  const { view = 'front' } = opts;
  const type = SILHOUETTES[item.garment] ? item.garment : 'sweater';
  const colors = item.colorway && item.colorway.length === 3
    ? item.colorway
    : ['#cfc6ae', '#a89e85', '#4a4739'];

  const kind = patternFor(item);
  const pid = nextId();
  const clipId = nextId();
  const shadeId = nextId();

  const outline = SILHOUETTES[type]();
  const details = detailPaths(type);
  const wantsCrest = kind === 'crest' || /crest|university|team|walker/i.test(item.name);

  // "detail" view zooms the chest; "flat" view pulls back for the full lay.
  const viewBox =
    view === 'detail' ? '128 92 144 144' : view === 'flat' ? '10 60 380 350' : '24 74 352 306';

  return `<svg viewBox="${viewBox}" role="img" aria-label="${escapeAttr(
    item.name
  )} — ${escapeAttr(item.colorName)} ${type}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${patternDefs(kind, pid, colors)}
    <clipPath id="${clipId}"><path d="${outline}"/></clipPath>
    <linearGradient id="${shadeId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="46%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.17"/>
    </linearGradient>
  </defs>

  <g class="garment">
    <path d="${outline}" fill="${colors[0]}"/>
    <g clip-path="url(#${clipId})">
      <rect x="-40" y="0" width="480" height="560" fill="url(#${pid})"/>
      <rect x="-40" y="0" width="480" height="560" fill="url(#${shadeId})"/>
    </g>
    <path class="outline" d="${outline}" fill="none" stroke="${colors[2]}"
      stroke-width="2.2" stroke-linejoin="round" opacity="0.85"/>
    <g class="detail" clip-path="url(#${clipId})" fill="none" stroke="${colors[2]}"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
      ${details.map((d) => `<path d="${d}"/>`).join('\n      ')}
    </g>
    ${wantsCrest ? crestMark(colors, 200, 222, view === 'detail' ? 1.2 : 0.85) : ''}
  </g>
</svg>`;
}

/** Small monochrome silhouette used on collection tiles. */
export function collectionMark(collection, garmentType = 'sweater') {
  const type = SILHOUETTES[garmentType] ? garmentType : 'sweater';
  const [c1, c2, c3] = collection.palette;
  const pid = nextId();
  const clipId = nextId();
  const outline = SILHOUETTES[type]();
  return `<svg viewBox="24 74 352 306" role="img" aria-label="${escapeAttr(
    collection.name
  )} collection" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="${c1}"/>
        <path d="M0,3 H6" stroke="${c2}" stroke-width="1.2" opacity="0.4"/>
      </pattern>
      <clipPath id="${clipId}"><path d="${outline}"/></clipPath>
    </defs>
    <path d="${outline}" fill="${c1}"/>
    <g clip-path="url(#${clipId})">
      <rect x="-40" y="0" width="480" height="560" fill="url(#${pid})"/>
    </g>
    <path d="${outline}" fill="none" stroke="${c3}" stroke-width="2.4" stroke-linejoin="round"/>
    <g clip-path="url(#${clipId})" fill="none" stroke="${c3}" stroke-width="1.8"
       stroke-linejoin="round" opacity="0.65">
      ${detailPaths(type).map((d) => `<path d="${d}"/>`).join('')}
    </g>
  </svg>`;
}

/**
 * The house crest: a solid racing-green shield carrying a bespoke serif T.
 *
 * The T is drawn as a single outline rather than set in a typeface, so it holds
 * its exact bracketed-serif proportions at any size. The hairline border is a
 * separate stroked path (class `draw`) so the hero can animate it on.
 */
export function houseCrest() {
  const shield =
    'M60,5 L114,25 L114,74 C114,107 91,130 60,145 C29,130 6,107 6,74 L6,25 Z';
  const innerRule =
    'M60,15 L106,32 L106,74 C106,101 87,121 60,135 C33,121 14,101 14,74 L14,32 Z';
  const bespokeT =
    'M29,45 L91,45 L91,65 L83,65 L83,57 L66,57 L66,101 L77,101 L77,112 ' +
    'L43,112 L43,101 L54,101 L54,57 L37,57 L37,65 L29,65 Z';

  return `<svg class="hero-crest" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg"
    role="img" aria-label="Tour Archive crest">
    <path class="crest-shield" d="${shield}"/>
    <path class="crest-rule draw" d="${innerRule}"/>
    <path class="crest-letter" d="${bespokeT}"/>
  </svg>`;
}

function escapeAttr(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
