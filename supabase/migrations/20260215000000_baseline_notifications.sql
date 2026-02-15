-- Baseline migration: document existing notification tables and functions
-- These objects already exist in production but were never captured in migrations.
-- Using IF NOT EXISTS / OR REPLACE to make this safe for both production and new branches.

-- ============================================
-- 1. subscriptions table
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  port_number INTEGER DEFAULT 1,
  target_status TEXT DEFAULT 'Available'
);

-- UNIQUE on endpoint: one browser = one subscription record
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_endpoint_unique'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_endpoint_unique UNIQUE (endpoint);
  END IF;
END $$;

-- Partial unique index: prevents duplicate active subscriptions per station/port/endpoint
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_unique_active
  ON public.subscriptions (station_id, port_number, endpoint) WHERE (is_active = true);

-- ============================================
-- 2. polling_tasks table
-- ============================================
CREATE TABLE IF NOT EXISTS public.polling_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID,
  cp_id INTEGER NOT NULL,
  cupr_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  target_port INTEGER,
  target_status TEXT NOT NULL DEFAULT 'Available',
  initial_status JSONB,
  poll_count INTEGER DEFAULT 0,
  max_polls INTEGER DEFAULT 72,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '12 hours')
);

CREATE INDEX IF NOT EXISTS idx_polling_tasks_active
  ON public.polling_tasks (status) WHERE (status = ANY (ARRAY['pending', 'running']));

CREATE INDEX IF NOT EXISTS idx_polling_tasks_subscription_id
  ON public.polling_tasks (subscription_id);

-- ============================================
-- 3. RPC functions used by Edge Functions
-- ============================================

-- can_poll_station: check if station can be polled (5-min cooldown)
CREATE OR REPLACE FUNCTION public.can_poll_station(p_cupr_id INTEGER)
RETURNS TABLE (can_poll BOOLEAN, last_observed TIMESTAMPTZ, seconds_until_next INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_observed TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '5 minutes';
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

-- get_station_with_snapshot: get station metadata + latest snapshot
CREATE OR REPLACE FUNCTION public.get_station_with_snapshot(
  p_cp_id INTEGER DEFAULT NULL,
  p_cupr_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  cp_id INTEGER, cupr_id INTEGER, name TEXT,
  latitude NUMERIC, longitude NUMERIC, address_full TEXT,
  port1_status TEXT, port2_status TEXT, overall_status TEXT,
  observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cp_id IS NULL AND p_cupr_id IS NULL THEN
    RAISE EXCEPTION 'Either cp_id or cupr_id must be provided';
  END IF;

  RETURN QUERY
  SELECT sm.cp_id, sm.cupr_id, sm.name, sm.latitude, sm.longitude, sm.address_full,
    ss.port1_status, ss.port2_status, ss.overall_status, ss.observed_at
  FROM station_metadata sm
  LEFT JOIN station_snapshots ss ON ss.cp_id = sm.cp_id
  WHERE (p_cp_id IS NOT NULL AND sm.cp_id = p_cp_id)
     OR (p_cupr_id IS NOT NULL AND sm.cupr_id = p_cupr_id)
  ORDER BY ss.observed_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

-- create_polling_task: create a polling task for a subscription
CREATE OR REPLACE FUNCTION public.create_polling_task(
  p_subscription_id UUID,
  p_target_port INTEGER DEFAULT NULL,
  p_target_status TEXT DEFAULT 'Available'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_snapshot RECORD;
  v_task_id UUID;
BEGIN
  SELECT s.id, sm.cp_id, sm.cupr_id
  INTO v_sub
  FROM subscriptions s
  JOIN station_metadata sm ON sm.cp_id::TEXT = s.station_id
  WHERE s.id = p_subscription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  SELECT port1_status, port2_status, overall_status, observed_at
  INTO v_snapshot
  FROM station_snapshots WHERE cp_id = v_sub.cp_id
  ORDER BY observed_at DESC LIMIT 1;

  INSERT INTO polling_tasks (
    subscription_id, cp_id, cupr_id, target_port, target_status,
    initial_status, max_polls, expires_at
  )
  VALUES (
    p_subscription_id, v_sub.cp_id, v_sub.cupr_id, p_target_port, p_target_status,
    jsonb_build_object('port1_status', v_snapshot.port1_status, 'port2_status', v_snapshot.port2_status),
    72,  -- 72 polls x 10 min = 12 hours
    now() + interval '12 hours'
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

-- ============================================
-- 4. Trigger function: notify_subscribers_on_port_available
-- ============================================
-- This function fires on station_snapshots UPDATE when port status changes.
-- It uses pg_net to call send-push-notification Edge Function.
-- NOTE: Trigger is AFTER UPDATE only, NOT AFTER INSERT.
-- The scraper does INSERT, so this trigger does NOT fire on scraper data.
CREATE OR REPLACE FUNCTION public.notify_subscribers_on_port_available()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_role_key TEXT;
BEGIN
  -- Get the key from vault using existing secret name
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'edge_trigger_secret'
  LIMIT 1;

  IF service_role_key IS NULL THEN
    RAISE WARNING 'edge_trigger_secret not found in vault, skipping push notification';
    RETURN NEW;
  END IF;

  -- Port 1: OCCUPIED -> AVAILABLE (case insensitive)
  IF (UPPER(OLD.port1_status) = 'OCCUPIED' AND UPPER(NEW.port1_status) = 'AVAILABLE') THEN
    PERFORM net.http_post(
      url := 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'stationId', NEW.cp_id::text,
        'portNumber', 1
      )
    );
  END IF;

  -- Port 2: OCCUPIED -> AVAILABLE (case insensitive)
  IF (UPPER(OLD.port2_status) = 'OCCUPIED' AND UPPER(NEW.port2_status) = 'AVAILABLE') THEN
    PERFORM net.http_post(
      url := 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'stationId', NEW.cp_id::text,
        'portNumber', 2
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Trigger definition (AFTER UPDATE only)
-- WHEN clause: only fire when port status actually changes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_port_available'
  ) THEN
    CREATE TRIGGER trigger_port_available
      AFTER UPDATE ON public.station_snapshots
      FOR EACH ROW
      WHEN (
        (OLD.port1_status IS DISTINCT FROM NEW.port1_status) OR
        (OLD.port2_status IS DISTINCT FROM NEW.port2_status)
      )
      EXECUTE FUNCTION notify_subscribers_on_port_available();
  END IF;
END $$;
