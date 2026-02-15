-- Optimize RLS policy predicates to avoid per-row auth.role() evaluation

alter policy allow_service_read
on public.polling_tasks
using ((select auth.role()) = 'service_role');

alter policy allow_service_insert
on public.polling_tasks
with check ((select auth.role()) = 'service_role');

alter policy allow_service_update
on public.polling_tasks
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy allow_service_delete
on public.polling_tasks
using ((select auth.role()) = 'service_role');

alter policy allow_service_upsert
on public.station_metadata
with check ((select auth.role()) = 'service_role');

alter policy allow_service_update
on public.station_metadata
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

alter policy allow_service_all
on public.geo_search_throttle
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');
