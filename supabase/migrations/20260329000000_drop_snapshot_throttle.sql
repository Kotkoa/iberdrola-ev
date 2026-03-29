-- Remove dead dedup layer: snapshot_throttle table and related RPCs.
-- Throttling now uses station_snapshots.observed_at directly.
-- Consumers updated: poll-station, save-snapshot edge functions.

DROP FUNCTION IF EXISTS public.should_store_snapshot(integer, text, integer);
DROP FUNCTION IF EXISTS public.compute_snapshot_hash(text, numeric, numeric, text, numeric, numeric, text, boolean, text);
DROP TABLE IF EXISTS public.snapshot_throttle;
