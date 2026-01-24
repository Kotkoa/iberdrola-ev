# Iberdrola EV Charger Monitor

Real-time PWA for monitoring Iberdrola EV charging stations with push notifications when ports become available.

<img width="1480" height="652" alt="Screenshot" src="https://github.com/user-attachments/assets/0f67510d-cd41-47a2-b80f-94003f53f3e6" />

## Features

- **Real-Time Status** — Live port availability via Supabase Realtime subscriptions
- **Push Notifications** — Get notified when an occupied port becomes free (PWA only)
- **Pricing Display** — Shows charging cost per kWh or FREE badge
- **Duration Tracking** — How long a port has been occupied
- **Location Details** — Full address, coordinates, emergency status
- **Installable PWA** — Add to home screen for native app experience

## Tech Stack

| Layer         | Technology                                    |
| ------------- | --------------------------------------------- |
| Frontend      | React 19, TypeScript 5.9, Vite 7              |
| UI            | Material-UI 7, Tailwind CSS 4                 |
| Backend       | Supabase (Postgres, Realtime, Edge Functions) |
| Notifications | Web Push API, VAPID                           |
| Deployment    | Vercel                                        |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (PWA)                           │
│  React App ←── Supabase Realtime ←── charge_logs_parsed table  │
│      │                                                          │
│      └── Service Worker (sw.js) ←── Web Push notifications     │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Backend                            │
│                                                                 │
│  ┌──────────────────┐    INSERT    ┌──────────────────┐        │
│  │ charge_logs_parsed│ ──────────→ │ Database Webhook │        │
│  └──────────────────┘              └────────┬─────────┘        │
│                                             │                   │
│  ┌──────────────────┐              ┌────────▼─────────┐        │
│  │  subscriptions   │ ←─────────── │  Edge Function   │        │
│  │     table        │   query      │ (send Web Push)  │        │
│  └──────────────────┘              └──────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### charge_logs_parsed

Main table storing charging station status. Populated by an external scraper that polls the Iberdrola API.

**Station identification:**

- `cp_id` — Unique station identifier from Iberdrola
- `cp_name` — Human-readable station name

**Port status** (each station has 2 ports):

- `port1_status`, `port2_status` — Current state: `AVAILABLE` or `OCCUPIED`
- `port1_update_date`, `port2_update_date` — When the port status last changed (used to calculate busy duration)

**Port specifications:**

- `port1_power_kw`, `port2_power_kw` — Charging power in kilowatts (e.g., 22)
- `port1_price_kwh`, `port2_price_kwh` — Price per kWh in euros (0 = free charging)
- `port1_socket_type`, `port2_socket_type` — Connector type (e.g., "Mennekes")

**Station metadata:**

- `address_full` — Complete address string
- `cp_latitude`, `cp_longitude` — GPS coordinates for map integration
- `situation_code` — Operational status: `OPER` (operational), `MAINT` (maintenance), `OOS` (out of service)
- `emergency_stop_pressed` — Safety indicator

### subscriptions

Stores Web Push subscriptions for notification delivery. When a user subscribes to notifications for a specific port, their browser's push subscription details are saved here.

**Subscription target:**

- `station_id` — Which charging station to monitor
- `port_number` — Which port (1 or 2) to watch for availability

**Push credentials** (from browser's PushSubscription object):

- `endpoint` — Push service URL (e.g., FCM endpoint)
- `p256dh` — Public encryption key
- `auth` — Authentication secret

**Lifecycle management:**

- `is_active` — Set to `false` after notification is sent (one-time alert)
- `last_notified_at` — Timestamp of last notification (used for deduplication)

## Push Notification Flow

1. **User subscribes** (PWA only, when port is occupied)
   - Frontend requests notification permission
   - Registers service worker and creates push subscription
   - Saves subscription to `subscriptions` table via Edge Function

2. **Port becomes available**
   - Scraper inserts new record with `port_status = 'AVAILABLE'`
   - Database Webhook triggers Edge Function

3. **Notification sent**
   - Edge Function queries active subscriptions for that station/port
   - Sends Web Push to each subscriber
   - Marks subscription as inactive (one-time notification)

### Database Webhooks

Two webhooks trigger `on-station-available` Edge Function:

| Webhook          | Condition                              |
| ---------------- | -------------------------------------- |
| Port 1 Available | `port1_status = 'AVAILABLE'` on INSERT |
| Port 2 Available | `port2_status = 'AVAILABLE'` on INSERT |

### Edge Functions

| Function               | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `save-subscription`    | Stores new push subscription               |
| `check-subscription`   | Checks if user already subscribed          |
| `on-station-available` | Sends push notifications when port is free |

## Environment Variables

```env
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Web Push (VAPID)
VITE_VAPID_PUBLIC_KEY=BJ...

# Edge Function URLs
VITE_SAVE_SUBSCRIPTION_URL=https://xxx.supabase.co/functions/v1/save-subscription
VITE_CHECK_SUB_URL=https://xxx.supabase.co/functions/v1/check-subscription
```

Edge Functions require these secrets (set in Supabase Dashboard):

- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `EDGE_TRIGGER_SECRET` (for webhook authorization)

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

## Project Structure

```
├── api/
│   ├── charger.ts          # Supabase queries + Realtime subscription
│   └── supabase.ts         # Supabase client
├── src/
│   ├── components/
│   │   ├── PortCard.tsx    # Port status card with pricing
│   │   ├── PortsList.tsx   # Ports container + subscription panel
│   │   └── SubscriptionPanel.tsx
│   ├── pwa.ts              # Push notification utilities
│   ├── constants/          # API endpoints, status enums
│   └── App.tsx             # Main component
├── public/
│   └── sw.js               # Service worker for push events
└── types/
    └── charger.ts          # TypeScript interfaces
```

## License

MIT
