-- Fix: maxPower decimal values (2.3, 7.4, 12.5 etc.) crash search_stations_nearby
-- 893 stations have fractional maxPower in port1_socket_details JSON
-- Change: ::integer -> ::numeric::integer (parse as numeric first, then truncate)

CREATE OR REPLACE FUNCTION public.search_stations_nearby(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 10,
  p_only_free boolean DEFAULT false
)
RETURNS TABLE(
  cp_id integer,
  cupr_id integer,
  name text,
  lat double precision,
  lon double precision,
  address text,
  socket_type text,
  max_power integer,
  price_kwh numeric,
  total_ports integer,
  free boolean,
  distance_km double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH latest_prices AS (
    SELECT DISTINCT ON (ss.cp_id)
      ss.cp_id,
      ss.port1_price_kwh,
      ss.port2_price_kwh
    FROM station_snapshots ss
    ORDER BY ss.cp_id, ss.observed_at DESC
  ),
  stations_with_distance AS (
    SELECT
      m.cp_id,
      m.cupr_id,
      COALESCE(m.address_street || ' ' || COALESCE(m.address_number, ''), m.address_full) as station_name,
      m.latitude::float as lat,
      m.longitude::float as lon,
      m.address_full as address,
      m.port1_socket_details->>'socketName' as socket_type,
      (m.port1_socket_details->>'maxPower')::numeric::integer as max_power,
      COALESCE(lp.port1_price_kwh, 0) as price_kwh,
      2 as total_ports,
      (COALESCE(lp.port1_price_kwh, 0) = 0 AND COALESCE(lp.port2_price_kwh, 0) = 0) as is_free,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_lat)) * cos(radians(m.latitude::float)) *
            cos(radians(m.longitude::float) - radians(p_lon)) +
            sin(radians(p_lat)) * sin(radians(m.latitude::float))
          ))
        )
      ) as distance_km
    FROM station_metadata m
    LEFT JOIN latest_prices lp ON m.cp_id = lp.cp_id
    WHERE m.latitude IS NOT NULL
      AND m.longitude IS NOT NULL
  )
  SELECT
    s.cp_id,
    s.cupr_id,
    s.station_name as name,
    s.lat,
    s.lon,
    s.address,
    s.socket_type,
    s.max_power,
    s.price_kwh,
    s.total_ports,
    s.is_free as free,
    ROUND(s.distance_km::numeric, 2)::float as distance_km
  FROM stations_with_distance s
  WHERE s.distance_km <= p_radius_km
    AND (NOT p_only_free OR s.is_free = true)
  ORDER BY s.distance_km;
END;
$function$;
