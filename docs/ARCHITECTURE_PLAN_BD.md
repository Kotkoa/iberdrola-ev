# Database Architecture Plan

> Iberdrola EV Charger Monitor — Supabase (PostgreSQL 17)

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Entity Relationship](#2-entity-relationship)
3. [Table Descriptions](#3-table-descriptions)
4. [Data Flow: Scraper → DB → Frontend](#4-data-flow-scraper--db--frontend)
5. [Edge Functions](#5-edge-functions)
6. [WebSocket Subscriptions (Realtime)](#6-websocket-subscriptions-realtime)
7. [RPC Functions](#7-rpc-functions)
8. [Indexes](#8-indexes)
9. [Row-Level Security (RLS)](#9-row-level-security-rls)
10. [Cron Jobs & Maintenance](#10-cron-jobs--maintenance)
11. [Throttling & Deduplication](#11-throttling--deduplication)
12. [Performance Risks & Mitigations](#12-performance-risks--mitigations)
13. [Scalability Considerations](#13-scalability-considerations)

---

## 1. System Overview

```
┌─────────────────┐     dispatch      ┌──────────────────┐
│  Frontend (PWA) │ ───────────────→  │  GitHub Actions   │
│  React + TS     │                   │  (Scraper)        │
└────────┬────────┘                   └────────┬──────────┘
         │                                     │
    read │ realtime                    save-snapshot
         │ (WebSocket)                         │
         ▼                                     ▼
┌────────────────────────────────────────────────────────┐
│                    Supabase                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Edge         │  │ PostgreSQL   │  │ Realtime     │  │
│  │ Functions    │──│ (Tables,     │──│ (WAL-based   │  │
│  │              │  │  RPC, Cron)  │  │  WebSocket)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Key constraint**: Iberdrola API blocks requests from Supabase IP ranges.
Therefore GitHub Actions serves as a proxy — fetching data from Iberdrola
and writing results to Supabase via Edge Functions.

---

## 2. Entity Relationship

```
┌──────────────────────┐
│   station_metadata   │  Reference data (2,679 rows)
│──────────────────────│
│ PK  cp_id      int4  │◄─────────────────────────────────────┐
│ UQ  cupr_id    int4  │                                      │
│     name       text  │                                      │
│     latitude   num   │         ┌──────────────────────┐     │
│     longitude  num   │         │  station_snapshots   │     │
│     address_*  text  │         │──────────────────────│     │
│     provider   text  │         │ PK  id        uuid   │     │
│     is_free    bool  │         │ FK  cp_id     int4  ─┼─────┘
│     verification_*   │         │ UQ  cp_id     int4   │  (1:1 latest)
│     port*_socket_*   │         │     source    enum   │
│     overall_status   │         │     observed_at tz   │
│     situation_code   │         │     port*_status     │
│     created_at  tz   │         │     port*_power_kw   │
│     updated_at  tz   │         │     port*_price_kwh  │
└──────────┬───────────┘         │     overall_status   │
           │                     │     payload_hash     │
           │                     │     emergency_stop   │
           │ FK                  │     situation_code   │
           ▼                     │     created_at  tz   │
┌──────────────────────┐         └──────────────────────┘
│  snapshot_throttle   │                    │
│──────────────────────│                    │ trigger (UPDATE)
│ PK  cp_id      int4  │                    ▼
│     last_payload_hash│         ┌──────────────────────┐
│     last_snapshot_at │         │ notify_subscribers_  │
└──────────────────────┘         │ on_port_available()  │
                                 └──────────┬───────────┘
                                            │ HTTP POST
           ┌────────────────────────────────┘
           ▼
┌──────────────────────┐         ┌──────────────────────┐
│    subscriptions     │         │   polling_tasks      │
│──────────────────────│         │──────────────────────│
│ PK  id        uuid   │◄────── │ PK  id        uuid   │
│     station_id text  │   FK   │ FK  subscription_id  │
│     endpoint   text  │        │     cp_id      int4  │
│     p256dh     text  │        │     cupr_id    int4  │
│     auth       text  │        │     status     text  │
│     port_number int  │        │     target_port int  │
│     target_status    │        │     target_status    │
│     is_active  bool  │        │     poll_count  int  │
│     last_notified_at │        │     max_polls   int  │
│     created_at  tz   │        │     expires_at   tz  │
└──────────────────────┘        │     last_checked_at  │
                                │     consecutive_avail│
┌──────────────────────┐        └──────────────────────┘
│ geo_search_throttle  │
│──────────────────────│        ┌──────────────────────┐
│ PK  bbox_key   text  │        │ station_verification │
│     last_search_at   │        │ _queue               │
└──────────────────────┘        │──────────────────────│
                                │ PK  cp_id      int4  │
                                │     cupr_id    int4  │
                                │     status     text  │
                                │     attempt_count    │
                                │     next_attempt_at  │
                                │     locked_at   tz   │
                                │     last_error text  │
                                └──────────────────────┘
```

### Entity Relationships Summary

| Relationship | Type | Description |
|---|---|---|
| `station_metadata` → `station_snapshots` | 1:1 | One latest snapshot per station (UNIQUE on cp_id) |
| `station_metadata` → `snapshot_throttle` | 1:1 | Dedup / rate limit record |
| `subscriptions` → `polling_tasks` | 1:N | Subscription can have multiple polling tasks |
| `station_metadata` → `station_verification_queue` | 1:1 | Price verification queue |

---

## 3. Table Descriptions

### 3.1 `station_metadata` — Reference Data

**Purpose**: Static/semi-static station info (location, name, socket types, pricing flags).

| Column | Type | Notes |
|---|---|---|
| `cp_id` | int4 PK | Charge Point ID (Iberdrola internal) |
| `cupr_id` | int4 UNIQUE | CUPR ID (used for API requests) |
| `name` | text | Human-readable station name |
| `latitude`, `longitude` | numeric | Geo coordinates |
| `address_full` | text | Full address string |
| `provider` | text | Default `'iberdrola'` |
| `is_free` | boolean | Whether station charges no fee |
| `verification_state` | text | `unprocessed` / `verified_free` / `verified_paid` / `failed` / `dead_letter` |
| `port1_socket_details` | jsonb | Socket type, max power, connector info |
| `port2_socket_details` | jsonb | Same for port 2 |
| `overall_status` | text | Last known operational status |
| `total_ports` | int4 | Number of ports |

**Update frequency**: Rare (scraper upserts on discovery, verification updates `is_free`).

---

### 3.2 `station_snapshots` — Live Status Data

**Purpose**: Current port status, power, pricing. Single row per station (UPSERT model).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `cp_id` | int4 FK, UNIQUE | One snapshot per station |
| `source` | enum | `scraper` / `user_nearby` / `user_station` |
| `observed_at` | timestamptz | When Iberdrola last reported this data |
| `payload_hash` | text | MD5 of payload for dedup |
| `port1_status` / `port2_status` | text | `AVAILABLE` / `OCCUPIED` / `CLOSED` |
| `port1_power_kw` / `port2_power_kw` | numeric | Current charging power |
| `port1_price_kwh` / `port2_price_kwh` | numeric | Price per kWh |
| `overall_status` | text | Station operational status |
| `emergency_stop_pressed` | boolean | Emergency stop flag |
| `situation_code` | text | `OPER` / `MAINT` / `OOS` |

**Update frequency**: Every 5+ minutes per monitored station (throttled).

**Key design decision**: `UNIQUE(cp_id)` — only the latest snapshot is stored.
Old rows are replaced via UPSERT (`ON CONFLICT (cp_id) DO UPDATE`).
This keeps the table small (~2,700 rows max = one per station).

---

### 3.3 `snapshot_throttle` — Rate Limiter

**Purpose**: Prevents scraper from being triggered too often for the same station.

| Column | Type | Notes |
|---|---|---|
| `cp_id` | int4 PK, FK | Station reference |
| `last_payload_hash` | text | Hash of last saved payload |
| `last_snapshot_at` | timestamptz | When last snapshot was saved |

**Logic**: `should_store_snapshot(cp_id, hash, 5)` — allows new snapshot if:
- No previous record exists
- Payload hash changed (data actually changed)
- 5 minutes elapsed since last snapshot

---

### 3.4 `subscriptions` — Push Notification Targets

**Purpose**: Web Push subscription endpoints for port availability notifications.

**Key columns**: `station_id`, `port_number`, `target_status`, `endpoint` (Web Push URL), `p256dh` + `auth` (encryption keys).

**Unique constraint**: `(station_id, port_number, endpoint) WHERE is_active = true`

---

### 3.5 `polling_tasks` — Background Monitoring Jobs

**Purpose**: Long-running tasks that periodically check station status until target condition is met.

**State machine**: `pending` → `running` → `completed` / `cancelled` / `expired` / `dispatching`

**Lifecycle**: Created when user subscribes to notifications. Cron-driven Edge Function processes active tasks, dispatches GitHub Actions scraper, checks for target status change.

---

### 3.6 `geo_search_throttle` — Search Rate Limiter

**Purpose**: Prevents duplicate geo-search GitHub Actions for the same bounding box.

**Key**: `bbox_key` (text hash of bounding box coordinates), cooldown 5 minutes.

---

### 3.7 `station_verification_queue` — Price Verification

**Purpose**: Queue for verifying whether stations are free or paid.

**State machine**: `pending` → `processing` (with lock). Exponential backoff on failures, max 2 retries.

---

## 4. Data Flow: Scraper → DB → Frontend

### 4.1 Station Detail View

```
User opens station
         │
         ▼
┌─ useStationData(cpId, cuprId) ─────────────────────────┐
│                                                          │
│  1. PARALLEL FETCH (Supabase REST)                       │
│     ├── getLatestSnapshot(cpId)   → station_snapshots    │
│     └── getStationMetadata(cpId)  → station_metadata     │
│                                                          │
│  2. CHECK FRESHNESS                                      │
│     └── isDataStale(observed_at, TTL=5min)               │
│         ├── Fresh → state='ready', show data             │
│         └── Stale → show stale data, continue ↓         │
│                                                          │
│  3. SUBSCRIBE TO REALTIME (immediately)                  │
│     └── channel: station_snapshots_{cpId}                │
│         event: INSERT, filter: cp_id=eq.{cpId}           │
│                                                          │
│  4. POLL STATION (if stale)                              │
│     └── POST /poll-station { cupr_id }                   │
│         ├── Edge returns cached data + meta              │
│         ├── meta.scraper_triggered=true                  │
│         └── Edge dispatches GitHub Action (async)        │
│                                                          │
│  5. GITHUB ACTION (30-60 sec later)                      │
│     ├── Fetch from Iberdrola API                         │
│     ├── POST /save-snapshot                              │
│     └── UPSERT into station_snapshots                    │
│                                                          │
│  6. REALTIME delivers INSERT/UPDATE event                │
│     └── UI updates with fresh data                       │
│                                                          │
│  7. FALLBACK (if Realtime silent after 40s)              │
│     └── Re-fetch snapshot from DB                        │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Nearby Search

```
User searches radius
         │
         ▼
┌─ useStationSearch() ───────────────────────────────────┐
│                                                         │
│  1. Get user geolocation                                │
│                                                         │
│  2. POST /search-nearby { lat, lon, radiusKm }          │
│     └── Edge Function:                                  │
│         ├── RPC search_stations_nearby() → cached data  │
│         ├── Check geo_search_throttle (5 min bbox)      │
│         ├── If not throttled → dispatch geo-search.yml  │
│         └── Enqueue unverified stations for pricing     │
│                                                         │
│  3. Show cached results immediately                     │
│                                                         │
│  4. If scraper_triggered → auto-retry after 25s         │
│     └── Silent refetch (no loading spinner)             │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Push Notifications

```
┌─ Polling Engine ───────────────────────────────────────┐
│                                                         │
│  Cron: station-verification-run (every 1 min)           │
│     └── POST /station-verification { mode: "run" }      │
│                                                         │
│  process-polling Edge Function:                         │
│     ├── Get active polling_tasks                        │
│     ├── For each task → dispatch scraper                │
│     ├── Check if target status reached                  │
│     └── If matched → send-push-notification             │
│                                                         │
│  DB Trigger: trigger_port_available                      │
│     └── On station_snapshots UPDATE:                    │
│         If port OCCUPIED → AVAILABLE                    │
│         → HTTP POST /send-push-notification             │
│         → Web Push to subscriber endpoint               │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Edge Functions

| Function | JWT | Purpose | Trigger |
|---|---|---|---|
| `poll-station` | No | Return cached snapshot + dispatch scraper | Frontend (useStationData) |
| `search-nearby` | Yes | Geo search + dispatch geo scraper | Frontend (useStationSearch) |
| `save-snapshot` | Yes | UPSERT snapshot from scraper | GitHub Actions |
| `enrich-stations` | Yes | Batch enrich metadata | GitHub Actions |
| `station-details` | Yes | Get station with snapshot (RPC wrapper) | Frontend |
| `save-subscription` | No | Save Web Push subscription | Frontend |
| `check-subscription` | No | Check if subscription exists | Frontend |
| `start-watch` | Yes | Create polling task for notifications | Frontend |
| `send-push-notification` | Yes | Send Web Push via endpoint | DB trigger / polling engine |
| `station-verification` | Yes | Verify if station is free/paid | Cron (every 1-5 min) |
| `process-polling` | Yes | Process active polling tasks | Cron |

### Edge Function → DB Interaction

```
poll-station:
  READ   station_metadata (cp_id lookup)
  READ   station_snapshots (latest snapshot)
  READ   snapshot_throttle (rate limit check)
  WRITE  snapshot_throttle (update last check time)

save-snapshot:
  CALL   should_store_snapshot() (dedup check)
  UPSERT station_snapshots (save or update)
  UPSERT snapshot_throttle (update hash + timestamp)
  UPSERT station_metadata (update if new fields)

search-nearby:
  CALL   search_stations_nearby() (geo query)
  READ   geo_search_throttle (rate limit check)
  WRITE  geo_search_throttle (update timestamp)
  CALL   enqueue_verification_candidates() (queue unverified)
```

---

## 6. WebSocket Subscriptions (Realtime)

### Configuration

Realtime is enabled on `station_snapshots` table (migration `enable_realtime_snapshots`).

### Subscription Pattern

```typescript
supabase
  .channel(`station_snapshots_${cpId}`)
  .on('postgres_changes', {
    event: 'INSERT',    // Triggered by UPSERT (ON CONFLICT DO UPDATE)
    schema: 'public',
    table: 'station_snapshots',
    filter: `cp_id=eq.${cpId}`
  }, onUpdate)
  .subscribe()
```

### How It Works

1. Scraper UPSERTs into `station_snapshots`
2. PostgreSQL WAL captures the change
3. Supabase Realtime reads WAL and broadcasts to matching channels
4. Frontend receives payload with new snapshot data
5. `applyIfNewer()` guard ensures only newer data replaces current

### Connection State Machine

```
disconnected → connecting → connected
                    ↓            ↓
                 error  ←→  reconnecting
```

Reconnection: exponential backoff 1s → 2s → 4s → ... → 30s (cap), max 10 attempts.

### Important Notes

- Realtime uses WAL, **not indexes** — filter is applied after WAL scan
- `cp_id=eq.{N}` filter reduces network traffic but not server-side load
- Each active station view = 1 WebSocket channel
- Channel is closed on component unmount (`channel.unsubscribe()`)

---

## 7. RPC Functions

### Data Access

| Function | Purpose | Called By |
|---|---|---|
| `get_station_with_snapshot(cp_id, cupr_id)` | JOIN metadata + latest snapshot | Edge: station-details |
| `search_stations_nearby(lat, lon, radius, only_free)` | Geo search with Haversine distance | Edge: search-nearby |
| `get_last_station_status(cp_id)` | Latest snapshot for a station | Edge: poll-station |

### Throttling / Dedup

| Function | Purpose | Called By |
|---|---|---|
| `should_store_snapshot(cp_id, hash, minutes)` | Check if snapshot should be saved | Edge: save-snapshot |
| `compute_snapshot_hash(...)` | Deterministic hash of snapshot payload | Edge: save-snapshot |
| `can_poll_station(cupr_id)` | Check if polling is allowed (rate limit) | Edge: poll-station |

### Polling Engine

| Function | Purpose | Called By |
|---|---|---|
| `create_polling_task(...)` | Create new polling task | Edge: start-watch |
| `get_active_polling_tasks()` | Get tasks to process | Edge: process-polling |
| `get_expired_polling_tasks()` | Get tasks past expiry | Edge: process-polling |
| `process_polling_tasks()` | Batch process active tasks | Cron |

### Verification

| Function | Purpose | Called By |
|---|---|---|
| `claim_verification_batch(batch_size)` | Lock N items from queue | Edge: station-verification |
| `enqueue_verification_candidates()` | Add unverified stations to queue | Edge: search-nearby |
| `auto_enqueue_unprocessed()` | Enqueue all unprocessed stations | Manual / cron |
| `reconcile_verification_queue()` | Clean stale locks, retry failed | Cron |
| `mark_processing_timeout()` | Reset stuck processing items | reconcile |

### Maintenance

| Function | Purpose | Called By |
|---|---|---|
| `cleanup_old_snapshots()` | DELETE snapshots older than 3 months | Cron (daily 03:00) |

---

## 8. Indexes

### station_snapshots

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `station_snapshots_pkey` | `id` | UNIQUE btree | Primary key |
| `station_snapshots_cp_id_unique` | `cp_id` | UNIQUE btree | One snapshot per station |
| `idx_snapshots_cp_observed` | `cp_id, observed_at DESC` | btree | Fetch latest by station |
| `idx_snapshots_created` | `created_at` | btree | Cleanup query, TTL checks |
| `idx_snapshots_hash` | `cp_id, payload_hash` | btree | Dedup check |
| `idx_snapshots_source` | `source` | btree | Filter by source type |

### station_metadata

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `station_metadata_pkey` | `cp_id` | UNIQUE btree | Primary key |
| `station_metadata_cupr_id_key` | `cupr_id` | UNIQUE btree | Lookup by CUPR ID |
| `idx_station_metadata_location` | `latitude, longitude` | btree | Geo bounding box queries |
| `idx_station_metadata_verification_state` | `verification_state` | btree | Filter unverified stations |

### polling_tasks

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_polling_tasks_active` | `status` WHERE pending/running | PARTIAL btree | Active tasks query |
| `idx_polling_tasks_subscription_id` | `subscription_id` | btree | FK lookup |

### subscriptions

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_subscriptions_station_port_active` | `station_id, port_number` WHERE active | PARTIAL btree | Active subs lookup |
| `subscriptions_unique_active` | `station_id, port_number, endpoint` WHERE active | UNIQUE PARTIAL | Prevent duplicates |

### station_verification_queue

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_station_verification_queue_status_next_attempt` | `status, next_attempt_at` | btree | Claim next batch |
| `idx_station_verification_queue_cupr_id` | `cupr_id` | btree | Lookup by CUPR |

---

## 9. Row-Level Security (RLS)

All tables have RLS enabled.

### Access Matrix

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `station_metadata` | SELECT | SELECT | SELECT, INSERT, UPDATE |
| `station_snapshots` | SELECT | SELECT | ALL (via `true` policy) |
| `snapshot_throttle` | — | — | SELECT, INSERT, UPDATE (`true`) |
| `subscriptions` | — | — | ALL (service_role only) |
| `polling_tasks` | — | — | ALL (service_role only) |
| `geo_search_throttle` | — | — | ALL (service_role only) |
| `station_verification_queue` | — | — | ALL (service_role only) |

### Design Rationale

- **Public read** for `station_metadata` and `station_snapshots` — the app is anonymous (no auth)
- **Service-role only write** — all mutations go through Edge Functions with service_role key
- **No user-level auth** — simplified model, security enforced at Edge Function layer
- Policies use `(SELECT auth.role()) = 'service_role'` with InitPlan optimization (migration `policy_initplan_optimization`)

---

## 10. Cron Jobs & Maintenance

| Job | Schedule | Action |
|---|---|---|
| `cleanup-old-snapshots` | Daily 03:00 UTC | `DELETE FROM station_snapshots WHERE created_at < NOW() - 3 months` |
| `station-verification-run` | Every 1 min | POST to `/station-verification` (mode: run, batch_size: 1) |
| `station-verification-reconcile` | Every 5 min | POST to `/station-verification` (mode: reconcile) |

### Data Retention

- `station_snapshots`: 3-month retention (cron cleanup)
- `snapshot_throttle`: No cleanup needed (one row per station, UPSERT)
- `polling_tasks`: Expire after 12 hours (`expires_at` column)
- `geo_search_throttle`: No cleanup (small table, one row per bbox_key)

---

## 11. Throttling & Deduplication

### Three-Layer Throttle

```
Layer 1: Client-side (rateLimitCache.ts)
  └── Track retry_after locally, prevent premature requests

Layer 2: Edge Function (snapshot_throttle table)
  └── should_store_snapshot(cp_id, hash, 5 min)
      ├── Hash changed → allow (data actually different)
      ├── 5 min elapsed → allow (time-based refresh)
      └── Same hash, < 5 min → deny (duplicate)

Layer 3: GitHub Actions dispatch
  └── geo_search_throttle (bbox-based, 5 min cooldown)
  └── Prevents duplicate workflow runs for same area
```

### Dedup Logic (`should_store_snapshot`)

```sql
-- Returns TRUE if snapshot should be saved:
-- 1. No previous record for this cp_id
-- 2. Payload hash changed (actual data difference)
-- 3. Same hash but 5+ minutes since last save
```

This ensures:
- Identical data is not re-saved within 5 minutes
- Changed data is always saved immediately
- Even unchanged data gets a periodic refresh

---

## 12. Performance Risks & Mitigations

### Risk 1: `search_stations_nearby` Full Table Scan

**Problem**: Haversine distance calculation on every row in `station_metadata` (2,679 rows).

**Current state**: B-tree index on `(latitude, longitude)` — helps with bounding box pre-filter, but Haversine itself is computed row-by-row.

**Mitigation options**:
- Current scale (< 3K rows) → acceptable performance (< 50ms)
- At 10K+ rows → consider PostGIS extension with `ST_DWithin()` and GiST index
- At 50K+ rows → materialized view with pre-computed distances for common search centers

### Risk 2: Realtime WAL Overhead

**Problem**: Supabase Realtime reads PostgreSQL WAL for all changes. High write volume on `station_snapshots` increases WAL size.

**Current state**: Low risk — UPSERT model means ~1 write per station per 5 min. With 180 active stations, that's ~36 writes/hour.

**Mitigation**: If monitoring expands to thousands of stations:
- Consider disabling Realtime on `station_snapshots` and using polling instead
- Or use Supabase Broadcast (not tied to DB) for custom events

### Risk 3: Trigger-Based Push Notifications

**Problem**: `notify_subscribers_on_port_available()` trigger makes HTTP calls (`net.http_post`) inside a transaction. Network latency blocks the transaction.

**Current state**: The trigger uses `PERFORM` (fire-and-forget via `pg_net`), so it doesn't block.

**Mitigation**: If HTTP failures cause issues:
- Switch to an outbox pattern: INSERT into `notification_outbox` table, process asynchronously
- `select_outbox_pending()` RPC already exists (partial migration toward this pattern)

### Risk 4: Index Bloat on High-UPSERT Table

**Problem**: `station_snapshots` has 6 indexes. Each UPSERT updates all 6, generating write amplification.

**Current state**: With UNIQUE constraint on `cp_id`, table stays at ~2,700 rows. Index maintenance cost is minimal.

**Mitigation**:
- Monitor with `pg_stat_user_indexes` (check `idx_scan` for unused indexes)
- `idx_snapshots_source` and `idx_snapshots_hash` may be candidates for removal if unused
- Consider `fillfactor = 90` for HOT updates (Heap-Only Tuple optimization)

### Risk 5: Cron Job Contention

**Problem**: `station-verification-run` fires every minute, `station-verification-reconcile` every 5 minutes. Both touch `station_verification_queue` with locks.

**Current state**: `claim_verification_batch` uses `FOR UPDATE SKIP LOCKED` — safe concurrent access.

**Mitigation**: Already handled. If batch_size increases, consider advisory locks.

---

## 13. Scalability Considerations

### Current Scale

| Metric | Value |
|---|---|
| Total stations | ~2,679 |
| Active monitored stations | ~180 |
| Snapshots per day | ~2,000 (estimate) |
| Table sizes | All < 3K rows |
| Concurrent WebSocket channels | 1-5 (single user app) |

### Growth Scenarios

#### Scenario A: More Stations (10K-50K)

**Impact**: `search_stations_nearby` becomes slow.

**Actions needed**:
1. Enable PostGIS: `CREATE EXTENSION postgis`
2. Add geography column: `ALTER TABLE station_metadata ADD COLUMN geog geography(POINT, 4326)`
3. Create spatial index: `CREATE INDEX idx_metadata_geog ON station_metadata USING GIST(geog)`
4. Rewrite distance query with `ST_DWithin(geog, ST_MakePoint(lon, lat)::geography, radius_m)`

#### Scenario B: More Concurrent Users (100+)

**Impact**: WebSocket connections saturate Realtime.

**Actions needed**:
1. Supabase Free tier: 200 concurrent connections
2. Consider shared channels (broadcast per region instead of per station)
3. Add connection pooling (Supavisor is built-in on Supabase)

#### Scenario C: Historical Analytics

**Impact**: Need to keep historical snapshots (currently only latest is stored).

**Actions needed**:
1. Separate `station_snapshots_history` table (append-only)
2. Partition by month: `PARTITION BY RANGE (observed_at)`
3. Add aggregate materialized view for hourly/daily stats
4. Keep current `station_snapshots` as "latest only" (fast reads)

---

## Appendix: Migration History

60+ migrations applied (Jan 2026 — Feb 2026). Key milestones:

| Date | Migration | Significance |
|---|---|---|
| Jan 23 | `create_station_metadata_table` | Initial schema |
| Jan 25 | `create_station_snapshots` | Snapshot architecture |
| Jan 25 | `enable_realtime_snapshots` | WebSocket support |
| Jan 28 | `add_push_notification_trigger` | DB trigger for notifications |
| Jan 30 | `add_search_stations_nearby_function` | Geo search RPC |
| Feb 01 | `create_polling_tasks_table` | Notification polling engine |
| Feb 01 | `create_geo_search_throttle` | Search rate limiting |
| Feb 15 | `security_performance_hardening` | RLS optimization, initplan |
| Feb 15 | `verification_queue_mvp` | Price verification system |
| Feb 15 | `notification_polling_engine` | Full polling lifecycle |
| Feb 20 | `create_auto_enqueue_unprocessed_rpc` | Bulk verification enqueue |
