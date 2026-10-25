/**
 * Stall sheet — the one page to print before selling in person.
 *
 *   node scripts/stall-sheet.mjs                print the table, write the HTML
 *   node scripts/stall-sheet.mjs path/out.html
 *     default out: Desktop/Tour Archive/stall-sheet.html
 *
 * Every piece that can be sold at the stall, with the exact words to type in
 * the Stripe Dashboard app's Description so the sync matches the sale:
 *   - every live piece from the catalogue (on the site and eBay today)
 *   - every HELD piece: a Stripe product with metadata held = true, kept off
 *     the site and eBay for a future drop but sellable in person
 * plus the list price, size, a tick box, and a second line to write the
 * amount actually charged. Held pieces come straight from Stripe, so the
 * sheet needs STRIPE_SECRET_KEY (.env). Read-only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skuInText } from './lib/catalogue.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'public', 'stock', 'manifest.json');
const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'C:/Users/Karen Plankton/Desktop/Tour Archive/stall-sheet.html';
const C = process.stdout.isTTY ? { yellow: '\x1b[33m', dim: '\x1b[2m', off: '\x1b[0m' } : { yellow: '', dim: '', off: '' };

const envFile = join(ROOT, '.env');
const env = {
  ...(existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) : {}),
  ...(process.env.STRIPE_SECRET_KEY ? { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY } : {}),
};

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const rows = manifest.items
  .filter((e) => !e.sold && !e.retired)
  .map((e) => ({ held: false, name: e.name, sku: e.sku || '', size: e.size || '', price: Number(e.price), where: e.collection === 'basic-stock' ? 'shop' : e.collection }));

// held pieces live only in Stripe
const isHeld = (p) => /^(true|yes|1)$/i.test(String(p.metadata?.held || '')) || /^\s*\[?hold\]?\s*[:\-–]/i.test(p.name) || /(^|\n)\s*\[?held\]?\s*:?\s*(\r?\n|$)/i.test(String(p.description || ''));
const cleanName = (n) => n.replace(/^\s*\[?hold\]?\s*[:\-–]\s*/i, '').trim();
if (env.STRIPE_SECRET_KEY) {
  let after = '';
  for (;;) {
    const r = await fetch(`https://api.stripe.com/v1/products?active=true&limit=100&expand[]=data.default_price${after ? `&starting_after=${after}` : ''}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    const page = await r.json();
    if (!r.ok) { console.log(`${C.yellow}⚠ Stripe: ${page.error?.message || r.status}; held pieces left off${C.off}`); break; }
    for (const p of page.data) if (isHeld(p)) rows.push({ held: true, name: cleanName(p.name), sku: skuInText(p.metadata?.sku) || skuInText(p.description), size: (p.description || '').match(/\bsize\s*:?\s*(XS|S|M|L|XL|XXL|2XL|3XL)\b/i)?.[1]?.toUpperCase() || '', price: (p.default_price?.unit_amount || 0) / 100, where: 'held for a drop' });
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
} else {
  console.log(`${C.yellow}⚠ no STRIPE_SECRET_KEY; held pieces left off the sheet${C.off}`);
}
rows.sort((a, b) => Number(a.held) - Number(b.held) || a.name.localeCompare(b.name));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const today = new Date().toISOString().slice(0, 10);
const html = `<!doctype html><meta charset="utf-8"><title>Tour Archive stall sheet ${today}</title>
<style>
  body{font:12px/1.35 Georgia,serif;color:#111;margin:14mm 12mm}
  h1{font-size:18px;font-weight:400;margin:0 0 2px}
  p.lead{margin:0 0 10px;color:#444}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}
  th{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#333}
  td.box{width:18px}
  td.box span{display:inline-block;width:12px;height:12px;border:1px solid #333}
  td.name{font-weight:600}
  td.type{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
  td.price,td.paid{white-space:nowrap}
  td.paid{width:64px;border-bottom:1px solid #bbb}
  tr.held td{background:#f3efe4}
  .tag{font-size:10px;border:1px solid #8a7a52;color:#5a4d2c;padding:0 4px;margin-left:6px;vertical-align:middle}
  .how{margin:12px 0 0;padding:8px 10px;border:1px solid #999;font-size:11.5px}
  @media print{.how{page-break-inside:avoid}}
</style>
<h1>Tour Archive · stall sheet · ${today}</h1>
<p class="lead">${rows.filter((r) => !r.held).length} pieces for sale${rows.some((r) => r.held) ? ` · ${rows.filter((r) => r.held).length} held for a drop (shaded; sell only if asked, they are not on the site)` : ''}. Tick a piece when it sells and write what was charged.</p>
<table><thead><tr><th></th><th>Piece</th><th>Type this in Description</th><th>Size</th><th>List</th><th>Charged</th></tr></thead><tbody>
${rows.map((r) => `<tr${r.held ? ' class="held"' : ''}><td class="box"><span></span></td><td class="name">${esc(r.name)}${r.held ? '<span class="tag">HELD</span>' : ''}</td><td class="type">${esc(r.sku || r.name)}</td><td>${esc(r.size)}</td><td class="price">$${r.price.toFixed(2)}</td><td class="paid"></td></tr>`).join('\n')}
</tbody></table>
<div class="how"><b>Each sale:</b> Stripe Dashboard app → + → Charge a card or send an invoice → amount → <b>Description: the words in the third column</b> → Tap to Pay. Tick the row. Within ten minutes the team gets "Sold in person: …"; if "not matched" arrives instead, the description was wrong — tell Karen the piece. Refunds: Payments → the payment → Refund (the piece goes back on sale by itself).</div>
`;
writeFileSync(OUT, html, 'utf8');
console.log(`\n${C.dim}── Tour Archive · stall sheet · ${today} ──${C.off}`);
for (const r of rows) console.log(`   ${r.held ? 'HELD ' : '     '}${(r.sku || r.name).padEnd(44).slice(0, 44)} ${r.size.padEnd(5)} $${r.price.toFixed(2).padStart(7)}  ${r.held ? '' : r.name}`);
console.log(`${C.dim}   ${rows.filter((r) => !r.held).length} for sale · ${rows.filter((r) => r.held).length} held → ${OUT}${C.off}`);
