-- Scraper health check function for external monitoring.
-- Returns freshness status of the latest snapshot for a given station.
-- Can be called via Supabase REST API by monitoring tools (e.g., UptimeRobot).
--
-- Usage: SELECT * FROM check_scraper_health(144569);
-- Usage: SELECT * FROM check_scraper_health(144569, 30);  -- 30 min threshold

CREATE OR REPLACE FUNCTION public.check_scraper_health(
  p_cp_id INTEGER,
  p_max_age_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
  last_observed_at TIMESTAMPTZ,
  age_minutes NUMERIC,
  is_healthy BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    max(ss.observed_at),
    EXTRACT(EPOCH FROM (now() - max(ss.observed_at))) / 60.0,
    COALESCE(max(ss.observed_at) > now() - (p_max_age_minutes * interval '1 minute'), false)
  FROM station_snapshots ss
  WHERE ss.cp_id = p_cp_id;
END;
$$;
