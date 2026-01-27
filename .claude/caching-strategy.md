# Caching Strategy - TTL-Based Freshness

## Overview

The application uses TTL (Time-To-Live) caching to minimize API requests to the Iberdrola API.

**TTL**: 15 minutes for all types of station data

---

## Architecture

### Primary Station (useStationData)

**Flow**:

```
User selects station
  ↓
getStationsFromCache([cpId], 15)
  ↓
isDataStale(snapshot.created_at, 15)?
  ├─ NO (fresh) → Use cache ✅
  └─ YES (stale) → fetchStationViaEdge() → Update cache
```

**Cache Hit Rate**: ~90%+ within 15 minutes

---

### Search Enrichment (useStationSearch)

**Flow**:

```
User clicks "Find Stations"
  ↓
Batch: getStationsFromCache(allCpIds, 15)  ← ONE query for all stations
  ↓
For each station:
  enrichStationDetails(station, cachedMap)
    ↓
    Check cache: cachedMap.get(cpId)
      ├─ Found → Use cache ✅
      └─ Not found → fetchStationDetails() → Update cache
```

**Optimization**: Batch cache lookup instead of N individual queries

**Cache Hit Rate**: >90% on repeated searches (within 15 minutes)

---

## Key Functions

### `getStationsFromCache(cpIds[], ttlMinutes)`

**Location**: [src/services/stationApi.ts:71-144](../src/services/stationApi.ts#L71-L144)

**Purpose**: Batch cache lookup for list of stations

**Parameters**:

- `cpIds: number[]` - list of cp_id for lookup
- `ttlMinutes: number` - TTL in minutes (default: 15)

**Returns**: `Map<cpId, CachedStationInfo>`

**SQL Query**:

```sql
SELECT * FROM station_snapshots
WHERE cp_id IN (...)
  AND created_at >= NOW() - INTERVAL '15 minutes'
ORDER BY created_at DESC
```

**Performance**: O(1) database query regardless of station count

---

### `isDataStale(createdAt, ttlMinutes)`

**Location**: [src/utils/time.ts:27-35](../src/utils/time.ts#L27-L35)

**Purpose**: Check freshness of data

**Logic**:

```typescript
const ageMs = Date.now() - new Date(createdAt).getTime();
return ageMs > ttlMinutes * 60 * 1000;
```

**Example**:

```typescript
isDataStale('2026-01-27T14:00:00Z', 15); // at 14:10 → false (fresh)
isDataStale('2026-01-27T14:00:00Z', 15); // at 14:20 → true (stale)
```

---

### `enrichStationDetails(partial, cachedMap?)`

**Location**: [src/services/iberdrola.ts:413-466](../src/services/iberdrola.ts#L413-L466)

**Purpose**: Enrich station with cache-first strategy

**Algorithm**:

```typescript
1. If cachedMap provided:
     cached = cachedMap.get(cpId)
     if cached:
       return cached data ✅ (cache HIT)

2. Cache MISS or not provided:
     fetchStationDetails(cuprId) ❌ (API call)
```

**Console Logs**:

- Cache HIT: `"[enrichment] Using fresh cache for cpId=123"`
- Cache MISS: `"[enrichment] Cache miss for cpId=123, fetching from API"`

---

## Performance Metrics

### Before TTL (search enrichment)

| Metric                                   | Value               |
| ---------------------------------------- | ------------------- |
| Cache hit rate                           | 0% (no cache check) |
| API requests (repeat search, 6 stations) | 6                   |
| Database queries                         | 0 (no cache lookup) |
| Duration (repeat search)                 | 5-10 sec            |

### After TTL (search enrichment)

| Metric                                   | Value                |
| ---------------------------------------- | -------------------- |
| Cache hit rate                           | >90% (within 15 min) |
| API requests (repeat search, 6 stations) | <1 (only stale data) |
| Database queries                         | 1 (batch lookup)     |
| Duration (repeat search)                 | <2 sec               |

**Improvement**: ~5-10x faster repeated searches, 90%+ reduction in API requests

---

## Testing

### Unit Tests

**Files**:

- [src/services/iberdrola-cache.test.ts](../src/services/iberdrola-cache.test.ts) - enrichStationDetails() cache logic
- [src/hooks/useStationSearch.test.ts](../src/hooks/useStationSearch.test.ts) - batch cache lookup
- [src/hooks/useStationSearch.performance.test.ts](../src/hooks/useStationSearch.performance.test.ts) - performance validation

**Run tests**:

```bash
yarn test src/services/iberdrola-cache.test.ts
yarn test src/hooks/useStationSearch.test.ts
yarn test src/hooks/useStationSearch.performance.test.ts
```

### E2E Test

**Test 3: TTL Effectiveness**

**Steps**:

1. First search: Record N1 API requests
2. Wait 8 minutes
3. Second search: Record N2 API requests
4. Calculate: Cache Hit Rate = (N1 - N2) / N1 \* 100%

**Success Criteria**: Cache Hit Rate > 90%

**Results documented in**: [.claude/e2e-test-results.md](e2e-test-results.md)

---

## Troubleshooting

### Issue: Cache hit rate < 90%

**Possible causes**:

1. TTL too short (< 15 min between searches)
2. Cache not saving (`save-snapshot` fails)
3. Database query slow (index missing on `cp_id`, `created_at`)

**Debug**:

- Check console logs: should see "Using fresh cache" messages
- Check Supabase `station_snapshots` table: should have recent records
- Check `created_at` timestamps: should be within 15 minutes

### Issue: Slow repeat searches

**Possible causes**:

1. Batch cache lookup not used (N queries instead of 1)
2. Database query slow (index missing)

**Debug**:

- Check Supabase logs: should be 1 query to `station_snapshots`
- Check query performance: should be < 100ms
- Verify code: `useStationSearch.ts` calls `getStationsFromCache()` before enrichment loop

---

## Future Improvements

1. **Adaptive TTL**: Adjust TTL based on update frequency (realtime vs static stations)
2. **Cache warming**: Pre-load popular stations during off-peak hours
3. **Cache invalidation**: Invalidate cache on manual refresh or user request
4. **Metrics dashboard**: Real-time monitoring of cache hit rates, API usage, performance
