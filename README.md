# Iberdrola EV Charger Monitor

Real-time Progressive Web App (PWA) for monitoring Iberdrola EV charging stations with live status updates, nearby station search, and push notifications when charging ports become available.

<img width="1337" height="684" alt="Screenshot 2026-01-24 at 22 47 34" src="https://github.com/user-attachments/assets/909823d4-5de0-4d5f-8ee7-8a637363e03d" />

---

## Overview

**Iberdrola EV Charger Monitor** helps electric vehicle drivers instantly check whether a specific Iberdrola charging station is free or occupied — without physically visiting the location.

The app provides:

- Real-time port availability
- Charging power and pricing (FREE or €/kWh)
- Occupancy duration tracking
- **Search nearby stations** with free/paid filter
- One-time push notifications when a port becomes available

The system is fully event-driven and does **not rely on polling in the frontend**.

---

## Key Features

- **Real-time updates** via Supabase Realtime (WebSocket)
- **Nearby station search** with two-stage loading (instant results + background enrichment)
- **Free/Paid filter** toggle to show only free or paid stations
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
| Frontend      | React 19, TypeScript 5.9, Vite 7                |
| UI            | Material UI 7, Tailwind CSS 4                   |
| Backend       | Supabase (PostgreSQL, Realtime, Edge Functions) |
| Notifications | Web Push API, VAPID                             |
| Testing       | Vitest, Testing Library                         |
| Automation    | GitHub Actions (cron scraper)                   |
| Deployment    | Vercel                                          |

---

## High-Level Architecture

```
Iberdrola API
      ↓
┌─────────────────────────────────────────────────────┐
│                                                     │
│  GitHub Actions          Search Feature (Browser)   │
│  (cron, every 5 min)     (on-demand via CORS proxy) │
│         ↓                         ↓                 │
│  Node.js Scraper         Two-stage loading:         │
│         ↓                 1. Batch API → instant    │
│         ↓                 2. Detail API → enrich    │
│         ↓                         ↓                 │
└─────────────────────────────────────────────────────┘
                      ↓
         Supabase Postgres
    ┌─────────────────────────────┐
    │  station_snapshots          │
    │  station_metadata           │
    │  snapshot_throttle (5-min)  │
    └─────────────────────────────┘
                      ↓
    ┌─────────────────┬────────────────┐
    │                 │                │
    │  Realtime       │  Database      │
    │  Channel        │  Webhook       │
    │  (WebSocket)    │  (HTTP)        │
    │                 │                │
    ▼                 ▼                ▼
Frontend (PWA)    UI Update      Edge Function
                                      ↓
                              Web Push Notification
```

---

## Data Freshness (TTL-Based)

Station data uses a **5-minute TTL cache** for optimal performance:

- **Fresh data** (< 5 min): Loaded from Supabase, no API call needed
- **Stale data** (≥ 5 min): Fetched from Edge function, stored in database
- **Realtime**: Immediate WebSocket subscription, updates merged by timestamp

### Benefits

- **~50% reduction in API calls** - only fetch when data is truly stale
- **Consistent user experience** - same TTL logic for Station and Search features
- **Better offline handling** - stale data shown instead of blank screen
- **Clear loading states** - state machine (`idle`, `loading_cache`, `loading_api`, `ready`, `error`)

---

## Data Model

### `station_snapshots`

Primary table for station status (deduplicated, 5-min throttle).

- `cp_id`, `cp_name`
- `port1_status`, `port2_status` (`AVAILABLE` / `OCCUPIED`)
- `port1_power_kw`, `port2_power_kw`
- `port1_price_kwh`, `port2_price_kwh`
- `port1_update_date`, `port2_update_date`
- `overall_status`, `emergency_stop_pressed`
- `situation_code` (OPER/MAINT/OOS)
- `source` (`user_nearby`, `user_station`, `scraper`)

### `station_metadata`

Reference data (rarely changes).

- `cp_id`, `cupr_id`
- `latitude`, `longitude`
- `address_full`

### `snapshot_throttle`

Deduplication table for snapshot storage (5-min TTL per station).

### `subscriptions`

Stores one-time Web Push subscriptions.

- `endpoint`
- `p256dh`, `auth`
- `station_id`, `port_number`
- `is_active`, `last_notified_at`

---

## Search Feature

The Search tab uses optimized **two-stage loading** for fast results:

**Stage 1 - Instant Results** (batch API):

- Cards appear immediately with address, coordinates, distance
- Skeleton placeholders for power, availability, price

**Stage 2 - Background Enrichment** (individual API calls):

- Fetches details: power (kW), port availability, price, socket type
- Updates cards in-place as data arrives
- Only FREE stations are saved to database cache

**Free/Paid Filter**:

- Switch toggle: left = FREE (green), right = PAID (orange)
- Favorite star only appears for FREE stations

---

## Real-Time Flow

1. Scraper detects a status change (or user triggers search)
2. New row inserted into `station_snapshots`
3. Supabase Realtime broadcasts change to all clients
4. UI updates instantly
5. Database Webhook triggers Edge Function
6. Edge Function sends Web Push notifications
7. Subscription is marked inactive (one-time alert)

### Connection State & Auto-Reconnection

The app tracks WebSocket connection state and auto-reconnects on failure:

| State          | UI Indicator       | Description                    |
| -------------- | ------------------ | ------------------------------ |
| `connected`    | 🟢 Live            | Active WebSocket connection    |
| `connecting`   | 🟡 Connecting...   | Initial connection             |
| `reconnecting` | 🟡 Reconnecting... | Auto-reconnect in progress     |
| `disconnected` | 🔴 Offline         | No connection                  |
| `error`        | 🔴 Error           | Max reconnect attempts reached |

**Auto-reconnection** uses exponential backoff (1s → 30s max, 10 attempts)

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

---

## Development

```bash
yarn install
yarn dev          # Development server (port 5173)
yarn build        # Production build
yarn test         # Run tests in watch mode
yarn test:run     # Run tests once
yarn check-types  # TypeScript type checking
yarn lint         # ESLint check
yarn format       # Prettier format
```

---

## Project Structure

```
├── api/
│   ├── charger.ts           # Supabase queries + real-time subscriptions
│   └── supabase.ts          # Supabase client
├── src/
│   ├── components/
│   │   ├── search/          # Search feature components
│   │   │   ├── SearchTab.tsx
│   │   │   ├── SearchResults.tsx
│   │   │   ├── StationResultCard.tsx
│   │   │   └── RadiusSelector.tsx
│   │   ├── ChargingStationInfo.tsx
│   │   ├── PortCard.tsx
│   │   └── ErrorBoundary.tsx
│   ├── context/
│   │   └── PrimaryStationContext.tsx
│   ├── hooks/
│   │   ├── useStationData.ts    # TTL-based station data loading ✨
│   │   ├── useCharger.ts        # (deprecated - use useStationData)
│   │   ├── useStationSearch.ts
│   │   └── useUserLocation.ts
│   ├── services/
│   │   ├── iberdrola.ts     # Iberdrola API client
│   │   └── stationApi.ts    # Edge Function client
│   ├── utils/
│   │   ├── maps.ts
│   │   ├── time.ts
│   │   ├── station.ts       # shouldSaveStationToCache utility
│   │   └── reconnectionManager.ts  # Auto-reconnect with backoff
│   ├── constants/
│   │   └── index.ts         # API endpoints, status enums
│   ├── pwa.ts               # PWA utilities, push notifications
│   └── App.tsx
├── public/
│   └── sw.js                # Service Worker
├── types/
│   ├── charger.ts           # Core data model
│   └── realtime.ts          # WebSocket connection state types
└── supabase/
    └── functions/           # Edge Functions
```

---

## Testing

Tests are written using Vitest and Testing Library.

```bash
yarn test         # Watch mode
yarn test:run     # Single run
yarn test:coverage # Coverage report
```

Key test files:

- `src/utils/station.test.ts` - Database save rules
- `src/utils/maps.test.ts` - Distance calculations
- `src/utils/time.test.ts` - Duration formatting
- `api/charger.test.ts` - Supabase subscriptions

---

## License

MIT
