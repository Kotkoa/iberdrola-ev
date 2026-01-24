# Iberdrola EV Charger Monitor

Real-time Progressive Web App (PWA) for monitoring Iberdrola EV charging stations with live status updates and push notifications when charging ports become available.

<img width="1337" height="684" alt="Screenshot 2026-01-24 at 22 47 34" src="https://github.com/user-attachments/assets/909823d4-5de0-4d5f-8ee7-8a637363e03d" />


---

## Overview

**Iberdrola EV Charger Monitor** helps electric vehicle drivers instantly check whether a specific Iberdrola charging station is free or occupied — without physically visiting the location.

The app provides:

- real-time port availability,
- charging power and pricing,
- occupancy duration,
- one-time push notifications when a port becomes available.

The system is fully event-driven and does **not rely on polling in the frontend**.

---

## Key Features

- **Real-time updates** via Supabase Realtime (WebSocket)
- **Web Push notifications** (PWA) when a port becomes available
- **Two-port monitoring** per station
- **Charging power & price display** (€/kWh or FREE)
- **Busy duration tracking**
- **Installable PWA** (Android, iOS, desktop)
- **Low battery & bandwidth usage**

---

## Tech Stack

| Layer         | Technology                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | React 19, TypeScript 5.9, Vite                  |
| UI            | Material UI v7, Tailwind CSS v4                 |
| Backend       | Supabase (PostgreSQL, Realtime, Edge Functions) |
| Notifications | Web Push API, VAPID                             |
| Automation    | GitHub Actions (cron scraper)                   |
| Deployment    | Vercel                                          |

---

## High-Level Architecture

Iberdrola API
↓
GitHub Actions (cron, every 5 min)
↓
Node.js Scraper
↓
Supabase Postgres (charge_logs_parsed)
↓
┌───────────────┬────────────────┐
│ │ │
│ Realtime Channel Database Webhook
│ (WebSocket) (HTTP trigger)
│ │ │
▼ ▼ ▼
Frontend (PWA) UI Update Edge Function
↓
Web Push Notification

---

## Data Model

### `charge_logs_parsed`

Stores deduplicated charging station state snapshots.

- `cp_id`, `cp_name`
- `port1_status`, `port2_status` (`AVAILABLE` / `OCCUPIED`)
- `port1_power_kw`, `port2_power_kw`
- `port1_price_kwh`, `port2_price_kwh`
- `port1_update_date`, `port2_update_date`
- `address_full`, `coordinates`, metadata

### `subscriptions`

Stores one-time Web Push subscriptions.

- `endpoint`
- `p256dh`, `auth`
- `station_id`, `port_number`
- `is_active`, `last_notified_at`

---

## Real-Time Flow

1. Scraper detects a status change
2. New row inserted into `charge_logs_parsed`
3. Supabase Realtime broadcasts change to all clients
4. UI updates instantly
5. Database Webhook triggers Edge Function
6. Edge Function sends Web Push notifications
7. Subscription is marked inactive (one-time alert)

---

## Push Notifications (PWA)

- Uses **VAPID authentication**
- Works even when the app is closed
- Implemented via Service Worker (`sw.js`)
- One notification per subscription (anti-spam)

---

## Security Model

| Key            | Used by                 | Access      |
| -------------- | ----------------------- | ----------- |
| `anon`         | Frontend                | SELECT only |
| `service_role` | Scraper, Edge Functions | Full access |

- Row Level Security (RLS) enabled
- No custom backend server required

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

VITE_VAPID_PUBLIC_KEY=BK...

VITE_SAVE_SUBSCRIPTION_URL=https://xxx.supabase.co/functions/v1/save-subscription
VITE_CHECK_SUB_URL=https://xxx.supabase.co/functions/v1/check-subscription
```

## Development

```
npm install
npm run dev
npm run build
```

## Project Structure

```
├── api/
│   ├── charger.ts
│   └── supabase.ts
├── src/
│   ├── components/
│   ├── pwa.ts
│   ├── constants/
│   └── App.tsx
├── public/
│   └── sw.js
└── types/
```

## License

MIT
