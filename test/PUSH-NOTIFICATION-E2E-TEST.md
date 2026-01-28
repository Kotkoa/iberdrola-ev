# E2E Push Notification Test Guide

**Application**: Iberdrola EV Charger Monitor
**Production URL**: https://iberdrola-ev.vercel.app/
**Dev URL**: http://localhost:5173
**Last Updated**: 2026-01-28

---

## Latest Test Results

| Component                 | Status | Version |
| ------------------------- | ------ | ------- |
| save-subscription         | ✅     | v14     |
| send-push-notification    | ✅     | v8      |
| check-subscription        | ✅     | v7      |
| DB Trigger                | ✅     | enabled |
| Subscription deactivation | ✅     | -       |
| Subscription reactivation | ✅     | -       |

---

## One-Time Notification Model

Push-уведомления работают по модели "one-time notification":

```
User clicks "Get notified"
    ↓
save-subscription: creates/reactivates subscription (is_active = true)
    ↓
Port status changes: OCCUPIED → AVAILABLE
    ↓
DB trigger fires → send-push-notification
    ↓
Push sent to all active subscribers
    ↓
Subscriptions deactivated (is_active = false, last_notified_at = NOW())
    ↓
User must click "Get notified" again for next notification
```

**Key behaviors:**

- Подписка активируется при клике "Get notified"
- После отправки уведомления подписка деактивируется
- save-subscription автоматически реактивирует существующую подписку
- Пользователь должен явно подписаться снова для следующего уведомления

---

## Quick Start

### 1. Subscribe to notifications

1. Open https://iberdrola-ev.vercel.app/
2. Find a station with **Occupied** port
3. Click **"Get notified"** button
4. Allow notification permission
5. Button changes to **"Alert active"**

### 2. Trigger notification (via SQL)

```sql
-- Get current snapshot ID
SELECT id, port1_status FROM station_snapshots
WHERE cp_id = 147988 ORDER BY observed_at DESC LIMIT 1;

-- If port is Available, first set to Occupied
UPDATE station_snapshots SET port1_status = 'Occupied'
WHERE id = '<snapshot-id>' AND cp_id = 147988;

-- Wait 2 seconds, then trigger notification
UPDATE station_snapshots SET port1_status = 'Available'
WHERE id = '<snapshot-id>' AND cp_id = 147988;
```

### 3. Verify

- Browser notification appears within 3 seconds
- Title: "Charger Available!"
- Body: "Port 1 at station 147988 is now available"

---

## Test Edge Function Directly

```bash
# Test send-push-notification
curl -s -X POST 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/send-push-notification' \
  -H 'Content-Type: application/json' \
  -d '{"stationId": "147988", "portNumber": 1}'
```

**Responses:**

- `{"success":true,"sent":1,"failed":0,"deactivated":1}` - notification sent
- `{"message":"No active subscriptions for this port"}` - no active subscriptions

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
- `seconds_ago < 10`

---

## Edge Functions

### save-subscription (v14)

**Behavior:**

- Creates new subscription if not exists
- **Reactivates** existing subscription if exists (even if `is_active = false`)
- Updates encryption keys (p256dh, auth)

```typescript
if (existing) {
  // Reactivates existing subscription
  .update({ is_active: true, p256dh, auth })
} else {
  // Creates new subscription
  .insert({ station_id, port_number, endpoint, p256dh, auth, is_active: true })
}
```

### send-push-notification (v8)

**Behavior:**

- Fetches all active subscriptions for station/port
- Sends push notification to each subscriber
- **Deactivates all subscriptions** after sending (`is_active = false`)
- Updates `last_notified_at` timestamp

```typescript
// After sending notifications
await supabase
  .from('subscriptions')
  .update({
    last_notified_at: new Date().toISOString(),
    is_active: false, // Deactivate after notification
  })
  .eq('station_id', stationId)
  .eq('port_number', portNumber)
  .eq('is_active', true);
```

---

## Database Trigger

```sql
-- Check trigger status
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'station_snapshots'::regclass
  AND tgname = 'trigger_port_available';
```

Expected: `trigger_port_available | O` (O = enabled)

**Trigger fires when:**

- `port1_status` changes from non-Available to 'Available'
- `port2_status` changes from non-Available to 'Available'

---

## Known Limitations

### 1. Chrome DevTools MCP

Browser controlled by Chrome DevTools MCP does not receive push notifications correctly. Test in a regular browser window.

### 2. CORS Proxy on Production

`corsproxy.io` returns CORS errors on production domain. Search feature may fail on https://iberdrola-ev.vercel.app/

### 3. FCM Token Expiration

Push subscription tokens expire when browser is restarted. This is normal behavior - users need to resubscribe.

### 4. Safari iOS

Push notifications not supported in Safari on iOS (browser limitation). Button shows disabled with message.

---

## Troubleshooting

### Notification not received

1. **Check subscriptions exist:**

   ```sql
   SELECT * FROM subscriptions
   WHERE station_id = '147988' AND is_active = true;
   ```

2. **Check Edge Function logs:**
   Supabase Dashboard → Edge Functions → send-push-notification → Logs

3. **Test Edge Function directly:**

   ```bash
   curl -s -X POST 'https://cribsatiisubfyafflmy.supabase.co/functions/v1/send-push-notification' \
     -H 'Content-Type: application/json' \
     -d '{"stationId": "147988", "portNumber": 1}'
   ```

4. **Check browser notifications enabled:**
   - Chrome: Settings → Privacy → Notifications
   - Allow for localhost:5173 or iberdrola-ev.vercel.app

### Button stuck on "Subscribing..."

1. Check DevTools Console for errors
2. Verify VAPID keys in `.env.local`
3. Check save-subscription Edge Function logs

### Trigger not firing

1. Verify trigger is enabled:

   ```sql
   SELECT tgenabled FROM pg_trigger
   WHERE tgname = 'trigger_port_available';
   ```

2. Ensure status transition is Occupied → Available (not Available → Available)

---

## Files Reference

| File                                                            | Purpose                              |
| --------------------------------------------------------------- | ------------------------------------ |
| [public/sw.js](../public/sw.js)                                 | Service Worker - handles push events |
| [src/pwa.ts](../src/pwa.ts)                                     | Push subscription logic              |
| [src/components/PortsList.tsx](../src/components/PortsList.tsx) | Notification button UI               |

---

## Success Criteria

| Criterion                  | Expected                |
| -------------------------- | ----------------------- |
| Subscription created       | Button = "Alert active" |
| Database record            | `is_active = true`      |
| Trigger fires              | Edge Function called    |
| Notification appears       | Within 3 seconds        |
| Subscriptions deactivated  | `is_active = false`     |
| `last_notified_at` updated | Recent timestamp        |
| UI updates                 | Port card turns green   |

---

**Document Version**: 2.0
**Test Status**: ✅ All components working
