/**
 * Core Web Vitals — Lighthouse (mobile preset) against the built site.
 *
 * Serves dist/ in-process with the same SPA fallback GitHub Pages provides,
 * drives headless Edge (or Chrome) through Lighthouse's node API and prints
 * the performance score with LCP, CLS, TBT, Speed Index and FCP per route,
 * plus the image-shaped audits this site cares about (unsized images, lazy
 * LCP, modern formats, offscreen images, responsive sizing).
 *
 * NOT a gate: numbers move with the machine (simulated throttling is
 * deterministic-ish, but CPU headroom is not). Run it, read it, decide.
 *
 *   npm run vitals                          → "/", "/archive", one live item
 *   node scripts/vitals.mjs archive item/stock-x  (routes WITHOUT a leading
 *                                             slash — Git Bash rewrites /x)
 *   --runs 3      median of three runs per route (by performance score)
 *   --json out.json   also write every run's metrics to a file
 *   --desktop     desktop preset instead of the mobile default
 *
 * Browser: $CHROME_PATH, else Windows Edge, else whatever chrome-launcher
 * finds. Needs dist/ (run after `npm run build:pages`).
 */
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const C = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' };

/* ---------------- args ---------------- */

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  argv.splice(i, v && !v.startsWith('--') ? 2 : 1);
  return v && !v.startsWith('--') ? v : true;
};
const RUNS = Math.max(1, Number(flag('--runs') || 1));
const JSON_OUT = flag('--json');
const DESKTOP = flag('--desktop') === true;
const routeArgs = argv.filter((a) => !a.startsWith('--'));

/* ---------------- routes ---------------- */

function defaultRoutes() {
  const routes = ['', 'archive'];
  try {
    const snap = JSON.parse(readFileSync(join(DIST, 'api', 'inventory.json'), 'utf8'));
    const live = (snap.items || []).find((i) => !i.sold && !i.upcoming && Array.isArray(i.photos) && i.photos.length > 1)
      || (snap.items || [])[0];
    if (live) routes.push(`item/${live.id}`);
  } catch {
    /* no snapshot — home and archive still measure */
  }
  return routes;
}

/* ---------------- static server (SPA fallback, like Pages) ---------------- */

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.mp4': 'video/mp4', '.xml': 'application/xml',
};
function serveDist() {
  const server = createServer((req, res) => {
    const clean = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^([/\\])+/, '');
    let file = join(DIST, clean);
    try {
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    } catch {
      file = join(DIST, 'index.html');
    }
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'public, max-age=14400',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port })));
}

/* ---------------- browser ---------------- */

const WIN_EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
function resolveBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  return WIN_EDGE.find((p) => existsSync(p)) || undefined; // undefined → chrome-launcher's own search
}

/* ---------------- metrics ---------------- */

const METRICS = [
  ['perf', 'Perf', (lhr) => Math.round((lhr.categories.performance?.score ?? 0) * 100), (v) => String(v)],
  ['fcp', 'FCP', (lhr) => lhr.audits['first-contentful-paint']?.numericValue, ms],
  ['lcp', 'LCP', (lhr) => lhr.audits['largest-contentful-paint']?.numericValue, ms],
  ['si', 'SI', (lhr) => lhr.audits['speed-index']?.numericValue, ms],
  ['tbt', 'TBT', (lhr) => lhr.audits['total-blocking-time']?.numericValue, ms],
  ['cls', 'CLS', (lhr) => lhr.audits['cumulative-layout-shift']?.numericValue, (v) => (v == null ? '—' : v.toFixed(3))],
];
function ms(v) {
  return v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}

/** The first node snippet anywhere in an audit's details (the LCP element
 *  audit nests a table inside a list; the shape has moved between versions). */
function findSnippet(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return '';
  if (node.type === 'node' && node.snippet) return node.snippet;
  for (const v of Object.values(node)) {
    const hit = Array.isArray(v) ? v.map((x) => findSnippet(x, depth + 1)).find(Boolean) : findSnippet(v, depth + 1);
    if (hit) return hit;
  }
  return '';
}

/* The image-shaped audits: printed only when they carry something. */
const IMAGE_AUDITS = [
  'unsized-images', 'lcp-lazy-loaded', 'prioritize-lcp-image', 'modern-image-formats',
  'uses-optimized-images', 'uses-responsive-images', 'offscreen-images', 'layout-shifts',
  'largest-contentful-paint-element', 'render-blocking-resources', 'uses-rel-preconnect',
];

function summarise(lhr) {
  const out = {};
  for (const [key, , pick] of METRICS) out[key] = pick(lhr);
  out.lcpElement = findSnippet(lhr.audits['largest-contentful-paint-element']?.details);
  out.flags = [];
  for (const id of IMAGE_AUDITS) {
    const a = lhr.audits[id];
    if (!a || a.score === null || a.score === 1 || a.scoreDisplayMode === 'notApplicable') continue;
    if (a.scoreDisplayMode === 'informative' && !a.details?.items?.length) continue;
    const n = a.details?.items?.length ?? 0;
    const save = a.details?.overallSavingsBytes ? ` ~${(a.details.overallSavingsBytes / 1024).toFixed(0)} KB` : '';
    const t = a.details?.overallSavingsMs ? ` ~${Math.round(a.details.overallSavingsMs)} ms` : '';
    out.flags.push(`${id}${n ? ` (${n})` : ''}${save}${t}`);
  }
  return out;
}

/* ---------------- run ---------------- */

async function main() {
  let lighthouse, chromeLauncher;
  try {
    ({ default: lighthouse } = await import('lighthouse'));
    chromeLauncher = await import('chrome-launcher'); // ships with lighthouse
  } catch (err) {
    console.log(`${C.red}✖ lighthouse is not installed (npm i -D lighthouse): ${err.message}${C.off}`);
    process.exitCode = 1;
    return;
  }

  const routes = (routeArgs.length ? routeArgs : defaultRoutes()).map((r) => r.replace(/^\/+/, ''));
  const { server, port } = await serveDist();
  const base = `http://127.0.0.1:${port}`;

  let chrome;
  try {
    chrome = await chromeLauncher.launch({
      chromePath: resolveBrowser(),
      chromeFlags: ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    console.log(`${C.red}✖ could not launch a browser: ${err.message}${C.off}`);
    console.log(`${C.dim}   set CHROME_PATH to msedge.exe / chrome.exe${C.off}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  console.log(`\n${C.dim}── Tour Archive · web vitals (Lighthouse ${DESKTOP ? 'desktop' : 'mobile'}, ${RUNS} run${RUNS === 1 ? '' : 's'}/route) ──${C.off}`);
  const results = [];
  const options = {
    port: chrome.port,
    output: 'json',
    logLevel: 'silent',
    onlyCategories: ['performance'],
    ...(DESKTOP
      ? { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttlingMethod: 'simulate' }
      : {}),
  };

  try {
    for (const route of routes) {
      // ?probe= stamp: the intro plate stands down for probes (index.html head)
      const url = `${base}/${route}${route.includes('?') ? '&' : '?'}probe=vitals`;
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        try {
          const { lhr } = await lighthouse(url, options);
          if (lhr.runtimeError) throw new Error(lhr.runtimeError.message);
          runs.push(summarise(lhr));
        } catch (err) {
          console.log(`${C.red}✖ /${route}: run ${i + 1} failed — ${err.message}${C.off}`);
          process.exitCode = 1;
        }
      }
      if (!runs.length) continue;
      const sorted = [...runs].sort((a, b) => a.perf - b.perf);
      const median = sorted[Math.floor(sorted.length / 2)];
      results.push({ route: `/${route}`, median, runs });

      const line = METRICS.map(([key, label, , fmt]) => `${label} ${C.bold}${fmt(median[key])}${C.off}`).join('  ·  ');
      console.log(`\n${C.green}/${route}${C.off}  ${line}`);
      if (median.lcpElement) console.log(`${C.dim}   LCP element: ${median.lcpElement.replace(/\s+/g, ' ').slice(0, 110)}${C.off}`);
      if (median.flags.length) console.log(`${C.yellow}   flags: ${median.flags.join(' · ')}${C.off}`);
      else console.log(`${C.dim}   no image audits flagged${C.off}`);
    }
  } finally {
    await chrome.kill();
    server.close();
  }

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), preset: DESKTOP ? 'desktop' : 'mobile', results }, null, 2));
    console.log(`\n${C.dim}   wrote ${JSON_OUT}${C.off}`);
  }
  console.log('');
}

/* ---------------- entry (last: every const above must exist first) ---------------- */

if (!existsSync(join(DIST, 'index.html'))) {
  console.log(`${C.red}✖ dist/index.html missing — build first (npm run build:pages)${C.off}`);
  process.exitCode = 1;
} else {
  await main();
}
