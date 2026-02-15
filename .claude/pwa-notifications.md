# PWA & Push Notifications

## Architecture: Polling-based notifications

Notifications use a **polling engine** instead of a database trigger. This eliminates false positives by requiring confirmation across 2+ separate Iberdrola API observations.

```
User clicks "Get notified"
    |
start-watch Edge Function:
    - Deactivates all prior subscriptions for this browser (one-active-per-browser)
    - Creates/reactivates subscription (is_active = true)
    - Creates polling_task (status = 'pending')
    |
GitHub Actions cron (every 5 min) -> process-polling Edge Function:
    - Calls RPC process_polling_tasks(false)
    - Compares port_update_date with last_seen_port_update_at
    - Increments consecutive_available on new Available observation
    - Resets consecutive_available if status != target
    |
consecutive_available >= 2:
    - process-polling dispatches to send-push-notification
    - Push sent to subscriber
    - Subscription deactivated (is_active = false)
    - polling_task marked 'completed'
    |
User must click "Get notified" again for next notification
```

## Required Environment Variables

```bash
VITE_VAPID_PUBLIC_KEY          # Web Push public key
VITE_SAVE_SUBSCRIPTION_URL     # Backend endpoint (start-watch)
VITE_CHECK_SUB_URL             # Check existing subscriptions
```

## Key Files

- **[src/pwa.ts](../src/pwa.ts)** - PWA utilities, `subscribeWithWatch()` subscription flow
- **[public/sw.js](../public/sw.js)** - Service worker (handles push events and notification clicks)
- **[supabase/functions/start-watch/](../supabase/functions/start-watch/)** - Subscription + polling task creation
- **[supabase/functions/process-polling/](../supabase/functions/process-polling/)** - Cron-triggered dispatch engine
- **[supabase/functions/send-push-notification/](../supabase/functions/send-push-notification/)** - Web Push delivery
- **[supabase/functions/check-subscription/](../supabase/functions/check-subscription/)** - Check active subscriptions

## PWA Detection

Use `isStandaloneApp()` - checks both:

- `display-mode: standalone` media query
- `navigator.standalone` property (iOS)

## One-active-per-browser Model

Each browser endpoint can have only one active subscription at a time. When subscribing to a new station/port, `start-watch` deactivates all previous subscriptions for that endpoint before creating a new one.

## Subscription Button Debounce

To prevent multiple rapid subscription requests, the "Get notified" button uses debounce:

- **Debounce delay**: 2000ms
- **Per-port tracking**: Each port has independent debounce
- **Implementation**: `useRef` with last click timestamp

## Dedup Guard

`send-push-notification` skips subscriptions where `last_notified_at < 5 minutes ago` to prevent duplicate notifications during the overlap window.
