-- Security hardening for subscriptions table
-- Closes: missing RLS policies, overly broad grants, missing search_path, missing index

-- ============================================
-- 1. RLS policies for subscriptions (service_role only)
-- ============================================
-- RLS is already enabled, but has zero policies.
-- service_role bypasses RLS, but policies are needed for defense-in-depth.

CREATE POLICY allow_service_read
ON public.subscriptions
FOR SELECT
TO service_role
USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY allow_service_insert
ON public.subscriptions
FOR INSERT
TO service_role
WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY allow_service_update
ON public.subscriptions
FOR UPDATE
TO service_role
USING ((SELECT auth.role()) = 'service_role')
WITH CHECK ((SELECT auth.role()) = 'service_role');

CREATE POLICY allow_service_delete
ON public.subscriptions
FOR DELETE
TO service_role
USING ((SELECT auth.role()) = 'service_role');

-- ============================================
-- 2. Revoke overly broad grants from anon/authenticated
-- ============================================
-- Currently anon and authenticated have ALL privileges on subscriptions.
-- Only service_role (Edge Functions) should access this table.

REVOKE ALL ON TABLE public.subscriptions FROM anon, authenticated;

-- ============================================
-- 3. Pin search_path on verification_backoff_seconds
-- ============================================
-- Only notification-related function still missing search_path.

ALTER FUNCTION public.verification_backoff_seconds(integer)
  SET search_path = public;

-- ============================================
-- 4. Index for send-push-notification queries
-- ============================================
-- send-push-notification queries: WHERE station_id=X AND port_number=Y AND is_active=true
-- Covers both trigger-based and future polling-based notification dispatch.

CREATE INDEX IF NOT EXISTS idx_subscriptions_station_port_active
  ON public.subscriptions (station_id, port_number)
  WHERE (is_active = true);
