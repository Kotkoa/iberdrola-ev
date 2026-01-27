# Search Feature - Two-Stage Loading

## Architecture

The Search tab uses optimized two-stage loading with TTL caching for fast results.

## TTL Cache for Search Enrichment

### Cache Strategy

Search enrichment uses TTL (Time-To-Live) caching to minimize API requests:

**TTL**: 15 minutes (constant `CACHE_TTL_MINUTES` in `stationApi.ts`)

**How it works**:

1. **Batch Cache Lookup**: Before enrichment loop, one database query for all stations
2. **Freshness Check**: For each station, check if cached data is fresh (< 15 min)
3. **Cache HIT**: If data fresh → use cache, no API call
4. **Cache MISS**: If data stale/missing → API call through CORS proxy

**Files**:

- [src/services/iberdrola.ts](../src/services/iberdrola.ts) - `enrichStationDetails()` with TTL check
- [src/hooks/useStationSearch.ts](../src/hooks/useStationSearch.ts) - batch cache lookup
- [src/services/stationApi.ts](../src/services/stationApi.ts) - `getStationsFromCache()`
- [src/utils/time.ts](../src/utils/time.ts) - `isDataStale()` utility

**Metrics**:

- Cache hit rate: >90% on repeated searches (within 15 minutes)
- Database queries: 1 query instead of N queries for batch lookup
- Performance: <2 sec loading for repeated searches

**See**: [.claude/caching-strategy.md](caching-strategy.md) for detailed documentation

### Stage 1 - Instant Results

**API**: Batch API `getListarPuntosRecarga`

**Returns immediately**:

- address, coordinates, distance
- `socketNum` field = total ports count
- **Skeleton placeholders** for: `maxPower`, `freePorts`, `priceKwh`

### Stage 2 - Background Enrichment (with TTL Cache) 🔄

**Optimization**: Batch cache lookup BEFORE API calls

1. **Batch Cache Lookup**:
   - `getStationsFromCache(allCpIds, 15)` → Map<cpId, CachedStationInfo>
   - One database query for all stations
   - TTL: 15 minutes

2. **For each station**:
   - **Cache check**: `enrichStationDetails(station, cachedMap)`
   - If cached data fresh (< 15 min):
     - ✅ Use cache → no API call
     - Console: `"[enrichment] Using fresh cache for cpId=..."`
   - If cache stale/missing:
     - ❌ Fetch from API → `getDatosPuntoRecarga` (parallel, 5 at a time)
     - Rate limiter applied (5 concurrent, 100ms delay)

3. **Result**:
   - Enriched station with power, availability, price, socket type
   - Real price: **FREE** (green outlined) or **€X.XX** (orange/warning outlined)
   - **Only FREE stations** saved to DB via `shouldSaveStationToCache()` utility
   - **Favorite star (⭐)** only shown for FREE stations (paid stations cannot be favorited)

**Performance**: >90% cache hit rate on repeated searches within 15 minutes

## Free/Paid Filter Switch

- Located in search row, aligned to right edge
- **Left position** (default): success color, shows **FREE stations only**
- **Right position**: warning color, shows **PAID stations only**
- Filter applied after data is loaded (client-side filtering)

## Important Rules

1. **`advantageous` field does NOT indicate free charging** - actual price only available from detail API
2. **Only FREE stations (priceKwh === 0) are saved to DB**
3. **Only FREE stations can be favorited**

## Key Types

- `StationInfoPartial` - partial data from batch API (with optional fields)
- `StationListItemFull` - full response structure from batch API

## Key Files

- **[src/services/iberdrola.ts](../src/services/iberdrola.ts)** - `fetchStationsPartial()`, `enrichStationDetails()`
- **[src/hooks/useStationSearch.ts](../src/hooks/useStationSearch.ts)** - two-stage loading logic
- **[src/components/search/StationResultCard.tsx](../src/components/search/StationResultCard.tsx)** - skeleton support
- **[src/utils/station.ts](../src/utils/station.ts)** - `shouldSaveStationToCache()` (tested in station.test.ts)

## Data Flow

```
User clicks "Find Stations"
    ↓
Stage 1: Batch API → StationInfoPartial[] → Show cards with skeletons
    ↓
Stage 2: Detail API × N (parallel, 5 at a time) → Update cards
    ↓
shouldSaveStationToCache(priceKwh) → Only FREE (priceKwh === 0) saved to DB
```

## CORS Proxy Configuration

**All Iberdrola API calls use `https://corsproxy.io/?` prefix**

See [API_ENDPOINTS](../src/constants/index.ts)

### Important Limitations

- Free tier for development only
- Production may require paid subscription
- Rate limits: 60 req/min per IP
- Privacy: user geolocation passes through third-party

### Alternative for Station Tab

**Station Tab uses Edge Functions** (no CORS issues):

- `station-details` Edge Function fetches from Iberdrola API server-side
- Automatically saves snapshots to database
- Falls back to Edge Function only when no snapshot exists in DB
