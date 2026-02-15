-- Fix claim_verification_batch: FOR UPDATE cannot lock nullable side of outer joins.
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
    where q.status = 'pending'
      and q.next_attempt_at <= now()
      and coalesce(
        (
          select m.verification_state
          from public.station_metadata m
          where m.cp_id = q.cp_id
        ),
        'unprocessed'
      ) in ('unprocessed', 'failed')
    order by q.next_attempt_at asc, q.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 1), 5))
    for update of q skip locked
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

grant execute on function public.claim_verification_batch(integer) to service_role;
