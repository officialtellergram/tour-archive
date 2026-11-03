/**
 * The mailing list. One call, shared by the footer form and the first-visit
 * offer: POST the address to the Worker, which stores it and starts the
 * welcome job (a one-use 10% code by email). See docs/MAILING-LIST.md.
 */
export const LIST_API = 'https://tour-archive-stripe-hook.officialtellergram.workers.dev/subscribe';

const looksLikeEmail = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);

/**
 * @param {string} email
 * @param {'footer'|'offer'} source  where on the site they joined
 * @param {string} [company]  the honeypot field; a bot fills it, a person never sees it
 * @returns {Promise<{ok: true, again: boolean} | {ok: false, error: 'email'|'network'|'server'|string}>}
 */
export async function joinList(email, source, company = '') {
  const e = String(email || '').trim();
  if (!looksLikeEmail(e)) return { ok: false, error: 'email' };
  try {
    const r = await fetch(LIST_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, source, page: location.pathname, company }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j.ok !== false ? { ok: true, again: Boolean(j.again) } : { ok: false, error: j.error || 'server' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
