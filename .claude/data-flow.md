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
