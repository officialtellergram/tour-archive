-- Site error log — run once in the Supabase SQL editor.
-- (Dashboard → SQL Editor → New query → paste this whole file → Run.)
--
-- One append-only table that the site's own beacon (src/lib/errors.js)
-- writes to when a page breaks in a visitor's browser. Access model: the
-- public anon key may INSERT and nothing else — it cannot read the table
-- back, change a row, or delete one. The owner reads it in the dashboard
-- (Table editor → site_errors), which uses the service role and so bypasses
-- RLS. Nothing in a row identifies a person: no cookie, no visitor id, no
-- email, no IP. The privacy page (/privacy) describes exactly these columns,
-- so a column added here must be added there too.
--
-- The beacon is dormant until ERRORS_ENABLED in src/curate/config.js is
-- true. Run this first, then flip the flag: docs/OPERATIONS.md § Error
-- tracking.

create table if not exists public.site_errors (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  path text,                             -- page path only; query and hash stripped client-side
  message text,
  source text,                           -- script URL the error came from, if the browser knew
  line int,
  col int,
  stack text,
  ua text,                               -- user-agent string, for "which browser breaks"
  ref text,                              -- referrer path only, same stripping
  -- Belt and braces on length: the client truncates to these same limits
  -- (LIMITS in src/lib/errors.js), the table refuses anything longer.
  constraint site_errors_message_len check (message is null or char_length(message) <= 2000),
  constraint site_errors_stack_len   check (stack   is null or char_length(stack)   <= 2000),
  constraint site_errors_path_len    check (path    is null or char_length(path)    <= 512),
  constraint site_errors_source_len  check (source  is null or char_length(source)  <= 512),
  constraint site_errors_ua_len      check (ua      is null or char_length(ua)      <= 512),
  constraint site_errors_ref_len     check (ref     is null or char_length(ref)     <= 512)
);

comment on table public.site_errors is
  'Browser errors reported by the site''s first-party beacon (src/lib/errors.js). '
  'Retention intent: keep 30 days. Nothing prunes automatically — the owner deletes '
  'rows older than 30 days by hand in the SQL editor '
  '(delete from public.site_errors where at < now() - interval ''30 days'';) '
  'or schedules that same statement with pg_cron. Anon may only insert; never grant it select.';

-- Newest first is the only way anyone reads this; the prune query walks the
-- same index from the other end.
create index if not exists site_errors_at_idx on public.site_errors (at desc);

-- Explicit grants rather than Supabase's default privileges. Insert only for
-- anon — the beacon sends `Prefer: return=minimal`, which is what lets an
-- insert succeed without select privilege on the table.
revoke all on public.site_errors from anon;
grant insert on public.site_errors to anon;

alter table public.site_errors enable row level security;

drop policy if exists "beacon insert" on public.site_errors;
create policy "beacon insert" on public.site_errors
  for insert to anon with check (true);

-- No select, update or delete policy exists for anon on purpose. With RLS on
-- and no policy, those verbs return nothing / do nothing even if a grant
-- were ever added by accident.

-- Optional: automatic 30-day prune. pg_cron is available on Supabase
-- (Database → Extensions → enable pg_cron), after which this schedules the
-- delete nightly at 04:10 UTC. Left commented so the file runs clean on a
-- project without the extension.
--
-- select cron.schedule(
--   'site_errors_prune',
--   '10 4 * * *',
--   $$delete from public.site_errors where at < now() - interval '30 days'$$
-- );
