-- Curation Desk schema — run once in the Supabase SQL editor.
-- (Dashboard → SQL Editor → New query → paste this whole file → Run.)
--
-- One shared table for the whole team. Access model: any signed-in teammate
-- can do anything (accounts are invite-only, created by the Technical Officer
-- in Authentication → Users, so "authenticated" == "cofounder"). The anon key
-- alone gets nothing.

create table if not exists public.curation_finds (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  url_key text not null unique,          -- normalized dedupe key, computed client-side
  title text,
  note text,
  price_seen numeric,
  source text,                           -- eBay / Depop / Etsy / … inferred from hostname
  photo_url text,                        -- optional picture link pasted by the finder
  suggested_collection text,             -- collection id from the site, optional
  submitted_by text,                     -- display name of the finder
  status text not null default 'new'
    check (status in ('new', 'shortlist', 'pass', 'bought')),
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- `create table if not exists` silently skips column additions on re-run, so
-- late-added columns also get an explicit idempotent alter:
alter table public.curation_finds add column if not exists photo_url text;

-- Dressing state (added 4 Aug 2026). A find is DRESSED when it has a picture
-- and a name; only dressed finds are dealt at the review meeting. These
-- columns never gate anything on their own — readiness is derived from
-- content in src/curate/data.js. They drive the robot's retry policy and
-- record a human override.
--   show_anyway  — written by the DESK only: a person chose to deal it bare.
--                  The robot never reads or writes it.
--   dress_tries  — written by the ROBOT only: page-reads spent on this find.
--   looked_at    — written by the ROBOT only: the last time it CONSIDERED the
--                  find (not "last attempt" — dressed rows get stamped too, so
--                  they sink to the back of the robot's queue and stay there).
alter table public.curation_finds add column if not exists show_anyway boolean not null default false;
alter table public.curation_finds add column if not exists dress_tries integer not null default 0;
alter table public.curation_finds add column if not exists looked_at   timestamptz;

-- Blank is not a value. The site maps '' to null; this normalises anything
-- typed by hand in the table editor so "is it dressed" has one answer.
update public.curation_finds set photo_url = null where photo_url is not null and btrim(photo_url) = '';
update public.curation_finds set title     = null where title     is not null and btrim(title)     = '';

-- The robot's queue: never-considered first, then least recently considered.
create index if not exists curation_finds_robot_queue_idx
  on public.curation_finds (looked_at nulls first, created_at)
  where status <> 'pass';

create index if not exists curation_finds_status_idx
  on public.curation_finds (status, created_at desc);

-- Explicit grants rather than relying on Supabase's default privileges.
-- anon gets bare select so the daily CI keepalive query executes; RLS below
-- still returns it zero rows.
grant select, insert, update, delete on public.curation_finds to authenticated;
grant select on public.curation_finds to anon;

alter table public.curation_finds enable row level security;

drop policy if exists "team select" on public.curation_finds;
create policy "team select" on public.curation_finds
  for select to authenticated using (true);

drop policy if exists "team insert" on public.curation_finds;
create policy "team insert" on public.curation_finds
  for insert to authenticated with check (true);

drop policy if exists "team update" on public.curation_finds;
create policy "team update" on public.curation_finds
  for update to authenticated using (true) with check (true);

drop policy if exists "team delete" on public.curation_finds;
create policy "team delete" on public.curation_finds
  for delete to authenticated using (true);
