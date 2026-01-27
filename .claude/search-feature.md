# Search Feature - Two-Stage Loading

## Architecture

The Search tab uses optimized two-stage loading for fast results.

### Stage 1 - Instant Results

**API**: Batch API `getListarPuntosRecarga`

**Returns immediately**:

- address, coordinates, distance
- `socketNum` field = total ports count
- **Skeleton placeholders** for: `maxPower`, `freePorts`, `priceKwh`

### Stage 2 - Background Enrichment

**API**: Individual API `getDatosPuntoRecarga` (parallel, 5 at a time)

**Updates in-place**:

- power (kW), port availability, price, socket type
- Real price: **FREE** (green outlined) or **€X.XX** (orange/warning outlined)
- **Only FREE stations** are saved to DB via `shouldSaveStationToCache()` utility
- **Favorite star (⭐)** only shown for FREE stations (paid stations cannot be favorited)

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
