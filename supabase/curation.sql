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
  suggested_collection text,             -- collection id from the site, optional
  submitted_by text,                     -- display name of the finder
  status text not null default 'new'
    check (status in ('new', 'shortlist', 'pass', 'bought')),
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

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
