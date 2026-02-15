-- Cutover: disable trigger-based notifications in favor of polling engine.
-- The trigger function is preserved for emergency rollback:
--   ALTER TABLE station_snapshots ENABLE TRIGGER trigger_port_available;

ALTER TABLE public.station_snapshots DISABLE TRIGGER trigger_port_available;
