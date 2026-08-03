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
