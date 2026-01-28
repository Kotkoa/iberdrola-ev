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

## Proxy Configuration with Fallback Chain

Iberdrola API requires server-side proxy due to CORS restrictions. The app uses a fallback chain for reliability.

### Fallback Chain

```
1. Vercel API Route (/api/iberdrola) - Primary
   ↓ (if fails)
2. CORS Proxy (corsproxy.io) - Secondary
   ↓ (if fails)
3. Cached Data (loadStationsFromCacheNearLocation) - Fallback
```

### Vercel API Route (Primary)

**File**: [api/iberdrola.ts](../api/iberdrola.ts)

- Server-side proxy running on Vercel
- No CORS issues (same-origin)
- Handles preflight OPTIONS requests
- Supports both `list` and `details` endpoints

**Usage**:

```typescript
POST /api/iberdrola
Body: { endpoint: 'list' | 'details', payload: {...} }
```

### CORS Proxy (Secondary)

**URL**: `https://corsproxy.io/?`

See [API_ENDPOINTS](../src/constants/index.ts)

**Limitations**:

- Free tier: 60 req/min per IP
- May return 403 on preflight
- Less reliable than Vercel proxy

### Cache Fallback

When both proxies fail, the app shows cached data:

- **Function**: `loadStationsFromCacheNearLocation(lat, lon, radius)`
- **TTL**: 60 minutes (extended for fallback mode)
- **UI**: Warning alert "Live data unavailable. Showing cached results."
- **State**: `usingCachedData: true` in `useStationSearch` hook

### Key Files

- [api/iberdrola.ts](../api/iberdrola.ts) - Vercel API Route
- [src/constants/index.ts](../src/constants/index.ts) - `VERCEL_PROXY_ENDPOINT`, `PROXY_ENDPOINT_TYPES`
- [src/services/iberdrola.ts](../src/services/iberdrola.ts) - `fetchWithFallback()` helper
- [src/services/stationApi.ts](../src/services/stationApi.ts) - `loadStationsFromCacheNearLocation()`
- [src/hooks/useStationSearch.ts](../src/hooks/useStationSearch.ts) - `usingCachedData` state

### Known Limitations

- Supabase Edge Functions cannot call Iberdrola API (IP blocked)
- `station-details` Edge Function was never implemented (abandoned)
