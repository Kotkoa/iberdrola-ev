-- Reduce can_poll_station cooldown from 5 min to 2 min
-- Allows subscription-checker (cron */3) to poll on every run

DROP FUNCTION IF EXISTS public.can_poll_station(INTEGER);

CREATE OR REPLACE FUNCTION public.can_poll_station(p_cupr_id INTEGER)
RETURNS TABLE (can_poll BOOLEAN, last_observed TIMESTAMPTZ, seconds_until_next INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_observed TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '2 minutes';
BEGIN
  SELECT ss.observed_at INTO v_last_observed
  FROM station_snapshots ss
  JOIN station_metadata sm ON ss.cp_id = sm.cp_id
  WHERE sm.cupr_id = p_cupr_id
  ORDER BY ss.observed_at DESC
  LIMIT 1;

  IF v_last_observed IS NULL OR v_last_observed + v_min_interval <= now() THEN
    RETURN QUERY SELECT TRUE, v_last_observed, 0;
  ELSE
    RETURN QUERY SELECT FALSE, v_last_observed,
      EXTRACT(EPOCH FROM (v_last_observed + v_min_interval - now()))::INTEGER;
  END IF;
END;
$$;
