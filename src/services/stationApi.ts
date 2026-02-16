import type {
  StationInfo,
  StationDetails,
  ChargerStatusFromApi,
  StationInfoPartial,
  PhysicalSocket,
} from './iberdrola';
import { extractPhysicalSockets } from './iberdrola';
import { buildRawAddress } from '../utils/address';
import { supabase } from '../../api/supabase';
import { CHARGING_POINT_STATUS, GEO_CONSTANTS } from '../constants';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Determines if a station should be saved to database cache.
 * Only FREE stations (priceKwh === 0) should be saved.
 * This prevents cluttering the database with paid stations.
 */
export function shouldSaveStationToCache(priceKwh: number | undefined): boolean {
  return priceKwh === 0;
}
export const CACHE_TTL_MINUTES = 15;

/**
 * Get fresh snapshots for multiple stations
 * @param cpIds Array of station IDs
 * @param ttlMinutes Cache TTL in minutes
 * @returns Map of cpId to cached station info (only fresh data within TTL)
 */
export async function getFreshSnapshots(
  cpIds: number[],
  ttlMinutes: number
): Promise<Map<number, CachedStationInfo>> {
  // Use existing getStationsFromCache implementation
  return getStationsFromCache(cpIds, ttlMinutes);
}

/**
 * Get fresh snapshot for a single station
 * @param cpId Station ID
 * @param ttlMinutes Cache TTL in minutes
 * @returns Cached station info or null if stale/missing
 */
export async function getFreshSnapshot(
  cpId: number,
  ttlMinutes: number
): Promise<CachedStationInfo | null> {
  const result = await getFreshSnapshots([cpId], ttlMinutes);
  return result.get(cpId) ?? null;
}

export interface CachedStationInfo {
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

interface SnapshotRow {
  cp_id: number;
  port1_status: string | null;
  port1_power_kw: number | null;
  port1_price_kwh: number | null;
  port2_status: string | null;
  port2_power_kw: number | null;
  port2_price_kwh: number | null;
  overall_status: string | null;
  emergency_stop_pressed: boolean | null;
  created_at: string;
}

interface MetadataRow {
  cp_id: number;
  cupr_id: number;
  latitude: number | null;
  longitude: number | null;
  address_full: string | null;
}

export async function getStationsFromCache(
  cpIds: number[],
  ttlMinutes: number = CACHE_TTL_MINUTES
): Promise<Map<number, CachedStationInfo>> {
  const result = new Map<number, CachedStationInfo>();

  if (cpIds.length === 0) return result;

  const ttlAgo = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const [snapshotsRes, metadataRes] = await Promise.all([
    supabase
      .from('station_snapshots')
      .select(
        'cp_id, port1_status, port1_power_kw, port1_price_kwh, port2_status, port2_power_kw, port2_price_kwh, overall_status, emergency_stop_pressed, created_at'
      )
      .in('cp_id', cpIds)
      .gte('created_at', ttlAgo)
      .order('created_at', { ascending: false }),
    supabase
      .from('station_metadata')
      .select('cp_id, cupr_id, latitude, longitude, address_full')
      .in('cp_id', cpIds),
  ]);

  if (snapshotsRes.error || metadataRes.error) {
    console.warn('Cache lookup failed:', snapshotsRes.error || metadataRes.error);
    return result;
  }

  const snapshots = snapshotsRes.data as SnapshotRow[];
  const metadata = metadataRes.data as MetadataRow[];

  const metadataMap = new Map<number, MetadataRow>();
  for (const m of metadata) {
    metadataMap.set(m.cp_id, m);
  }

  const seenCpIds = new Set<number>();
  for (const snap of snapshots) {
    if (seenCpIds.has(snap.cp_id)) continue;
    seenCpIds.add(snap.cp_id);

    const meta = metadataMap.get(snap.cp_id);
    if (!meta || !meta.latitude || !meta.longitude) continue;

    const isPaid =
      (snap.port1_price_kwh && snap.port1_price_kwh > 0) ||
      (snap.port2_price_kwh && snap.port2_price_kwh > 0);
    if (isPaid) continue;

    let freePorts = 0;
    if (snap.port1_status === CHARGING_POINT_STATUS.AVAILABLE) freePorts++;
    if (snap.port2_status === CHARGING_POINT_STATUS.AVAILABLE) freePorts++;

    const maxPower = Math.max(snap.port1_power_kw || 0, snap.port2_power_kw || 0);

    result.set(snap.cp_id, {
      cpId: snap.cp_id,
      cuprId: meta.cupr_id,
      name: meta.address_full?.split(',')[0] || 'Unknown',
      latitude: meta.latitude,
      longitude: meta.longitude,
      maxPower,
      freePorts,
      addressFull: meta.address_full || 'Address unknown',
      socketType: 'Mennekes (Type 2)',
      priceKwh: snap.port1_price_kwh || 0,
      emergencyStopPressed: snap.emergency_stop_pressed || false,
    });
  }

  return result;
}

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

export async function saveSnapshot(request: SaveSnapshotRequest): Promise<{ stored: boolean }> {
  const response = await fetch(`${EDGE_BASE}/save-snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error('Failed to save snapshot:', response.status);
    return { stored: false };
  }

  return response.json();
}

function buildPortSnapshotFields(
  port1: PhysicalSocket | undefined,
  port2: PhysicalSocket | undefined
): Pick<
  SaveSnapshotRequest['stationData'],
  | 'port1Status'
  | 'port1PowerKw'
  | 'port1PriceKwh'
  | 'port1UpdateDate'
  | 'port1SocketType'
  | 'port2Status'
  | 'port2PowerKw'
  | 'port2PriceKwh'
  | 'port2UpdateDate'
  | 'port2SocketType'
> {
  return {
    port1Status: port1?.status?.statusCode,
    port1PowerKw: port1?.maxPower,
    port1PriceKwh: port1?.appliedRate?.recharge?.finalPrice ?? 0,
    port1UpdateDate: port1?.status?.updateDate,
    port1SocketType: port1?.socketType?.socketName,
    port2Status: port2?.status?.statusCode,
    port2PowerKw: port2?.maxPower,
    port2PriceKwh: port2?.appliedRate?.recharge?.finalPrice ?? 0,
    port2UpdateDate: port2?.status?.updateDate,
    port2SocketType: port2?.socketType?.socketName,
  };
}

export function stationInfoToSnapshotData(
  station: StationInfo,
  details: StationDetails | null
): SaveSnapshotRequest['stationData'] {
  const sockets = extractPhysicalSockets(details);

  return {
    cpName: details?.locationData?.cuprName,
    latitude: station.latitude,
    longitude: station.longitude,
    addressFull: station.addressFull,
    ...buildPortSnapshotFields(sockets[0], sockets[1]),
    overallStatus: details?.cpStatus?.statusCode,
    emergencyStopPressed: details?.emergencyStopButtonPressed,
    situationCode: details?.locationData?.situationCode,
  };
}

export function detailsToSnapshotData(details: StationDetails): SaveSnapshotRequest['stationData'] {
  const sockets = extractPhysicalSockets(details);
  const addr = details.locationData?.supplyPointData?.cpAddress;

  return {
    cpName: details.locationData?.cuprName,
    latitude: details.locationData?.latitude,
    longitude: details.locationData?.longitude,
    addressFull: addr ? buildRawAddress(addr) : undefined,
    ...buildPortSnapshotFields(sockets[0], sockets[1]),
    overallStatus: details.cpStatus?.statusCode,
    emergencyStopPressed: details.emergencyStopButtonPressed,
    situationCode: details.locationData?.situationCode,
  };
}

export { type SaveSnapshotRequest };

/**
 * Loads cached stations near a location (fallback when API is unavailable).
 * Uses bounding box query on station_metadata joined with station_snapshots.
 * Returns stations with data from cache, marked with _fromCache=true.
 *
 * @param lat Latitude of search center
 * @param lon Longitude of search center
 * @param radiusKm Search radius in kilometers
 * @param ttlMinutes Cache TTL in minutes (default: 60 for fallback mode)
 */
export async function loadStationsFromCacheNearLocation(
  lat: number,
  lon: number,
  radiusKm: number,
  ttlMinutes: number = 60
): Promise<StationInfoPartial[]> {
  const latDelta = radiusKm / GEO_CONSTANTS.KM_PER_DEGREE_LAT;
  const lonDelta =
    radiusKm / (GEO_CONSTANTS.KM_PER_DEGREE_LAT * Math.cos(lat * GEO_CONSTANTS.DEG_TO_RAD));

  // Get station metadata within bounding box
  const { data: metadata, error: metaError } = await supabase
    .from('station_metadata')
    .select('cp_id, cupr_id, latitude, longitude, address_full')
    .gte('latitude', lat - latDelta)
    .lte('latitude', lat + latDelta)
    .gte('longitude', lon - lonDelta)
    .lte('longitude', lon + lonDelta)
    .limit(100);

  if (metaError || !metadata || metadata.length === 0) {
    console.warn('[CacheNearby] No metadata found:', metaError);
    return [];
  }

  // Get latest snapshots for these stations (with extended TTL for fallback)
  const cpIds = metadata.map((m) => m.cp_id);
  const cachedMap = await getStationsFromCache(cpIds, ttlMinutes);

  const results: StationInfoPartial[] = [];
  for (const meta of metadata) {
    const cached = cachedMap.get(meta.cp_id);
    if (cached) {
      results.push({
        cpId: meta.cp_id,
        cuprId: meta.cupr_id,
        name: cached.name,
        latitude: meta.latitude,
        longitude: meta.longitude,
        addressFull: meta.address_full || 'Address unknown',
        overallStatus: 'UNKNOWN', // Mark as potentially stale
        totalPorts: 2,
        maxPower: cached.maxPower,
        freePorts: cached.freePorts,
        priceKwh: cached.priceKwh,
        socketType: cached.socketType,
        emergencyStopPressed: cached.emergencyStopPressed,
        _fromCache: true,
      });
    }
  }

  console.log(`[CacheNearby] Found ${results.length} stations from cache`);
  return results;
}

// In-flight request deduplication map
// Prevents parallel Edge calls for the same station
const inFlightRequests = new Map<string, Promise<ChargerStatusFromApi | null>>();

/**
 * Fetch station via Edge function with single-flight pattern
 *
 * Multiple simultaneous calls for the same cpId+cuprId will return
 * the same promise, preventing duplicate network requests.
 *
 * @param cpId Charging point ID
 * @param cuprId CUPR ID (location ID)
 * @returns Station data or null if not found/error
 */
export async function fetchStationViaEdge(
  cpId: number,
  cuprId: number
): Promise<ChargerStatusFromApi | null> {
  const key = `${cpId}-${cuprId}`;

  // Check if request already in flight
  const existing = inFlightRequests.get(key);
  if (existing) {
    console.log(`[Edge] Deduplicating request for station ${cpId}`);
    return existing;
  }

  // Create new request
  const promise = (async () => {
    try {
      const response = await fetch(`${EDGE_BASE}/station-details`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ cpId, cuprId }),
      });

      if (!response.ok) {
        console.error('Edge function error:', response.status);
        return null;
      }

      const data = await response.json();
      return data.station;
    } finally {
      // Cleanup on success or error
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}
