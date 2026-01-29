# Iberdrola API Blocking - Current Architecture

## Status: Cache-Only Mode

**All direct API proxy attempts have been removed** from the codebase. The application now operates exclusively on cached data from Supabase.

---

## Data Flow

```
GitHub Actions Scraper (every 10 min)
    ↓
Iberdrola API (works from Azure IPs)
    ↓
Supabase station_snapshots table
    ↓
Frontend (reads from cache only)
```

---

## Why Direct API Access Doesn't Work

Iberdrola enabled aggressive IP blocking via **Akamai CDN**. All common cloud provider IPs are blocked:

| Source | Status |
|--------|--------|
| corsproxy.io (Cloudflare) | ❌ 403 |
| Vercel (AWS Lambda) | ❌ 403 |
| Cloudflare Workers | ❌ 403 |
| Supabase Edge Functions (AWS/Deno) | ❌ 403 |
| Azure Functions | ❌ 403 |
| **GitHub Actions (Azure)** | ✅ Works |

Only GitHub Actions works because Microsoft Azure IPs have better reputation and are less commonly blocked.

---

## Removed Code (January 2025)

The following dead code was removed to simplify the codebase:

### Files Deleted

- `azure/` directory (Azure Functions proxy)
- `api/iberdrola.ts` (Vercel proxy)
- `api/iberdrola.test.ts` (proxy tests)
- `src/services/iberdrola.test.ts` (proxy tests)

### Constants Removed from `src/constants/index.ts`

- `CORS_PROXY`
- `AZURE_PROXY_ENDPOINT`
- `CLOUDFLARE_PROXY_ENDPOINT`
- `VERCEL_PROXY_ENDPOINT`
- `API_ENDPOINTS`
- `PROXY_ENDPOINT_TYPES`
- `IBERDROLA_DIRECT_ENDPOINTS`
- `SEARCH_FILTERS`

### Functions Simplified in `src/services/iberdrola.ts`

- `fetchStationDetails()` - now returns `null` immediately
- `fetchStationsPartial()` - now throws error immediately
- `enrichStationDetails()` - uses cache only, no API fallback
- `fetchStationAsChargerStatus()` - now returns `null` immediately

All proxy-related functions were removed:

- `fetchViaAzureProxy()`
- `fetchViaCloudflare()`
- `fetchViaVercelProxy()`
- `fetchViaCorsProxy()`
- `fetchDirectFromIberdrola()`
- `fetchWithFallback()`
- `fetchStationsInRadius()`
- `findNearestFreeStations()`

---

## Current Behavior

### Search Feature (`useStationSearch`)

1. Tries `fetchStationsPartial()` → immediately throws error
2. Falls back to `loadStationsFromCacheNearLocation()` → works
3. Shows message: "Live data unavailable. Showing cached results."

### Station Data (`useStationData`)

1. Loads from `station_snapshots` cache
2. Subscribes to realtime updates
3. No API fallback needed

---

## Data Freshness

- **Scraper runs**: Every 10 minutes via GitHub Actions
- **Cache TTL**: 15 minutes
- **User experience**: Data is 0-10 minutes stale

---

## Future Options

If real-time data is needed:

1. **Increase scraper frequency** (costs more GitHub Actions minutes)
2. **Self-hosted VPS** with residential IP (~$5/month)
3. **Residential proxy service** (expensive, ~$20+/month)
4. **Wait for Iberdrola** to relax blocking

---

## Related Files

- [src/services/iberdrola.ts](../src/services/iberdrola.ts) - Stub functions + types
- [src/services/stationApi.ts](../src/services/stationApi.ts) - Cache operations
- [iberdrola-scraper](https://github.com/Kotkoa/iberdrola-scraper) - Working scraper
