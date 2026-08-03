/**
 * Curation Desk configuration.
 *
 * Leave both values empty and the desk runs in PRACTICE MODE — everything
 * works, but finds save to the device they were added on. Paste the two
 * values from the Supabase dashboard (Settings → API) and it becomes the
 * shared room for the whole team. Setup checklist: ACTIONS.md § Curation Desk.
 *
 * The anon key is designed to be public — it ships in every Supabase-backed
 * frontend on the internet. Row-level security plus invite-only login is what
 * actually guards the table, so committing these here is correct, not a leak.
 * (The service_role key is the secret one; it must never appear in this repo.)
 */

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

/** Table name in Supabase — matches supabase/curation.sql. */
export const FINDS_TABLE = 'curation_finds';

/**
 * Practice-mode desk passphrase — SHA-256 of the phrase, never the phrase
 * itself. One passphrase for the whole team, asked once per device; input is
 * trimmed and lowercased before hashing so phone keyboards can't fumble it.
 *
 * To rotate: `node scripts/desk-pass.mjs "the new phrase"` prints the hash —
 * paste it here and push. (This is a velvet rope on a static site, not a
 * vault: it keeps passers-by out of the desk UI. Real per-person auth arrives
 * with live mode, which ignores this entirely.)
 */
export const DESK_PASSPHRASE_HASH =
  '2bd0e79a9c408ef7ebca59d68ba5763057bbb7815498cf76f2535098f131f50c';
