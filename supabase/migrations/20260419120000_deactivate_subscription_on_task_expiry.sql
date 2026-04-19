-- Synchronize subscriptions.is_active with polling_tasks lifecycle.
--
-- Invariant being enforced: an active subscription (is_active=true) must always
-- have at least one live polling_task in ('pending', 'running', 'dispatching').
-- Otherwise the user is shown as "subscribed" in the UI while the system has
-- stopped watching the port — the alert would never fire.
--
-- Two changes vs. the previous version of process_polling_tasks:
--   Step 1: also expire tasks whose parent subscription is already inactive
--           (orphans from start-watch's "deactivate other stations" path).
--   Step 2: deactivate any subscription that no longer has a live task.
--
-- The function body below is taken from the live database
-- (pg_get_functiondef('public.process_polling_tasks(boolean)'::regprocedure))
-- to preserve undocumented production drift (dispatch threshold = 1, not 2 as
-- in the original 20260215400000 migration). Restoring from the old migration
-- file would silently regress that change.
--
-- Idempotent: re-applying does CREATE OR REPLACE on the same body.

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
  -- Step 1: expire tasks. Three reasons:
  --   (a) past expires_at;
  --   (b) poll budget reached (poll_count >= max_polls);
  --   (c) parent subscription already inactive (orphan from start-watch's
  --       "deactivate other stations" path).
  -- ORDER BY id + FOR UPDATE => deterministic lock order, safe vs. start-watch
  -- which acquires locks in subscriptions -> polling_tasks order.
  WITH expired AS (
    UPDATE polling_tasks
    SET status = 'expired'
    WHERE id IN (
      SELECT pt.id
      FROM polling_tasks pt
      LEFT JOIN subscriptions s ON s.id = pt.subscription_id
      WHERE pt.status IN ('pending', 'running')
        AND (
          pt.expires_at < now()
          OR pt.poll_count >= pt.max_polls
          OR (pt.subscription_id IS NOT NULL AND s.is_active = false)
        )
      ORDER BY pt.id
      FOR UPDATE OF pt
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_expired FROM expired;

  -- Step 2: deactivate subscriptions that no longer have any live task.
  -- Single source of truth — also catches historically orphaned subscriptions
  -- (subsumes the one-shot backfill on the first run after deploy).
  -- Cheap: filter starts from the subscriptions_unique_active partial index,
  -- NOT EXISTS uses idx_polling_tasks_subscription_id.
  UPDATE subscriptions
  SET is_active = false
  WHERE id IN (
    SELECT s.id
    FROM subscriptions s
    WHERE s.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM polling_tasks t
        WHERE t.subscription_id = s.id
          AND t.status IN ('pending', 'running', 'dispatching')
      )
    ORDER BY s.id
    FOR UPDATE
  );

  -- Step 3: process each active task (unchanged from prod body).
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

    -- Check if ready for dispatch (single confirmed observation is sufficient)
    IF v_new_consecutive >= 1 THEN
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
