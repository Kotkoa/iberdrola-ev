-- MVP: explicit verification lifecycle for free/paid stations.
-- Source of truth for "FREE list" becomes station_metadata.verification_state='verified_free'.

-- 1) Extend station_metadata with explicit verification state.
alter table public.station_metadata
  add column if not exists verification_state text not null default 'unprocessed',
  add column if not exists price_verified_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'station_metadata_verification_state_check'
      and conrelid = 'public.station_metadata'::regclass
  ) then
    alter table public.station_metadata
      add constraint station_metadata_verification_state_check
      check (
        verification_state in (
          'unprocessed',
          'verified_free',
          'verified_paid',
          'failed',
          'dead_letter'
        )
      );
  end if;
end $$;

create index if not exists idx_station_metadata_verification_state
  on public.station_metadata (verification_state);

-- Bootstrap existing rows so rollout does not hide all stations.
update public.station_metadata
set
  verification_state = case
    when coalesce(price_verified, false) = true and coalesce(is_free, false) = true
      then 'verified_free'
    when coalesce(price_verified, false) = true and coalesce(is_free, false) = false
      then 'verified_paid'
    else 'unprocessed'
  end,
  price_verified_at = case
    when coalesce(price_verified, false) = true
      then coalesce(price_verified_at, updated_at, now())
    else price_verified_at
  end
where verification_state = 'unprocessed';

-- 2) Queue for stations pending verification.
create table if not exists public.station_verification_queue (
  cp_id integer primary key,
  cupr_id integer not null,
  status text not null default 'pending' check (status in ('pending', 'processing')),
  attempt_count integer not null default 0,
  next_attempt_at timestamp with time zone not null default now(),
  locked_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_station_verification_queue_status_next_attempt
  on public.station_verification_queue (status, next_attempt_at);

create index if not exists idx_station_verification_queue_cupr_id
  on public.station_verification_queue (cupr_id);

-- 3) Security for queue table (service-role only).
alter table public.station_verification_queue enable row level security;

drop policy if exists allow_service_all on public.station_verification_queue;
create policy allow_service_all
on public.station_verification_queue
for all
to service_role
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

revoke all on table public.station_verification_queue from anon, authenticated;

-- 4) Helper: backoff schedule in seconds for attempts 1..N.
create or replace function public.verification_backoff_seconds(p_attempt integer)
returns integer
language sql
immutable
as $$
  select case greatest(1, coalesce(p_attempt, 1))
    when 1 then 120   -- 2m
    when 2 then 300   -- 5m
    when 3 then 900   -- 15m
    when 4 then 1800  -- 30m
    else 3600         -- 60m
  end;
$$;

-- 5) Helper: batch enqueue candidates (dedup by cp_id, no enqueue for already verified).
create or replace function public.enqueue_verification_candidates(p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enqueued integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  with normalized as (
    select distinct cp_id, cupr_id
    from jsonb_to_recordset(p_items) as x(cp_id integer, cupr_id integer)
    where cp_id is not null and cupr_id is not null
  ),
  eligible as (
    select n.cp_id, n.cupr_id
    from normalized n
    left join public.station_metadata m on m.cp_id = n.cp_id
    where coalesce(m.verification_state, 'unprocessed')
      not in ('verified_free', 'verified_paid', 'dead_letter')
  ),
  upserted as (
    insert into public.station_verification_queue (
      cp_id,
      cupr_id,
      status,
      next_attempt_at,
      created_at,
      updated_at
    )
    select
      e.cp_id,
      e.cupr_id,
      'pending',
      now(),
      now(),
      now()
    from eligible e
    on conflict (cp_id) do update
      set cupr_id = excluded.cupr_id,
          status = case
            when station_verification_queue.status = 'processing' then station_verification_queue.status
            else 'pending'
          end,
          next_attempt_at = case
            when station_verification_queue.status = 'processing'
              then station_verification_queue.next_attempt_at
            else now()
          end,
          locked_at = case
            when station_verification_queue.status = 'processing'
              then station_verification_queue.locked_at
            else null
          end,
          last_error = case
            when station_verification_queue.status = 'processing'
              then station_verification_queue.last_error
            else null
          end,
          updated_at = now()
    where station_verification_queue.status <> 'processing'
    returning 1
  )
  select count(*) into v_enqueued from upserted;

  return v_enqueued;
end;
$$;

-- 6) Helper: claim batch for processing.
create or replace function public.claim_verification_batch(p_limit integer default 1)
returns table (
  cp_id integer,
  cupr_id integer,
  attempt_count integer,
  locked_at timestamp with time zone
)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select q.cp_id
    from public.station_verification_queue q
    left join public.station_metadata m on m.cp_id = q.cp_id
    where q.status = 'pending'
      and q.next_attempt_at <= now()
      and coalesce(m.verification_state, 'unprocessed') in ('unprocessed', 'failed')
    order by q.next_attempt_at asc, q.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 1), 5))
    for update skip locked
  ),
  updated as (
    update public.station_verification_queue q
    set status = 'processing',
        locked_at = now(),
        updated_at = now()
    from picked p
    where q.cp_id = p.cp_id
    returning q.cp_id, q.cupr_id, q.attempt_count, q.locked_at
  )
  select * from updated;
$$;

-- 7) Helper: return stuck processing tasks back to pending.
create or replace function public.mark_processing_timeout(p_timeout_minutes integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with updated as (
    update public.station_verification_queue q
    set status = 'pending',
        locked_at = null,
        next_attempt_at = now() + interval '2 minutes',
        last_error = coalesce(q.last_error, 'processing timeout'),
        updated_at = now()
    where q.status = 'processing'
      and q.locked_at < now() - make_interval(mins => greatest(1, coalesce(p_timeout_minutes, 20)))
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- 8) Helper: reconcile processing queue with metadata updates written by existing scraper.
create or replace function public.reconcile_verification_queue(
  p_max_retries integer default 5,
  p_timeout_minutes integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resolved integer := 0;
  v_retried integer := 0;
  v_dead integer := 0;
begin
  -- Success path: scraper updated metadata with verified price after lock time.
  with success_candidates as (
    select q.cp_id
    from public.station_verification_queue q
    join public.station_metadata m on m.cp_id = q.cp_id
    where q.status = 'processing'
      and m.price_verified = true
      and (q.locked_at is null or coalesce(m.updated_at, now()) >= q.locked_at)
  ),
  updated_meta as (
    update public.station_metadata m
    set verification_state = case
          when m.is_free = true then 'verified_free'
          else 'verified_paid'
        end,
        price_verified_at = coalesce(m.price_verified_at, now())
    where m.cp_id in (select cp_id from success_candidates)
    returning m.cp_id
  ),
  deleted_queue as (
    delete from public.station_verification_queue q
    using updated_meta u
    where q.cp_id = u.cp_id
    returning q.cp_id
  )
  select count(*) into v_resolved from deleted_queue;

  -- Retry path for timed out processing rows.
  with timed_out as (
    select q.cp_id, q.attempt_count + 1 as next_attempt
    from public.station_verification_queue q
    where q.status = 'processing'
      and q.locked_at < now() - make_interval(mins => greatest(1, coalesce(p_timeout_minutes, 20)))
  ),
  retried as (
    update public.station_verification_queue q
    set status = 'pending',
        attempt_count = t.next_attempt,
        next_attempt_at = now() + make_interval(secs => public.verification_backoff_seconds(t.next_attempt)),
        locked_at = null,
        last_error = 'reconcile timeout',
        updated_at = now()
    from timed_out t
    where q.cp_id = t.cp_id
      and t.next_attempt < greatest(1, coalesce(p_max_retries, 5))
    returning q.cp_id
  )
  select count(*) into v_retried from retried;

  with timed_out as (
    select q.cp_id, q.attempt_count + 1 as next_attempt
    from public.station_verification_queue q
    where q.status = 'processing'
      and q.locked_at < now() - make_interval(mins => greatest(1, coalesce(p_timeout_minutes, 20)))
  ),
  dead_meta as (
    update public.station_metadata m
    set verification_state = 'dead_letter'
    where m.cp_id in (
      select t.cp_id
      from timed_out t
      where t.next_attempt >= greatest(1, coalesce(p_max_retries, 5))
    )
      and coalesce(m.verification_state, 'unprocessed') not in ('verified_free', 'verified_paid')
    returning m.cp_id
  ),
  dead_queue as (
    delete from public.station_verification_queue q
    where q.cp_id in (select cp_id from dead_meta)
    returning q.cp_id
  )
  select count(*) into v_dead from dead_queue;

  return jsonb_build_object(
    'resolved', v_resolved,
    'retried', v_retried,
    'dead_letter', v_dead
  );
end;
$$;

grant execute on function public.verification_backoff_seconds(integer) to service_role;
grant execute on function public.enqueue_verification_candidates(jsonb) to service_role;
grant execute on function public.claim_verification_batch(integer) to service_role;
grant execute on function public.mark_processing_timeout(integer) to service_role;
grant execute on function public.reconcile_verification_queue(integer, integer) to service_role;
