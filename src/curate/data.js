/**
 * Curation Desk data layer.
 *
 * One API, two backends, and the pages cannot tell them apart:
 *
 *   • PRACTICE — localStorage on this device. The default until Supabase
 *     credentials land in config.js. Fully functional, seeded with examples,
 *     honest about being device-only.
 *   • LIVE — Supabase table `curation_finds` behind invite-only password
 *     accounts + RLS. The client library is imported dynamically so the main
 *     site bundle never pays for it (and practice mode never downloads it).
 *
 * Auth is deliberately password-based, not magic-link/OTP: Supabase's built-in
 * mailer sends 2 emails/hour and only to org team members, which makes email
 * flows a trap for a 4-person team. Accounts are created once in the dashboard
 * (ACTIONS.md § Curation Desk); sessions then persist per device indefinitely.
 *
 * Everything user-entered is untrusted: escape with esc() at render, and URLs
 * must survive validListingUrl() before they are stored or ever put in an href.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, FINDS_TABLE, DESK_PASSPHRASE_HASH } from './config.js';

/* ------------------------------------------------------------------ */
/* Pure helpers (exercised directly by scripts/integration.mjs)        */
/* ------------------------------------------------------------------ */

/** HTML-escape untrusted text for interpolation into markup. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Accept a pasted listing link only if it is a real http(s) URL.
 * Returns the canonical string or null — null must block the save.
 * (This is also the XSS gate: nothing that fails here may reach an href.)
 */
export function validListingUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (!url.hostname.includes('.')) return null;
  return url.href;
}

/** Tracking params that vary per share but never change the listing. */
const TRACKING = /^(utm_|_trk|mkcid|mkevt|mkrid|campid|customid|toolid|ssspo|sssrc|ssuid|widget_|share_|ref$|ref_|fbclid|gclid|igsh)/i;

/**
 * Canonical dedupe key for a listing URL: lowercase host without www,
 * no hash, no tracking params, no trailing slash. Two cofounders sharing
 * the same listing from different apps produce the same key.
 */
export function normalizeUrl(raw) {
  const valid = validListingUrl(raw);
  if (!valid) return null;
  const url = new URL(valid);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length
    ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}`
    : '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${host}${path}${query}`;
}

const SOURCES = [
  [/(^|\.)ebay\./i, 'eBay'],
  [/(^|\.)depop\.com$/i, 'Depop'],
  [/(^|\.)etsy\.com$/i, 'Etsy'],
  [/(^|\.)grailed\.com$/i, 'Grailed'],
  [/(^|\.)poshmark\.com$/i, 'Poshmark'],
  [/(^|\.)mercari\.com$/i, 'Mercari'],
  [/(^|\.)vinted\./i, 'Vinted'],
  [/(^|\.)shopgoodwill\.com$/i, 'ShopGoodwill'],
  [/(^|\.)facebook\.com$/i, 'Marketplace'],
  [/(^|\.)craigslist\.org$/i, 'Craigslist'],
];

/** Marketplace label inferred from the URL's hostname. */
export function sourceOf(raw) {
  const valid = validListingUrl(raw);
  if (!valid) return '';
  const host = new URL(valid).hostname;
  for (const [rx, label] of SOURCES) if (rx.test(host)) return label;
  return host.replace(/^www\./, '');
}

/** Something readable when the finder didn't type a title. */
export function displayTitle(find) {
  if (find.title?.trim()) return find.title.trim();
  const valid = validListingUrl(find.url);
  if (!valid) return 'Untitled find';
  const url = new URL(valid);
  const slug = url.pathname
    .split('/')
    .filter(Boolean)
    .pop();
  const words = (slug || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+\d{6,}\s*$/, '')
    .trim();
  const host = url.hostname.replace(/^www\./, '');
  return words.length > 3 && !/^\d+$/.test(words) ? words : `Listing on ${host}`;
}

/* ------------------------------------------------------------------ */
/* Dressed / undressed — ONE definition, used by the deck, the robot   */
/* and the guide. Derived from what the CARD CAN SHOW, never from what */
/* the robot did: a find dressed by hand in the drop form has no robot */
/* history and must reach the deck the instant it is dropped.          */
/* ------------------------------------------------------------------ */

/**
 * A find's photo resolved to something renderable — or null.
 * `absolute` carries the vetted http(s) URL; `repo` carries a repo-relative
 * path the page prefixes with the deploy base. This is the ONLY place that
 * decides whether a photo string may become a `src`.
 */
export function photoRef(find) {
  const p = String(find?.photo ?? '').trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) {
    const href = validListingUrl(p);
    return href ? { kind: 'absolute', value: href } : null;
  }
  if (!p.includes(':') && !p.startsWith('//') && /^[\w][\w./-]*$/.test(p)) {
    return { kind: 'repo', value: p };
  }
  return null;
}

/** Words a person or the robot actually wrote. NOT displayTitle() — that
    never returns empty, so testing it would mark every bare link as dressed. */
export const hasName = (find) => String(find?.title ?? '').trim() !== '';

/** THE definition. Picture + name. Price is deliberately not part of it. */
export const isDressed = (find) => Boolean(photoRef(find)) && hasName(find);

/** What a waiting find is short of — for an honest row, never for the gate. */
export function missingBits(find) {
  const noPhoto = !photoRef(find);
  const noName = !hasName(find);
  if (noPhoto && noName) return 'No picture or name yet.';
  if (noPhoto) return 'No picture yet.';
  if (noName) return 'No name yet.';
  return '';
}

/** Tries after which the robot stops on its own. Shared with the robot. */
export const DRESS_TRIES = 3;
/** Hours the robot waits before try 1→2→3. Robot-only, but lives beside
    DRESS_TRIES so the policy reads as one sentence. */
export const DRESS_BACKOFF_HOURS = [3, 6, 24];
/** Days after which an undressed find stops claiming "being dressed". */
export const DRESS_STALE_DAYS = 7;

/** dressed · sent-anyway · given-up · waiting, in that precedence order.
    'dressed' beats 'sent-anyway' on purpose: once the robot dresses a find a
    human forced through, the row stops shouting and just becomes a card.
    'given-up' has three triggers: the robot spent its tries, the URL can
    never be opened, or a week has passed with nothing to show — the last two
    matter because bot walls deliberately never spend a try. */
export function dressState(find, now = new Date()) {
  if (isDressed(find)) return 'dressed';
  if (find?.show_anyway) return 'sent-anyway';
  if (Number(find?.dress_tries || 0) >= DRESS_TRIES) return 'given-up';
  if (!validListingUrl(find?.url)) return 'given-up';
  const created = Date.parse(find?.created_at ?? '');
  if (!Number.isNaN(created) && now - created > DRESS_STALE_DAYS * 86400000) return 'given-up';
  return 'waiting';
}

/** THE DECK GATE. Dressed, or explicitly sent through by a person.
    Note 'given-up' does NOT auto-deal — a person still has to choose. */
export const isDeckReady = (find) => isDressed(find) || Boolean(find?.show_anyway);

/** How the unreviewed pile splits: dealable now vs still being dressed.
    INVARIANT: deckSplit(f).ready + deckSplit(f).waiting === tally(f).new */
export function deckSplit(finds, now = new Date()) {
  const out = { ready: 0, waiting: 0, givenUp: 0 };
  for (const f of finds) {
    if (f.status !== 'new') continue;
    if (isDeckReady(f)) { out.ready += 1; continue; }
    out.waiting += 1;
    if (dressState(f, now) === 'given-up') out.givenUp += 1;
  }
  return out;
}

/** Robot-side: is this undressed find due another look right now?
    Cool-down comes from DRESS_BACKOFF_HOURS keyed by tries so the schedule
    never dictates retry pressure — the policy does. */
export function dueForRobot(find, now = new Date()) {
  if (isDressed(find)) return false;
  if (!validListingUrl(find?.url)) return false;
  const tries = Number(find?.dress_tries || 0);
  if (tries >= DRESS_TRIES) return false;
  const last = Date.parse(find?.looked_at ?? '');
  if (Number.isNaN(last)) return true;
  const waitHours = DRESS_BACKOFF_HOURS[Math.min(tries, DRESS_BACKOFF_HOURS.length - 1)];
  return now - last >= waitHours * 3600000;
}

/**
 * The robot's title write is COWARDLY by design: one junk title makes a bare
 * find "dressed" and deals an unusable card the desk can never fix (there is
 * no edit affordance). Accept only a real og:title, of real length, that is
 * not a bot-wall phrase or the bare marketplace name.
 */
export function cleanScrapedTitle(raw, sourceLabel = '') {
  let t = String(raw ?? '').trim();
  if (!t) return '';
  t = t.replace(/\s*[|\-–—]\s*(eBay|Depop|Etsy|Grailed|Poshmark|Mercari|Vinted)\s*$/i, '').trim();
  if (t.length < 8) return '';
  if (/pardon our interruption|error page|access denied|verify you are a human|robot check|just a moment/i.test(t)) return '';
  const bare = t.toLowerCase();
  if (['ebay', 'depop', 'etsy', 'grailed', 'poshmark', 'mercari', 'vinted'].includes(bare)) return '';
  if (sourceLabel && bare === String(sourceLabel).toLowerCase()) return '';
  return t.slice(0, 140);
}

/** "Today" / "Yesterday" / "Tue 28 Jul" for pile grouping. */
export function whenLabel(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(then)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return then.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Display name from an email — "sam.h@x.com" → "Sam H". */
export function nameFromEmail(email) {
  const stem = String(email || '').split('@')[0];
  return stem
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'Teammate';
}

export const STATUSES = ['new', 'shortlist', 'pass', 'bought'];

/**
 * SHA-256 hex of a passphrase, normalized (trim + lowercase) so a phone
 * keyboard's auto-capitalize can't lock a founder out. Web Crypto — present
 * in every modern browser on HTTPS/localhost, and in Node 18+ for the tests.
 */
export async function hashPassphrase(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the offered phrase matches the team passphrase in config. */
export const verifyPassphrase = async (raw) => (await hashPassphrase(raw)) === DESK_PASSPHRASE_HASH;

/* ------------------------------------------------------------------ */
/* Mode selection                                                      */
/* ------------------------------------------------------------------ */

/**
 * Test escape hatch: the integration suite and the layout probe exercise the
 * practice adapter and the desk's layouts without credentials, so they can
 * force practice mode. Scoped to a device/process — forcing it on a real
 * visit only sandboxes that visitor's own browser.
 */
function practiceForced() {
  if (globalThis.__CURATE_FORCE_PRACTICE__) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('ta-curate-force-practice') === '1';
  } catch {
    return false;
  }
}

export const isLive = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !practiceForced();

const LS_KEY = 'ta-curate-practice-v1';

/** Dressing bookkeeping every find carries, in both modes, never undefined. */
const DRESS_DEFAULTS = { show_anyway: false, dress_tries: 0, looked_at: null };

/* Example finds so the first practice-mode visit demonstrates itself.
   Two carry photos (our own stock photography — guaranteed to render),
   one deliberately doesn't, so both card variants introduce themselves. */
const SEED = () => {
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
  return [
    {
      id: 'example-1',
      url: 'https://www.ebay.com/sch/i.html?_nkw=slazenger+vintage+golf+wind+shirt',
      title: 'Slazenger Golden Horseshoe wind shirt',
      note: 'Example find — swipe it away on the review page to see how this works.',
      price: 48,
      source: 'eBay',
      photo: 'stock/slazenger-golden-horseshoe-wind-shirt.jpg',
      collection: '',
      submitted_by: 'Example',
      status: 'new',
      decided_by: '',
      created_at: ago(1),
      decided_at: null,
      ...DRESS_DEFAULTS,
    },
    {
      id: 'example-2',
      url: 'https://www.ebay.com/sch/i.html?_nkw=vintage+sun+faded+golf+pullover',
      title: 'Sun-faded golf pullover, crest intact',
      note: 'Example with a photo — a card needs a picture and a name before it reaches the deck.',
      price: 45,
      source: 'eBay',
      photo: 'stock/sun-faded-golf-pullover.jpg',
      collection: '',
      submitted_by: 'Example',
      status: 'new',
      decided_by: '',
      created_at: ago(2),
      decided_at: null,
      ...DRESS_DEFAULTS,
    },
    {
      id: 'example-3',
      url: 'https://www.depop.com/search/?q=vintage%20izod%20lacoste%20cardigan',
      title: 'Izod Lacoste grandpa cardigan, 1980s',
      note: 'Example without a photo — it waits in the pile until it has one. Tap “Show it anyway” to deal it as-is.',
      price: 42,
      source: 'Depop',
      photo: '',
      collection: '',
      submitted_by: 'Example',
      status: 'new',
      decided_by: '',
      created_at: ago(2),
      decided_at: null,
      ...DRESS_DEFAULTS,
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Practice adapter — localStorage                                     */
/* ------------------------------------------------------------------ */

function lsRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (parsed && Array.isArray(parsed.finds)) {
      // pre-existing devices upgrade cleanly: every find gains the dressing
      // fields (JSON round-trips drop undefined, so ...f can't re-hole them)
      parsed.finds = parsed.finds.map((f) => ({ ...DRESS_DEFAULTS, ...f }));
      return parsed;
    }
  } catch {
    /* corrupt or unavailable — reseed */
  }
  return { name: '', unlocked: false, finds: SEED() };
}

function lsWrite(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* private browsing — the session still works in memory */
  }
}

let practiceState = null;
const practice = {
  async init() {
    practiceState = lsRead();
    // both the passphrase AND a name are needed to be "at the desk" — a
    // pre-passphrase state that stored a name is re-gated, keeping its finds
    const user =
      practiceState.unlocked && practiceState.name ? { name: practiceState.name } : null;
    return { mode: 'practice', user, locked: !practiceState.unlocked };
  },
  user: () =>
    practiceState?.unlocked && practiceState?.name
      ? { name: practiceState.name, email: '' }
      : null,
  async signIn(name, passphrase) {
    if (!practiceState.unlocked) {
      if (!(await verifyPassphrase(passphrase))) {
        throw new Error(
          'That’s not the desk passphrase. It’s handed around the founders — ask and you shall receive.'
        );
      }
      practiceState.unlocked = true;
    }
    const clean = String(name).trim().slice(0, 40);
    if (!clean) throw new Error('A name, so the team knows who found what.');
    practiceState.name = clean;
    lsWrite(practiceState);
    return { name: clean };
  },
  async signOut() {
    // the device stays trusted (unlocked survives); only the identity clears
    practiceState.name = '';
    lsWrite(practiceState);
  },
  async list() {
    return [...practiceState.finds].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async add(find) {
    const key = normalizeUrl(find.url);
    const dupe = practiceState.finds.find((f) => normalizeUrl(f.url) === key);
    if (dupe) return { ok: false, dupe };
    const entry = {
      ...find,
      // defaults AFTER ...find, so a caller cannot smuggle show_anyway: true
      // in through the drop form
      ...DRESS_DEFAULTS,
      id: `f-${Date.now().toString(36)}-${practiceState.finds.length}`,
      status: 'new',
      decided_by: '',
      created_at: new Date().toISOString(),
      decided_at: null,
    };
    practiceState.finds.unshift(entry);
    lsWrite(practiceState);
    return { ok: true, find: entry };
  },
  async setStatus(id, status, decidedBy) {
    const find = practiceState.finds.find((f) => f.id === id);
    if (!find) return null;
    find.status = status;
    find.decided_by = status === 'new' ? '' : decidedBy || '';
    find.decided_at = status === 'new' ? null : new Date().toISOString();
    lsWrite(practiceState);
    return find;
  },
  async showAnyway(id) {
    const find = practiceState.finds.find((f) => f.id === id);
    if (!find || find.show_anyway) return null;
    find.show_anyway = true;
    lsWrite(practiceState);
    return find;
  },
  async showAllAnyway(ids) {
    const set = new Set(ids);
    const hit = practiceState.finds.filter((f) => set.has(f.id) && !f.show_anyway);
    hit.forEach((f) => {
      f.show_anyway = true;
    });
    lsWrite(practiceState);
    return hit;
  },
};

/* ------------------------------------------------------------------ */
/* Live adapter — Supabase                                             */
/* ------------------------------------------------------------------ */

let supa = null;

const fromRow = (r) => ({
  id: r.id,
  url: r.url,
  title: r.title || '',
  note: r.note || '',
  price: r.price_seen ?? null,
  source: r.source || '',
  photo: r.photo_url || '',
  collection: r.suggested_collection || '',
  submitted_by: r.submitted_by || '',
  status: r.status,
  decided_by: r.decided_by || '',
  created_at: r.created_at,
  decided_at: r.decided_at,
  // dressing bookkeeping — coerced so a not-yet-migrated database reads as
  // "nothing forced, never tried" instead of undefined-driven branches
  show_anyway: r.show_anyway === true,
  dress_tries: r.dress_tries ?? 0,
  looked_at: r.looked_at ?? null,
});

const live = {
  async init() {
    // one client for the page's lifetime — each GoTrueClient registers global
    // listeners and an auto-refresh ticker that are never torn down, and
    // multiple instances race each other over the same stored token
    if (!supa) {
      const { createClient } = await import('@supabase/supabase-js');
      supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    const { data } = await supa.auth.getSession();
    const email = data.session?.user?.email;
    liveUser = email ? { name: nameFromEmail(email), email } : null;
    // live mode has real per-person auth; the practice passphrase plays no part
    return { mode: 'live', user: liveUser, locked: false };
  },
  user() {
    /* refreshed by init/signIn; synchronous read for render convenience */
    return liveUser;
  },
  async signIn(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error));
    liveUser = { name: nameFromEmail(data.user.email), email: data.user.email };
    return liveUser;
  },
  async signOut() {
    await supa.auth.signOut();
    liveUser = null;
  },
  async list() {
    const { data, error } = await supa
      .from(FINDS_TABLE)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Could not load the pile — ${error.message}`);
    return data.map(fromRow);
  },
  async add(find) {
    const row = {
      url: find.url,
      url_key: normalizeUrl(find.url),
      title: find.title || null,
      note: find.note || null,
      price_seen: find.price ?? null,
      source: find.source || null,
      photo_url: find.photo || null,
      suggested_collection: find.collection || null,
      submitted_by: find.submitted_by || null,
    };
    const { data, error } = await supa.from(FINDS_TABLE).insert(row).select().single();
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supa
          .from(FINDS_TABLE)
          .select('*')
          .eq('url_key', row.url_key)
          .maybeSingle();
        return { ok: false, dupe: existing ? fromRow(existing) : null };
      }
      throw new Error(`Could not save the find — ${error.message}`);
    }
    return { ok: true, find: fromRow(data) };
  },
  async setStatus(id, status, decidedBy) {
    const patch =
      status === 'new'
        ? { status, decided_by: null, decided_at: null }
        : { status, decided_by: decidedBy || null, decided_at: new Date().toISOString() };
    const { data, error } = await supa
      .from(FINDS_TABLE)
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Could not record the decision — ${error.message}`);
    return fromRow(data);
  },
  // compare-and-set, so a teammate who got there first silently wins;
  // maybeSingle() because zero matched rows is "already done", not an error
  async showAnyway(id) {
    const { data, error } = await supa
      .from(FINDS_TABLE)
      .update({ show_anyway: true })
      .eq('id', id)
      .eq('show_anyway', false)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Could not send it through — ${error.message}`);
    return data ? fromRow(data) : null;
  },
  async showAllAnyway(ids) {
    if (!ids.length) return [];
    const { data, error } = await supa
      .from(FINDS_TABLE)
      .update({ show_anyway: true })
      .in('id', ids)
      .eq('show_anyway', false)
      .select();
    if (error) throw new Error(`Could not send them through — ${error.message}`);
    return (data || []).map(fromRow);
  },
};

let liveUser = null;

function friendlyAuthError(error) {
  if (/invalid login credentials/i.test(error.message))
    return 'That email and password don’t match. Passwords were handed out by your Technical Officer — ask them to reset yours if it’s lost.';
  return error.message;
}

/* ------------------------------------------------------------------ */
/* Public API — the only thing pages import                            */
/* ------------------------------------------------------------------ */

const backend = () => (isLive() ? live : practice);

export const initCurate = () => backend().init();
export const curUser = () => backend().user();
export const signIn = (...args) => backend().signIn(...args);
export const signOut = () => backend().signOut();
export const listFinds = () => backend().list();
export const addFind = (find) => backend().add(find);
export const setStatus = (id, status, decidedBy) => backend().setStatus(id, status, decidedBy);
export const showAnyway = (id) => backend().showAnyway(id);
export const showAllAnyway = (ids) => backend().showAllAnyway(ids);

/** Tallies for the stat row. */
export function tally(finds) {
  const t = { new: 0, shortlist: 0, pass: 0, bought: 0 };
  for (const f of finds) if (t[f.status] !== undefined) t[f.status] += 1;
  return t;
}
