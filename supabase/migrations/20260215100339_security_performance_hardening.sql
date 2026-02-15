-- Security + performance hardening
-- Order matters:
-- 1) pin function search_path
-- 2) fix RLS/policies
-- 3) tighten grants
-- 4) keep required RPC execute grants
-- 5) apply index cleanup and FK index
-- 6) remove unused http extension

-- 1) Pin search_path to public (compatible hardening)
alter function public.cleanup_old_snapshots()
  set search_path = public;

alter function public.compute_snapshot_hash(
  text,
  numeric,
  numeric,
  text,
  numeric,
  numeric,
  text,
  boolean,
  text
)
  set search_path = public;

alter function public.get_edge_trigger_secret()
  set search_path = public;

alter function public.notify_subscribers_on_port_available()
  set search_path = public;

alter function public.search_stations_nearby(
  double precision,
  double precision,
  double precision,
  boolean
)
  set search_path = public;

alter function public.should_store_snapshot(
  integer,
  text,
  integer
)
  set search_path = public;

-- 2) RLS + policy hardening
alter table public.geo_search_throttle enable row level security;

drop policy if exists allow_service_delete on public.polling_tasks;
drop policy if exists allow_service_insert on public.polling_tasks;
drop policy if exists allow_service_read on public.polling_tasks;
drop policy if exists allow_service_update on public.polling_tasks;

create policy allow_service_read
on public.polling_tasks
for select
to service_role
using (auth.role() = 'service_role');

create policy allow_service_insert
on public.polling_tasks
for insert
to service_role
with check (auth.role() = 'service_role');

create policy allow_service_update
on public.polling_tasks
for update
to service_role
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy allow_service_delete
on public.polling_tasks
for delete
to service_role
using (auth.role() = 'service_role');

drop policy if exists allow_service_update on public.station_metadata;
drop policy if exists allow_service_upsert on public.station_metadata;

create policy allow_service_upsert
on public.station_metadata
for insert
to service_role
with check (auth.role() = 'service_role');

create policy allow_service_update
on public.station_metadata
for update
to service_role
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists allow_service_all on public.geo_search_throttle;

create policy allow_service_all
on public.geo_search_throttle
for all
to service_role
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- 3) Revoke overly broad table grants, then re-grant required read access
revoke all on table public.polling_tasks from anon, authenticated;
revoke all on table public.geo_search_throttle from anon, authenticated;
revoke all on table public.station_metadata from anon, authenticated;
grant select on table public.station_metadata to anon, authenticated;

-- 4) Preserve API compatibility for nearby search RPC
grant execute on function public.search_stations_nearby(
  double precision,
  double precision,
  double precision,
  boolean
) to anon, authenticated;

-- 5) Performance fixes (1 warn + 4 info)
create index if not exists idx_polling_tasks_subscription_id
  on public.polling_tasks (subscription_id);

drop index if exists public.idx_metadata_geo;
drop index if exists public.idx_polling_tasks_cupr_id;
drop index if exists public.idx_metadata_unverified;
drop index if exists public.idx_geo_search_throttle_last_search;

-- 6) Remove unused extension from public API surface
drop extension if exists http;
