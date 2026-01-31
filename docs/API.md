# API Documentation: Iberdrola EV Charger Monitor

## Overview

This document describes the API architecture for the Iberdrola EV Charger Monitor application. The app uses a hybrid architecture combining:

- **Supabase** as the primary data store and real-time engine
- **Edge Functions** for server-side operations
- **Local JSON library** as an offline fallback

---

## 1. Database Schema (Supabase)

### Tables

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `station_snapshots` | Current and historical station status data | `id` (UUID) |
| `station_metadata` | Static station info (location, address, IDs) | `cp_id` |
| `snapshot_throttle` | Deduplication table (5-min TTL) | `cp_id` |

### station_snapshots

```sql
CREATE TABLE station_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cp_id INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scraper', 'user_nearby', 'user_station')),
  observed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  payload_hash TEXT,
  port1_status TEXT,
  port1_power_kw NUMERIC,
  port1_price_kwh NUMERIC DEFAULT 0,
  port1_update_date TIMESTAMP WITH TIME ZONE,
  port2_status TEXT,
  port2_power_kw NUMERIC,
  port2_price_kwh NUMERIC DEFAULT 0,
  port2_update_date TIMESTAMP WITH TIME ZONE,
  overall_status TEXT,
  emergency_stop_pressed BOOLEAN DEFAULT false,
  situation_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_snapshots_cp_id ON station_snapshots(cp_id);
CREATE INDEX idx_snapshots_created_at ON station_snapshots(created_at);
```

### station_metadata

```sql
CREATE TABLE station_metadata (
  cp_id INTEGER PRIMARY KEY,
  cupr_id INTEGER NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  address_full TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### snapshot_throttle

```sql
CREATE TABLE snapshot_throttle (
  cp_id INTEGER PRIMARY KEY,
  last_payload_hash TEXT,
  last_snapshot_at TIMESTAMP WITH TIME ZONE
);
```

---

## 2. Supabase RPC Functions

### search_stations_nearby

Search stations within a radius using PostGIS-style distance calculation.

```sql
CREATE FUNCTION search_stations_nearby(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION,
  p_only_free BOOLEAN DEFAULT true
) RETURNS TABLE (
  cp_id INTEGER,
  cupr_id INTEGER,
  name TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  address TEXT,
  socket_type TEXT,
  max_power NUMERIC,
  price_kwh NUMERIC,
  total_ports INTEGER,
  free BOOLEAN,
  distance_km DOUBLE PRECISION
);
```

### compute_snapshot_hash

Computes a hash of snapshot data for deduplication.

```sql
CREATE FUNCTION compute_snapshot_hash(
  p1_status TEXT,
  p1_power NUMERIC,
  p1_price NUMERIC,
  p2_status TEXT,
  p2_power NUMERIC,
  p2_price NUMERIC,
  overall TEXT,
  emergency BOOLEAN,
  situation TEXT
) RETURNS TEXT;
```

### should_store_snapshot

Checks if a new snapshot should be stored (throttle logic).

```sql
CREATE FUNCTION should_store_snapshot(
  p_cp_id INTEGER,
  p_hash TEXT,
  p_minutes INTEGER DEFAULT 5
) RETURNS BOOLEAN;
```

---

## 3. Edge Functions

### POST /functions/v1/save-snapshot

Saves a new station snapshot with throttling and deduplication.

**Request:**
```typescript
interface SaveSnapshotRequest {
  cpId: number;
  cuprId: number;
  source: 'user_nearby' | 'user_station';
  stationData: {
    cpName?: string;
    latitude?: number;
    longitude?: number;
    addressFull?: string;
    port1Status?: string;
    port1PowerKw?: number;
    port1PriceKwh?: number;
    port1UpdateDate?: string;
    port1SocketType?: string;
    port2Status?: string;
    port2PowerKw?: number;
    port2PriceKwh?: number;
    port2UpdateDate?: string;
    port2SocketType?: string;
    overallStatus?: string;
    emergencyStopPressed?: boolean;
    situationCode?: string;
  };
}
```

**Response:**
```typescript
interface SaveSnapshotResponse {
  success: boolean;
  stored: boolean; // false if throttled
}
```

**Headers Required:**
```
Content-Type: application/json
Authorization: Bearer <SUPABASE_ANON_KEY>
```

---

## 4. Frontend Data Access Patterns

### Direct Supabase Queries

#### Get Latest Snapshot
```typescript
// File: api/charger.ts
GET /rest/v1/station_snapshots?select=*&cp_id=eq.{cpId}&order=observed_at.desc&limit=1
```

#### Get Station Metadata
```typescript
// File: api/charger.ts
GET /rest/v1/station_metadata?select=cp_id,cupr_id,latitude,longitude,address_full&cp_id=eq.{cpId}&limit=1
```

#### Batch Cache Lookup (with TTL)
```typescript
// File: src/services/stationApi.ts
// getStationsFromCache() - Fetches snapshots for multiple stations within TTL

const ttlAgo = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

// Parallel queries:
GET /rest/v1/station_snapshots?cp_id=in.({cpIds})&created_at=gte.{ttlAgo}&order=created_at.desc
GET /rest/v1/station_metadata?cp_id=in.({cpIds})
```

#### Geo-based Cache Query
```typescript
// File: src/services/stationApi.ts
// loadStationsFromCacheNearLocation() - Bounding box query

GET /rest/v1/station_metadata
  ?latitude=gte.{lat-delta}
  &latitude=lte.{lat+delta}
  &longitude=gte.{lon-delta}
  &longitude=lte.{lon+delta}
  &limit=100
```

---

## 5. Real-time Subscriptions

### Snapshot Updates

```typescript
// File: api/charger.ts - subscribeToSnapshots()

supabase
  .channel(`station_snapshots_${cpId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'station_snapshots',
    filter: `cp_id=eq.${cpId}`,
  }, callback)
  .subscribe();
```

### Connection State Machine

```
States: disconnected -> connecting -> connected -> reconnecting -> error

Transitions:
- disconnected -> connecting (subscription initiated)
- connecting -> connected (SUBSCRIBED callback)
- connecting -> error (CHANNEL_ERROR/TIMED_OUT)
- connected -> disconnected (channel closed)
- error/disconnected -> reconnecting (auto-reconnect)
- reconnecting -> connected (success)
```

### Auto-Reconnection (Exponential Backoff)

- Initial delay: 1 second
- Max delay: 30 seconds
- Max attempts: 10
- Backoff formula: `min(2^attempt * 1000, 30000)ms`

---

## 6. Push Notifications API

### POST /functions/v1/save-subscription

Saves push notification subscription to backend.

**Request:**
```typescript
{
  stationId: string;
  portNumber?: number;
  subscription: PushSubscription;
}
```

**Headers:**
```
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

**Retry Logic:**
- Max attempts: 3
- Delay: 1s, 2s, 3s (linear backoff)
- No retry on 4xx errors

---

## 7. Data Flow Diagrams

### Primary Station Data Flow

```
User selects station (cpId, cuprId)
         |
         v
+---------------------------------------------+
|           useStationData Hook               |
|                                             |
|  1. Set state: 'loading_cache'              |
|  2. Parallel fetch:                         |
|     - getLatestSnapshot(cpId)               |
|     - getStationMetadata(cpId)              |
|  3. Check freshness: isDataStale(TTL=15min) |
|                                             |
|  +-----------+--------------------------+   |
|  | Fresh     | Stale/Missing            |   |
|  |           |                          |   |
|  | Use cache | Set state: 'loading_api' |   |
|  |           | fetchStationViaEdge()    |   |
|  +-----------+--------------------------+   |
|                                             |
|  4. Subscribe to realtime (immediate)       |
|  5. Set state: 'ready' or 'error'           |
+---------------------------------------------+
         |
         v
    React Component renders data
         |
         v
    Realtime updates (INSERT events)
         |
         v
    Merge if newer (timestamp check)
```

### Search Flow

```
User clicks "Find Stations"
         |
         v
+---------------------------------------------+
|          useStationSearch Hook              |
|                                             |
|  1. Get user geolocation                    |
|  2. Priority chain:                         |
|                                             |
|  +-------------------------------------+    |
|  | 1. searchLocalStations (Supabase RPC)|   |
|  |    v (if fails)                      |   |
|  | 2. Local JSON library fallback       |   |
|  +-------------------------------------+    |
|                                             |
|  3. If API mode (deprecated):               |
|     - Batch cache lookup                    |
|     - Enrich from cache (TTL=15min)         |
|     - Save FREE stations to DB              |
|                                             |
+---------------------------------------------+
         |
         v
    Display StationResultCard[]
```

---

## 8. TypeScript Types

### Core Types

```typescript
// File: types/charger.ts

interface ChargerStatus {
  id: string;
  created_at: string;
  cp_id: number;
  cp_name: string;
  schedule: string | null;
  port1_status: string | null;
  port2_status: string | null;
  port1_power_kw: number | null;
  port1_update_date: string | null;
  port2_power_kw: number | null;
  port2_update_date: string | null;
  overall_status: string | null;
  overall_update_date: string | null;
  cp_latitude?: number | null;
  cp_longitude?: number | null;
  address_full?: string | null;
  port1_price_kwh?: number | null;
  port2_price_kwh?: number | null;
  port1_socket_type?: string | null;
  port2_socket_type?: string | null;
  emergency_stop_pressed?: boolean | null;
  situation_code?: string | null;
}

type StationDataState =
  | 'idle'          // No station selected
  | 'loading_cache' // Fetching from Supabase
  | 'loading_api'   // Fetching from Edge
  | 'ready'         // Data available
  | 'error';        // Error occurred

interface StationDataStatus {
  state: StationDataState;
  data: ChargerStatus | null;
  error: string | null;
  connectionState: RealtimeConnectionState;
  hasRealtime: boolean;
  isStale: boolean;
}
```

### Realtime Types

```typescript
// File: types/realtime.ts

type RealtimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface SubscriptionResult {
  unsubscribe: () => void;
  getConnectionState: () => RealtimeConnectionState;
}
```

### Search Types

```typescript
// File: src/services/iberdrola.ts

interface StationInfoPartial {
  cpId: number;
  cuprId: number;
  name: string;
  latitude: number;
  longitude: number;
  addressFull: string;
  overallStatus: string;
  totalPorts: number;
  maxPower?: number;
  freePorts?: number;
  priceKwh?: number;
  socketType?: string;
  emergencyStopPressed?: boolean;
  supportsReservation?: boolean;
  _fromCache?: boolean;
}

interface CachedStationInfo {
  cpId: number;
  cuprId: number;
  name: string;
  latitude: number;
  longitude: number;
  maxPower: number;
  freePorts: number;
  addressFull: string;
  socketType: string;
  priceKwh: number;
  emergencyStopPressed: boolean;
}
```

---

## 9. Environment Variables

```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...

# Push Notifications
VITE_VAPID_PUBLIC_KEY=BM...
VITE_SAVE_SUBSCRIPTION_URL=/functions/v1/save-subscription
VITE_CHECK_SUB_URL=/functions/v1/check-subscription
```

---

## 10. Known Limitations

1. **Iberdrola API Blocked**: Direct API calls return 403. All data comes from Supabase cache.
2. **Edge Functions Limited**: Cannot fetch from Iberdrola API (IP blocked).
3. **Only FREE Stations Cached**: Paid stations are filtered out in cache operations.

---

## 11. Key Files Reference

| Category | File | Purpose |
|----------|------|---------|
| Supabase Client | `api/supabase.ts` | Client initialization |
| Charger API | `api/charger.ts` | Snapshots, metadata, subscriptions |
| Station API | `src/services/stationApi.ts` | Cache functions, Edge calls |
| Iberdrola Service | `src/services/iberdrola.ts` | Types, extractors (API deprecated) |
| Local Search | `src/services/localSearch.ts` | Supabase RPC + JSON fallback |
| Station Data Hook | `src/hooks/useStationData.ts` | TTL-based data loading |
| Search Hook | `src/hooks/useStationSearch.ts` | Geo search with enrichment |
| Edge Function | `supabase/functions/save-snapshot/index.ts` | Snapshot persistence |
| PWA | `src/pwa.ts` | Push subscription management |
| Types | `types/charger.ts`, `types/realtime.ts` | Core type definitions |
