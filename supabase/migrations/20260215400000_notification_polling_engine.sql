-- Polling engine for confirmed push notifications
-- Replaces trigger-based approach with consecutive-confirmation polling.
-- Tasks are processed by a cron-triggered Edge Function every 5 minutes.

-- ============================================
-- 1. Extend polling_tasks with tracking columns
-- ============================================

ALTER TABLE public.polling_tasks
  ADD COLUMN IF NOT EXISTS consecutive_available INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_port_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_status TEXT;

-- ============================================
-- 2. process_polling_tasks RPC
-- ============================================
-- Called by process-polling Edge Function every 5 minutes.
-- Returns tasks ready for notification dispatch (consecutive_available >= 2).
-- p_dry_run=true: read-only check; p_dry_run=false: marks tasks as 'dispatching'.

CREATE OR REPLACE FUNCTION public.process_polling_tasks(p_dry_run BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_snapshot RECORD;
  v_port_status TEXT;
  v_port_update_date TIMESTAMPTZ;
  v_available_port INTEGER;
  v_is_new_observation BOOLEAN;
  v_new_consecutive INTEGER;
  v_ready_tasks JSONB := '[]'::JSONB;
  v_processed INTEGER := 0;
  v_expired INTEGER := 0;
BEGIN
  -- 1. Expire old tasks (past deadline or max polls reached)
  UPDATE polling_tasks
  SET status = 'expired'
  WHERE status IN ('pending', 'running')
    AND (expires_at < now() OR poll_count >= max_polls);

  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- 2. Process each active task
  FOR v_task IN
    SELECT pt.*, s.station_id
    FROM polling_tasks pt
    JOIN subscriptions s ON s.id = pt.subscription_id
    WHERE pt.status IN ('pending', 'running')
      AND s.is_active = true
    ORDER BY pt.created_at
  LOOP
    -- Get latest snapshot for this station
    SELECT port1_status, port2_status,
           port1_update_date, port2_update_date,
           observed_at
    INTO v_snapshot
    FROM station_snapshots
    WHERE cp_id = v_task.cp_id
    ORDER BY observed_at DESC
    LIMIT 1;

    IF v_snapshot IS NULL THEN
      CONTINUE;
    END IF;

    -- Determine which port to check based on target_port
    v_available_port := v_task.target_port;

    IF v_task.target_port = 1 THEN
      v_port_status := v_snapshot.port1_status;
      v_port_update_date := v_snapshot.port1_update_date;
    ELSIF v_task.target_port = 2 THEN
      v_port_status := v_snapshot.port2_status;
      v_port_update_date := v_snapshot.port2_update_date;
    ELSE
      -- Any port: check both, prefer the one matching target_status
      IF UPPER(v_snapshot.port1_status) = UPPER(v_task.target_status) THEN
        v_port_status := v_snapshot.port1_status;
        v_port_update_date := v_snapshot.port1_update_date;
        v_available_port := 1;
      ELSIF UPPER(v_snapshot.port2_status) = UPPER(v_task.target_status) THEN
        v_port_status := v_snapshot.port2_status;
        v_port_update_date := v_snapshot.port2_update_date;
        v_available_port := 2;
      ELSE
        v_port_status := v_snapshot.port1_status;
        v_port_update_date := v_snapshot.port1_update_date;
        v_available_port := 1;
      END IF;
    END IF;

    -- Check if this is a genuinely new observation from Iberdrola API
    v_is_new_observation := (
      v_port_update_date IS NOT NULL
      AND (
        v_task.last_seen_port_update_at IS NULL
        OR v_port_update_date > v_task.last_seen_port_update_at
      )
    );

    IF v_is_new_observation AND UPPER(v_port_status) = UPPER(v_task.target_status) THEN
      v_new_consecutive := v_task.consecutive_available + 1;
    ELSIF v_is_new_observation THEN
      -- New observation but status doesn't match target → reset
      v_new_consecutive := 0;
    ELSE
      -- No new observation → keep current count
      v_new_consecutive := v_task.consecutive_available;
    END IF;

    -- Update task
    UPDATE polling_tasks SET
      consecutive_available = v_new_consecutive,
      last_checked_at = now(),
      last_seen_port_update_at = COALESCE(
        CASE WHEN v_is_new_observation THEN v_port_update_date END,
        last_seen_port_update_at
      ),
      last_seen_status = COALESCE(
        CASE WHEN v_is_new_observation THEN v_port_status END,
        last_seen_status
      ),
      poll_count = poll_count + 1,
      status = 'running'
    WHERE id = v_task.id;

    v_processed := v_processed + 1;

    -- Check if ready for dispatch (confirmed Available across 2+ observations)
    IF v_new_consecutive >= 2 THEN
      IF NOT p_dry_run THEN
        UPDATE polling_tasks SET status = 'dispatching' WHERE id = v_task.id;
      END IF;
      v_ready_tasks := v_ready_tasks || jsonb_build_object(
        'task_id', v_task.id,
        'subscription_id', v_task.subscription_id,
        'station_id', v_task.station_id,
        'cp_id', v_task.cp_id,
        'target_port', v_available_port,
        'consecutive_available', v_new_consecutive
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'expired', v_expired,
    'ready', v_ready_tasks,
    'dry_run', p_dry_run
  );
END;
$$;
