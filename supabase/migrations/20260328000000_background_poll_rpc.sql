-- Background poll RPC for subscription checker
-- Returns stations with active subscriptions that have no active polling tasks.
-- Used by subscription-checker to keep snapshot data fresh for the frontend timer.

CREATE OR REPLACE FUNCTION public.get_subscribed_stations_for_background_poll(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (cp_id INTEGER, cupr_id INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT m.cp_id, m.cupr_id
  FROM subscriptions s
  JOIN station_metadata m ON m.cp_id = s.station_id::INTEGER
  WHERE s.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM polling_tasks pt
      WHERE pt.cp_id = m.cp_id
        AND pt.status IN ('pending', 'running')
    )
  ORDER BY m.cp_id
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscribed_stations_for_background_poll(INTEGER)
  TO service_role;
