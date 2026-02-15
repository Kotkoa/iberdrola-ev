# E2E Push Notification Test Guide

**Application**: Iberdrola EV Charger Monitor
**Production URL**: https://iberdrola-ev.vercel.app/
**Dev URL**: http://localhost:5173
**Last Updated**: 2026-02-15
**Architecture**: Polling-based (trigger disabled)

---

## Latest Test Results

| Component              | Status | Version |
| ---------------------- | ------ | ------- |
| start-watch            | ✅     | v3      |
| send-push-notification | ✅     | v10     |
| check-subscription     | ✅     | v7      |
| process-polling        | ✅     | v1      |
| DB Trigger             | ⛔     | disabled |
| Polling engine (cron)  | ✅     | active  |

---

## Polling-based Notification Model

Push notifications use a **polling engine** with consecutive confirmation:

```
User clicks "Get notified"
    ↓
start-watch: creates subscription + polling_task
    ↓
GitHub Actions cron (*/5 min) → process-polling Edge Function
    ↓
process_polling_tasks RPC checks station_snapshots:
    - Compares port_update_date with last_seen_port_update_at
    - If new observation + status = Available → consecutive_available++
    - If new observation + status ≠ Available → consecutive_available = 0
    ↓
consecutive_available >= 2 → dispatch notification
    ↓
send-push-notification → push sent → subscription deactivated
    ↓
User must click "Get notified" again for next notification
```

**Key difference from old trigger approach:**
- Old: Single Occupied→Available transition fired immediately (false positives)
- New: Requires 2+ separate Iberdrola API observations confirming Available status

---

## Quick Start

### 1. Subscribe to notifications

1. Open https://iberdrola-ev.vercel.app/
2. Find a station with **Occupied** port
3. Click **"Get notified"** button
4. Allow notification permission
5. Button changes to **"Alert active"**

### 2. Verify subscription created

```sql
-- Check subscription
SELECT id, station_id, port_number, is_active
FROM subscriptions
WHERE is_active = true
ORDER BY created_at DESC LIMIT 5;

-- Check polling task
SELECT id, cp_id, target_port, status, consecutive_available, poll_count
FROM polling_tasks
WHERE status IN ('pending', 'running')
ORDER BY created_at DESC LIMIT 5;
```

### 3. Wait for polling cycles

Polling runs every 5 minutes. After 2+ cycles with Available status confirmed:

- Browser notification appears
- Title: "Charger Available!"
- Body: "Port N at station XXXXX is now available"

### 4. Manual trigger (for testing)

To simulate consecutive observations, call the RPC directly:

```sql
-- Dry-run: check what would happen
SELECT process_polling_tasks(true);

-- Real run: dispatch notifications for ready tasks
SELECT process_polling_tasks(false);
```

Or trigger the Edge Function:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/process-polling" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}'
```

---

## Test Edge Functions Directly

```bash
# Test process-polling (triggers full cycle)
curl -s -X POST 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/process-polling' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{}'

# Test send-push-notification (sends to active subscribers)
curl -s -X POST 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/send-push-notification' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"stationId": "147988", "portNumber": 1}'
```

**process-polling response:**
```json
{"ok":true,"data":{"processed":3,"expired":0,"ready":1,"dispatched":1,"failed":0}}
```

**send-push-notification responses:**
- `{"success":true,"sent":1,"failed":0,"deactivated":1}` — notification sent
- `{"message":"No active subscriptions for this port"}` — no active subscriptions

---

## Verify Subscriptions

```sql
-- Check active subscriptions
SELECT id, station_id, port_number, is_active,
       last_notified_at,
       EXTRACT(EPOCH FROM (NOW() - last_notified_at)) as seconds_ago
FROM subscriptions
WHERE station_id = '147988'
ORDER BY created_at DESC;
```

**Expected after notification:**
- `is_active = false`
- `last_notified_at` = recent timestamp

---

## Verify Polling Tasks

```sql
-- Check polling task lifecycle
SELECT id, cp_id, target_port, status,
       consecutive_available, poll_count,
       last_checked_at, last_seen_status,
       last_seen_port_update_at
FROM polling_tasks
ORDER BY created_at DESC LIMIT 10;
```

**Expected lifecycle:**
1. `status = 'pending'` → after `start-watch`
2. `status = 'running'`, `poll_count` grows → after polling cycles
3. `consecutive_available >= 2` → ready for dispatch
4. `status = 'dispatching'` → during notification send
5. `status = 'completed'` → after successful push
6. `status = 'expired'` → if `expires_at` passed or `poll_count >= max_polls`

---

## Edge Functions

### start-watch (v3)

**Behavior:**
- Deactivates ALL active subscriptions for this browser endpoint
- Creates/reactivates subscription with correct `port_number`
- Creates polling_task linked to subscription

### process-polling (v1)

**Behavior:**
- Called by GitHub Actions cron every 5 minutes
- Calls RPC `process_polling_tasks(false)`
- For ready tasks (consecutive_available >= 2): dispatches to send-push-notification
- On push failure: reverts task to 'running' for retry next cycle

### send-push-notification (v10)

**Behavior:**
- Fetches active subscriptions for station/port
- **Dedup guard**: Skips subscriptions with `last_notified_at < 5 min ago`
- Sends Web Push notification
- Deactivates subscriptions after sending (`is_active = false`)
- Updates `last_notified_at` timestamp

### check-subscription (v7)

**Behavior:**
- Returns active subscription ports for a given station + endpoint
- Used by frontend to show correct button state

---

## Known Limitations

### 1. Polling Latency

Notifications are not instant. Minimum latency = 2 polling cycles (10+ minutes) since consecutive_available >= 2 is required.

### 2. Chrome DevTools MCP

Browser controlled by Chrome DevTools MCP does not receive push notifications correctly. Test in a regular browser window.

### 3. FCM Token Expiration

Push subscription tokens expire when browser is restarted. Users need to resubscribe.

### 4. Safari iOS

Push notifications not supported in Safari on iOS. Button shows disabled with message.

---

## Troubleshooting

### Notification not received

1. **Check polling task status:**
   ```sql
   SELECT id, status, consecutive_available, poll_count, last_checked_at
   FROM polling_tasks WHERE status IN ('pending', 'running')
   ORDER BY created_at DESC;
   ```

2. **Check consecutive_available is growing:**
   If `consecutive_available` stays at 0, the port may not be Available or `port_update_date` is not changing between scraper runs.

3. **Check Edge Function logs:**
   Supabase Dashboard → Edge Functions → process-polling → Logs

4. **Run polling manually:**
   ```bash
   curl -s -X POST "$SUPABASE_URL/functions/v1/process-polling" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -d '{}'
   ```

5. **Check browser notifications enabled:**
   - Chrome: Settings → Privacy → Notifications
   - Allow for localhost:5173 or iberdrola-ev.vercel.app

### Button stuck on "Subscribing..."

1. Check DevTools Console for errors
2. Verify VAPID keys in `.env.local`
3. Check start-watch Edge Function logs

### Polling not running

1. Check GitHub Actions → notification-polling.yml is enabled
2. Check cron schedule: `*/5 * * * *`
3. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets are set

---

## Emergency Rollback

If polling causes issues, re-enable the old trigger:

```sql
-- Re-enable trigger
ALTER TABLE station_snapshots ENABLE TRIGGER trigger_port_available;
```

```bash
# Disable polling workflow
gh workflow disable notification-polling.yml -R kotkoa/iberdrola-scraper
```

---

## Files Reference

| File                                                             | Purpose                              |
| ---------------------------------------------------------------- | ------------------------------------ |
| [public/sw.js](../public/sw.js)                                  | Service Worker - handles push events |
| [src/pwa.ts](../src/pwa.ts)                                      | Push subscription logic              |
| [src/components/PortsList.tsx](../src/components/PortsList.tsx)  | Notification button UI               |
| [supabase/functions/start-watch/](../supabase/functions/start-watch/) | Subscription + polling task creation |
| [supabase/functions/process-polling/](../supabase/functions/process-polling/) | Polling dispatch engine |
| [supabase/functions/send-push-notification/](../supabase/functions/send-push-notification/) | Web Push delivery |
| [.github/workflows/notification-polling.yml](../.github/workflows/notification-polling.yml) | Cron trigger |

---

## Success Criteria

| Criterion                      | Expected                         |
| ------------------------------ | -------------------------------- |
| Subscription created           | Button = "Alert active"          |
| Polling task created           | `status = 'pending'`             |
| poll_count grows               | Increments each 5-min cycle      |
| consecutive_available >= 2     | Confirmed across 2+ observations |
| Notification appears           | After dispatch                   |
| Subscription deactivated       | `is_active = false`              |
| Polling task completed         | `status = 'completed'`           |
| `last_notified_at` updated     | Recent timestamp                 |

---

**Document Version**: 3.0
**Test Status**: ✅ Polling engine active, trigger disabled
