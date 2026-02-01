# Data Flow Architecture

## Data Flow Diagram

```
Supabase (station_snapshots + station_metadata) → useCharger hook → React state → UI
                                ↓
                         Real-time subscription (station_snapshots)
                                ↓
                    API Fallback (Edge Function) → saves to snapshots
```

## Key Implementation Files

- **[api/charger.ts](../api/charger.ts)** - Supabase queries + real-time subscriptions
- **[hooks/useCharger.ts](../hooks/useCharger.ts)** - React hook wrapping API calls
- **[src/context/PrimaryStationContext.tsx](../src/context/PrimaryStationContext.tsx)** - Station context with API fallback
- **[src/services/stationApi.ts](../src/services/stationApi.ts)** - Edge Function client + snapshot caching

## Database Schema

### Tables

| Table               | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `station_snapshots` | Primary table for station status (port statuses, power, prices, emergency stop) |
| `station_metadata`  | Reference data (rarely changes): coordinates, address, cupr_id mapping          |
| `snapshot_throttle` | Deduplication table for snapshot storage (5-min TTL)                            |

## Extended Data Fields

### Station Metadata (from Iberdrola API)

- `address_full` - Full address string (street, number, town, region)
- `situation_code` - Station status (OPER/MAINT/OOS)
- `emergency_stop_pressed` - Emergency stop indicator (boolean)
- `cp_latitude`, `cp_longitude` - Station coordinates

### Port Details

- `port1_socket_type`, `port2_socket_type` - Socket type (e.g., "Mennekes (Type 2)")
- `port1_price_kwh`, `port2_price_kwh` - Charging price (€/kWh, 0 = free)
- `port1_power_kw`, `port2_power_kw` - Power rating (kW)

## UI Components for Data Display

- **[ChargingStationInfo](../src/components/ChargingStationInfo.tsx)** - Shows address, emergency/maintenance alerts
- **[PortCard](../src/components/PortCard.tsx)** - Shows socket type, pricing (FREE chip or €X.XXXX/kWh)
- **[StationResultCard](../src/components/search/StationResultCard.tsx)** - Search result card with skeleton loading

## Real-time Updates

- Subscribe to INSERT events on `station_snapshots` table
- UI updates every minute via `setInterval` - implemented in [App.tsx](../src/App.tsx)

### Connection State Management

The realtime subscription uses a state machine to track WebSocket connection status:

| State          | Description                    | UI Indicator       |
| -------------- | ------------------------------ | ------------------ |
| `disconnected` | No active connection           | Red "Offline" chip |
| `connecting`   | Initial connection attempt     | Yellow spinner     |
| `connected`    | Active WebSocket connection    | Green "Live" chip  |
| `reconnecting` | Auto-reconnect in progress     | Yellow spinner     |
| `error`        | Max reconnect attempts reached | Red "Error" chip   |

**Key files:**

- **[types/realtime.ts](../types/realtime.ts)** - Connection state types
- **[src/utils/reconnectionManager.ts](../src/utils/reconnectionManager.ts)** - Exponential backoff logic
- **[src/components/common/ConnectionIndicator.tsx](../src/components/common/ConnectionIndicator.tsx)** - UI component

### Auto-Reconnection

When WebSocket connection fails, `ReconnectionManager` handles automatic reconnection:

- **Exponential backoff**: 1s → 2s → 4s → 8s → 16s → 30s (capped)
- **Max attempts**: 10 (configurable)
- **Reset on success**: Counter resets when connection succeeds

```typescript
// Usage in useStationData
const reconnectionManager = new ReconnectionManager();

// On disconnect/error
reconnectionManager.scheduleReconnect(() => {
  subscription.unsubscribe();
  createNewSubscription();
});

// On successful connection
reconnectionManager.reset();
```

## TTL-Based Freshness Architecture

### Overview

Station data uses TTL-based freshness check (5 minutes) instead of null-based fallback. This ensures users always see recent data.

### Data Flow

```
User selects station
    ↓
useStationData hook triggered
    ↓
Fetch snapshot + metadata (parallel)
    ↓
Check freshness: isDataStale(snapshot.created_at, TTL=5min)
    ├─ Fresh (< 5min) → Use cache, skip Edge
    └─ Stale (≥ 5min) OR missing → Call Edge
    ↓
Subscribe to realtime (immediately, not after load)
    ↓
Merge realtime updates (only if newer than current)
```

### State Machine

The architecture uses a state machine instead of multiple boolean flags:

- **idle**: No station selected
- **loading_cache**: Fetching from Supabase
- **loading_api**: Fetching from Edge via poll-station
- **ready**: Data available
- **error**: Error occurred

Additional state fields for rate limiting:
- **isRateLimited**: true if last poll was rate limited
- **nextPollIn**: seconds until next poll allowed (from retry_after)

### Key Functions

- **`isDataStale(createdAt, ttlMinutes)`** - Utility for freshness checking ([src/utils/time.ts](../src/utils/time.ts))
- **`useStationData(cpId, cuprId, ttl)`** - Main data management hook ([hooks/useStationData.ts](../hooks/useStationData.ts))
- **`getFreshSnapshot(cpId, ttl)`** - Unified cache lookup ([src/services/stationApi.ts](../src/services/stationApi.ts))
- **`getFreshSnapshots(cpIds, ttl)`** - Batch cache lookup

### Benefits

- ~50% reduction in Edge function calls
- Consistent behavior between Station and Search features
- Better offline handling
- Clear loading states with state machine

## Caching Strategy

### TTL-Based Freshness

All station data uses 15-minute TTL (Time-To-Live):

**Freshness check**:

```typescript
const ageMs = Date.now() - new Date(created_at).getTime();
const isFresh = ageMs <= 15 * 60 * 1000; // < 15 minutes
```

**Cache sources**:

- `station_snapshots` table - enrichment data (maxPower, price, socketType)
- `station_metadata` table - location data (lat, lng, address)

**Cache strategies**:

1. **Primary station**: Individual cache lookup + freshness check
2. **Search enrichment**: Batch cache lookup (1 query for all stations)

**Performance metrics**:

- Cache hit rate: >90% on repeated searches within 15 minutes
- Database queries: 1 query (batch) instead of N queries (individual)
- API request reduction: ~90% on repeated searches

**See**: [.claude/caching-strategy.md](caching-strategy.md) for detailed documentation

## Edge Function Integration

### API Client

The frontend uses a unified API client for Edge Function calls:

**File**: [src/services/apiClient.ts](../src/services/apiClient.ts)

```typescript
// Poll station status (on-demand)
pollStation(cuprId: number): Promise<ApiResponse<PollStationData>>

// Subscribe with immediate polling
startWatch(request: StartWatchRequest): Promise<ApiResponse<StartWatchData>>

// Type guards
isApiSuccess<T>(response): response is ApiSuccessResponse<T>
isRateLimited(response): response is ApiErrorResponse
isApiError(response): response is ApiErrorResponse
```

### Rate Limiting

Rate limiting is handled at two levels:

1. **Server-side (Edge Function)**: 5-minute cooldown per station
2. **Client-side cache**: Prevents unnecessary API calls

**File**: [src/utils/rateLimitCache.ts](../src/utils/rateLimitCache.ts)

```typescript
// Check if station is rate limited
isStationRateLimited(cuprId: number): boolean

// Mark station as rate limited
markRateLimited(cuprId: number, retryAfterSeconds: number): void

// Clear rate limit for a station
clearStationRateLimit(cuprId: number): void

// Clear entire cache
clearRateLimitCache(): void
```

**Flow in useStationData**:

```
Cache is stale/missing?
    ↓
Check isStationRateLimited(cuprId)
    ├─ Rate limited → Use stale cache, set isRateLimited=true
    └─ Not limited → Call poll-station API
                     ├─ Success → Use fresh data
                     ├─ RATE_LIMITED → markRateLimited(), use cache
                     └─ Error → Show error
```

### Push Notifications with start-watch

The `subscribeWithWatch` function combines push subscription with immediate polling:

**File**: [src/pwa.ts](../src/pwa.ts)

```typescript
subscribeWithWatch(cuprId: number, portNumber: 1 | 2 | null): Promise<StartWatchResult>
```

**Returns**:
- `subscriptionId`: UUID of the subscription
- `taskId`: UUID of the background polling task
- `currentStatus`: Current port statuses
- `fresh`: Whether data was freshly polled or from cache
- `nextPollIn`: Seconds until next poll (if rate limited)

**Used by**: [StationTab.tsx](../src/components/station/StationTab.tsx) in `handleSubscribeClick`
