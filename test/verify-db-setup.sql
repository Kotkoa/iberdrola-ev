-- ============================================
-- Database Setup Verification Script
-- ============================================
-- Purpose: Verify all database components for push notifications
-- Run this in Supabase SQL Editor before executing E2E test

-- ============================================
-- 1. Check if subscriptions table exists
-- ============================================
SELECT
  'subscriptions table' as component,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'subscriptions'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================
-- 2. Check subscriptions table structure
-- ============================================
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
ORDER BY ordinal_position;

-- Expected columns:
-- - id (uuid)
-- - station_id (text)
-- - port_number (integer)
-- - endpoint (text)
-- - p256dh (text)
-- - auth (text)
-- - is_active (boolean)
-- - created_at (timestamp with time zone)
-- - last_notified_at (timestamp with time zone)

-- ============================================
-- 3. Check station_snapshots table exists
-- ============================================
SELECT
  'station_snapshots table' as component,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'station_snapshots'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================
-- 4. Check database trigger is DISABLED (polling replaces trigger)
-- ============================================
SELECT
  tgname as trigger_name,
  CASE tgenabled
    WHEN 'D' THEN '✅ DISABLED (expected — polling active)'
    WHEN 'O' THEN '❌ ENABLED (should be disabled — polling handles notifications)'
    ELSE '❓ UNKNOWN'
  END as status,
  proname as function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgrelid = 'station_snapshots'::regclass
  AND tgname = 'trigger_port_available';

-- Expected: trigger_port_available | ✅ DISABLED

-- ============================================
-- 5. Check polling RPC function exists
-- ============================================
SELECT
  'process_polling_tasks function' as component,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'process_polling_tasks'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================
-- 6. Check active subscriptions for station 147988
-- ============================================
SELECT
  COUNT(*) as active_subscriptions,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ SUBSCRIPTIONS EXIST'
    ELSE '⚠️  NO SUBSCRIPTIONS (will be created during test)'
  END as status
FROM subscriptions
WHERE station_id = '147988'
  AND is_active = true;

-- ============================================
-- 7. Check current state of station 147988
-- ============================================
SELECT
  cp_id,
  port1_status,
  port2_status,
  observed_at,
  CASE
    WHEN port1_status = 'Occupied' OR port2_status = 'Occupied'
    THEN '✅ AT LEAST ONE PORT OCCUPIED (good for test)'
    ELSE '⚠️  ALL PORTS AVAILABLE (need to set Occupied first)'
  END as test_readiness
FROM station_snapshots
WHERE cp_id = 147988
ORDER BY observed_at DESC
LIMIT 1;

-- ============================================
-- 8. Check notification history for station 147988
-- ============================================
SELECT
  COUNT(*) as total_notifications,
  MAX(last_notified_at) as last_notification_time,
  CASE
    WHEN MAX(last_notified_at) IS NULL THEN '⚠️  NO NOTIFICATIONS YET'
    WHEN MAX(last_notified_at) > NOW() - INTERVAL '1 hour' THEN '✅ RECENT NOTIFICATION (< 1h ago)'
    WHEN MAX(last_notified_at) > NOW() - INTERVAL '1 day' THEN '✅ NOTIFICATION IN LAST 24h'
    ELSE '⚠️  OLD NOTIFICATION (> 24h ago)'
  END as notification_status
FROM subscriptions
WHERE station_id = '147988'
  AND last_notified_at IS NOT NULL;

-- ============================================
-- 9. Verify RLS (Row Level Security) policies
-- ============================================
SELECT
  schemaname,
  tablename,
  policyname,
  CASE
    WHEN cmd = '*' THEN 'ALL'
    WHEN cmd = 'r' THEN 'SELECT'
    WHEN cmd = 'a' THEN 'INSERT'
    WHEN cmd = 'w' THEN 'UPDATE'
    WHEN cmd = 'd' THEN 'DELETE'
  END as command,
  CASE WHEN permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END as type
FROM pg_policies
WHERE tablename IN ('subscriptions', 'station_snapshots', 'polling_tasks')
ORDER BY tablename, policyname;

-- Expected: subscriptions has 4 policies (SELECT/INSERT/UPDATE/DELETE) for service_role

-- ============================================
-- 9b. Verify subscriptions grants revoked from anon/authenticated
-- ============================================
SELECT
  grantee,
  privilege_type,
  CASE
    WHEN grantee IN ('anon', 'authenticated') THEN '❌ SHOULD BE REVOKED'
    ELSE '✅ OK'
  END as status
FROM information_schema.table_privileges
WHERE table_name = 'subscriptions'
  AND grantee IN ('anon', 'authenticated');

-- Expected: 0 rows (all grants revoked)

-- ============================================
-- 9c. Check polling_tasks health
-- ============================================
SELECT
  status,
  COUNT(*) as count,
  MAX(last_checked_at) as last_checked
FROM polling_tasks
GROUP BY status
ORDER BY status;

-- ============================================
-- 10. Summary Report
-- ============================================
SELECT
  '=== VERIFICATION SUMMARY ===' as report_section,
  '' as details
UNION ALL
SELECT
  'Subscriptions table',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions')
    THEN '✅' ELSE '❌' END
UNION ALL
SELECT
  'Station snapshots table',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'station_snapshots')
    THEN '✅' ELSE '❌' END
UNION ALL
SELECT
  'Trigger DISABLED (polling active)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_port_available'
      AND tgenabled = 'D'
  ) THEN '✅' ELSE '❌' END
UNION ALL
SELECT
  'Polling RPC function',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_polling_tasks')
    THEN '✅' ELSE '❌' END
UNION ALL
SELECT
  'Subscriptions RLS policies',
  CASE WHEN (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'subscriptions') >= 4
    THEN '✅' ELSE '❌' END
UNION ALL
SELECT
  'Station 147988 snapshot exists',
  CASE WHEN EXISTS (SELECT 1 FROM station_snapshots WHERE cp_id = 147988)
    THEN '✅' ELSE '❌' END;

-- ============================================
-- 11. Get snapshot ID for manual testing
-- ============================================
-- This is the ID you'll need for the UPDATE queries in Step 8
SELECT
  '=== SNAPSHOT ID FOR TESTING ===' as info,
  id as snapshot_id,
  cp_id,
  port1_status,
  port2_status,
  observed_at,
  CASE
    WHEN port1_status = 'Occupied'
    THEN '✅ Ready to test Port 1 (already Occupied)'
    WHEN port1_status = 'Available'
    THEN '⚠️  Need to set Port 1 to Occupied first'
    ELSE '❓ Unknown status'
  END as port1_test_status,
  CASE
    WHEN port2_status = 'Occupied'
    THEN '✅ Ready to test Port 2 (already Occupied)'
    WHEN port2_status = 'Available'
    THEN '⚠️  Need to set Port 2 to Occupied first'
    ELSE '❓ Unknown status'
  END as port2_test_status
FROM station_snapshots
WHERE cp_id = 147988
ORDER BY observed_at DESC
LIMIT 1;

-- ============================================
-- INSTRUCTIONS FOR USE
-- ============================================
/*

HOW TO USE THIS SCRIPT:
=======================

1. Copy this entire script
2. Open Supabase Dashboard > SQL Editor
3. Paste and run the script
4. Review all outputs to ensure:
   - ✅ All tables exist
   - ✅ Trigger is enabled
   - ✅ Station 147988 snapshot exists
   - ✅ Port status is suitable for testing

5. If any component shows ❌ MISSING:
   - Check Supabase migrations
   - Verify Edge Functions are deployed
   - Contact database administrator

6. Copy the snapshot_id from section 11
   You'll need this ID for the UPDATE queries in the E2E test

EXPECTED RESULTS:
=================

✅ subscriptions table: EXISTS
✅ station_snapshots table: EXISTS
✅ trigger_port_available: DISABLED (polling handles notifications)
✅ process_polling_tasks function: EXISTS
✅ Subscriptions RLS: 4 policies (service_role only)
✅ Station 147988 snapshot: EXISTS
⚠️  Active subscriptions: 0 (will be created during test)

TROUBLESHOOTING:
================

If trigger is ENABLED (should be DISABLED):
  -- Polling engine replaces the old trigger-based notifications.
  -- Trigger is kept for emergency rollback only.
  ALTER TABLE station_snapshots
  DISABLE TRIGGER trigger_port_available;

If polling function is missing:
  Check migrations are applied:
  npx supabase db push

If Edge Function is missing:
  Deploy via Supabase MCP or CLI:
  npx supabase functions deploy process-polling
  npx supabase functions deploy send-push-notification

EMERGENCY ROLLBACK (re-enable trigger, disable polling):
  ALTER TABLE station_snapshots ENABLE TRIGGER trigger_port_available;
  -- Then disable notification-polling.yml workflow in GitHub Actions

*/
