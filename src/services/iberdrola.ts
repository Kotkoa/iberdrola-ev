import {
  API_ENDPOINTS,
  CHARGING_POINT_STATUS,
  SEARCH_FILTERS,
  GEO_CONSTANTS,
  VERCEL_PROXY_ENDPOINT,
  PROXY_ENDPOINT_TYPES,
} from '../constants';
import { getStationsFromCache, type CachedStationInfo } from './stationApi';
import { RateLimiter } from '../utils/rateLimiter';

const CONCURRENCY_LIMIT = 5;
const REQUEST_DELAY_MS = 100;
const rateLimiter = new RateLimiter(CONCURRENCY_LIMIT, REQUEST_DELAY_MS);

// ========================
// Proxy Fetch with Fallback
// ========================

type ProxySource = 'vercel' | 'corsproxy';

interface ProxyResult<T> {
  data: T | null;
  source: ProxySource;
  error?: string;
}

/**
 * Fetches data via Vercel API Route (primary proxy)
 */
async function fetchViaVercelProxy<T>(endpointType: string, payload: unknown): Promise<T> {
  const res = await fetch(VERCEL_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint: endpointType,
      payload,
    }),
  });

  if (!res.ok) {
    throw new Error(`Vercel proxy error: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetches data via external CORS proxy (fallback)
 */
async function fetchViaCorsProxy<T>(endpoint: string, payload: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`CORS proxy error: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetches with fallback chain: Vercel -> CORS Proxy
 * Returns data and source for debugging
 */
async function fetchWithFallback<T>(
  endpointType: string,
  corsEndpoint: string,
  payload: unknown
): Promise<ProxyResult<T>> {
  // Try Vercel proxy first
  try {
    const data = await fetchViaVercelProxy<T>(endpointType, payload);
    return { data, source: 'vercel' };
  } catch (vercelError) {
    console.warn('[Proxy] Vercel proxy failed:', vercelError);
  }

  // Fallback to CORS proxy
  try {
    const data = await fetchViaCorsProxy<T>(corsEndpoint, payload);
    return { data, source: 'corsproxy' };
  } catch (corsError) {
    console.warn('[Proxy] CORS proxy failed:', corsError);
    return {
      data: null,
      source: 'corsproxy',
      error: corsError instanceof Error ? corsError.message : 'Unknown error',
    };
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function formatAddress(addr?: {
  streetName?: string;
  streetNum?: string;
  townName?: string;
  regionName?: string;
}): string {
  if (!addr) return 'Address unknown';
  return `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim();
}

// API Response Types
export interface PhysicalSocket {
  status?: { statusCode?: string; updateDate?: string };
  appliedRate?: {
    recharge?: {
      finalPrice?: number;
    };
  };
  maxPower?: number;
  socketType?: {
    socketName?: string;
    socketTypeId?: string;
  };
}

export interface LogicalSocket {
  physicalSocket?: PhysicalSocket[];
}

export interface StationDetails {
  cpStatus?: { statusCode?: string };
  logicalSocket?: LogicalSocket[];
  emergencyStopButtonPressed?: boolean;
  locationData?: {
    cuprName?: string;
    latitude?: number;
    longitude?: number;
    cuprReservationIndicator?: boolean;
    situationCode?: string;
    supplyPointData?: {
      cpAddress?: {
        streetName?: string;
        streetNum?: string;
        townName?: string;
        regionName?: string;
      };
    };
  };
}

export interface StationListItem {
  cpId?: number;
  locationData?: {
    cuprId?: number;
  };
  cpStatus?: { statusCode?: string };
  advantageous?: boolean;
  socketNum?: number;
}

export interface StationListItemFull {
  cpId: number;
  locationData: {
    cuprId: number;
    cuprName: string;
    latitude: number;
    longitude: number;
    situationCode?: string;
    cuprReservationIndicator?: boolean;
    supplyPointData?: {
      cpAddress?: {
        streetName?: string;
        streetNum?: string;
        townName?: string;
        regionName?: string;
      };
    };
  };
  cpStatus: { statusCode: string };
  advantageous: boolean;
  socketNum: number;
}

export interface StationInfoPartial {
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
  _fromCache?: boolean; // Indicates if enrichment data came from cache
}

export function extractPartialFromBatch(item: StationListItemFull): StationInfoPartial {
  const addr = item.locationData.supplyPointData?.cpAddress;
  return {
    cpId: item.cpId,
    cuprId: item.locationData.cuprId,
    name: item.locationData.cuprName,
    latitude: item.locationData.latitude,
    longitude: item.locationData.longitude,
    addressFull: formatAddress(addr),
    overallStatus: item.cpStatus.statusCode,
    totalPorts: item.socketNum,
    supportsReservation: item.locationData.cuprReservationIndicator,
  };
}

export function isStationListItemFull(item: StationListItem): item is StationListItemFull {
  return (
    item.cpId !== undefined &&
    item.locationData?.cuprId !== undefined &&
    'cpStatus' in item &&
    item.cpStatus !== null &&
    item.cpStatus?.statusCode !== undefined &&
    'advantageous' in item &&
    'socketNum' in item
  );
}

// Domain Types
export interface StationInfo {
  cpId: number;
  cuprId: number;
  name: string;
  latitude: number;
  longitude: number;
  maxPower: number;
  freePorts: number;
  // Extended fields
  addressFull: string;
  socketType: string;
  priceKwh: number;
  emergencyStopPressed: boolean;
  supportsReservation: boolean;
}

/**
 * Fetches a list of charging stations within a given radius.
 * Uses fallback chain: Vercel proxy -> CORS proxy
 */
async function fetchStationsInRadius(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<StationListItem[]> {
  const latDelta = radiusKm / GEO_CONSTANTS.KM_PER_DEGREE_LAT;
  const lonDelta =
    radiusKm / (GEO_CONSTANTS.KM_PER_DEGREE_LAT * Math.cos(lat * GEO_CONSTANTS.DEG_TO_RAD));

  const payload = {
    dto: {
      chargePointTypesCodes: SEARCH_FILTERS.CHARGE_POINT_TYPES,
      socketStatus: SEARCH_FILTERS.SOCKET_STATUS,
      advantageous: SEARCH_FILTERS.ADVANTAGEOUS,
      connectorsType: SEARCH_FILTERS.CONNECTORS_TYPE,
      loadSpeed: SEARCH_FILTERS.LOAD_SPEED,
      latitudeMax: lat + latDelta,
      latitudeMin: lat - latDelta,
      longitudeMax: lon + lonDelta,
      longitudeMin: lon - lonDelta,
    },
    language: 'en',
  };

  const result = await fetchWithFallback<{ entidad: StationListItem[] }>(
    PROXY_ENDPOINT_TYPES.LIST,
    API_ENDPOINTS.LIST_CHARGING_POINTS,
    payload
  );

  if (result.data) {
    console.log(`[Search] Fetched stations via ${result.source}`);
    return result.data.entidad || [];
  }

  // Both proxies failed
  throw new Error('Failed to fetch stations: all proxies unavailable');
}

/**
 * Fetches detailed information for a specific charging station.
 * Uses rate limiting to avoid overwhelming the API.
 * Uses fallback chain: Vercel proxy -> CORS proxy -> returns null
 */
export async function fetchStationDetails(cuprId: number): Promise<StationDetails | null> {
  await rateLimiter.acquire();
  try {
    const payload = { dto: { cuprId: [cuprId] }, language: 'en' };

    const result = await fetchWithFallback<{ entidad: StationDetails[] }>(
      PROXY_ENDPOINT_TYPES.DETAILS,
      API_ENDPOINTS.GET_CHARGING_POINT_DETAILS,
      payload
    );

    if (result.data?.entidad?.[0]) {
      console.log(`[Details] Fetched cuprId=${cuprId} via ${result.source}`);
      return result.data.entidad[0];
    }

    // Both proxies failed - return null (will use cache in caller)
    if (result.error) {
      console.warn(`[Details] Failed for cuprId=${cuprId}: ${result.error}`);
    }
    return null;
  } finally {
    rateLimiter.release();
  }
}

/**
 * Checks if a station has any paid charging ports
 */
function hasPaidPorts(details: StationDetails | null): boolean {
  if (!details) return false;

  return (
    details.logicalSocket?.some((sock) =>
      sock.physicalSocket?.some(
        (ps) => ps.appliedRate?.recharge?.finalPrice && ps.appliedRate.recharge.finalPrice > 0
      )
    ) ?? false
  );
}

/**
 * Extracts station information from detailed data
 */
export function extractStationInfo(
  cpId: number,
  cuprId: number,
  details: StationDetails | null
): StationInfo | null {
  if (!details) return null;

  const logical = details.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
  const availableSockets = flattened.filter(
    (ps) => ps.status?.statusCode === CHARGING_POINT_STATUS.AVAILABLE
  );
  const freePorts = availableSockets.length;
  const maxPower = flattened.reduce((acc, ps) => Math.max(acc, ps.maxPower || 0), 0) || 0;

  // Extract address
  const addr = details.locationData?.supplyPointData?.cpAddress;
  const addressFull = addr
    ? `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim()
    : 'Address unknown';

  // Extract socket type (from first available physical socket)
  const firstSocket = flattened[0];
  const socketType = firstSocket?.socketType?.socketName
    ? `${firstSocket.socketType.socketName} (Type ${firstSocket.socketType.socketTypeId})`
    : 'Unknown';

  // Extract price (minimum price across all sockets)
  const prices = flattened
    .map((ps) => ps.appliedRate?.recharge?.finalPrice)
    .filter((p): p is number => typeof p === 'number');
  const priceKwh = prices.length > 0 ? Math.min(...prices) : 0;

  return {
    cpId,
    cuprId,
    name: details.locationData?.cuprName || 'Unknown',
    latitude: details.locationData?.latitude || 0,
    longitude: details.locationData?.longitude || 0,
    maxPower,
    freePorts,
    // Extended fields
    addressFull,
    socketType,
    priceKwh,
    emergencyStopPressed: details.emergencyStopButtonPressed || false,
    supportsReservation: details.locationData?.cuprReservationIndicator || false,
  };
}

function cachedToStationInfo(cached: CachedStationInfo): StationInfo {
  return {
    ...cached,
    supportsReservation: false,
  };
}

/**
 * Finds free (unpaid and available) charging stations near a location.
 * Uses cache from DB when available (5 min TTL), fetches from API only for uncached stations.
 */
export async function findNearestFreeStations(
  latitude: number,
  longitude: number,
  radiusKm: number,
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal
): Promise<StationInfo[]> {
  const stationsList = await fetchStationsInRadius(latitude, longitude, radiusKm);

  if (signal?.aborted) return [];

  const validStations = stationsList.filter(
    (s): s is { cpId: number; locationData: { cuprId: number } } =>
      s.cpId !== undefined && s.locationData?.cuprId !== undefined
  );

  const cpIds = validStations.map((s) => s.cpId);

  const cached = await getStationsFromCache(cpIds);

  if (signal?.aborted) return [];

  const toFetch = validStations.filter((s) => !cached.has(s.cpId));

  const freeStations: StationInfo[] = [];

  for (const [, station] of cached) {
    freeStations.push(cachedToStationInfo(station));
  }

  if (toFetch.length === 0) {
    return freeStations;
  }

  let completed = cached.size;
  const total = validStations.length;
  onProgress?.(completed, total);

  const chunks = chunkArray(toFetch, CONCURRENCY_LIMIT);

  for (const chunk of chunks) {
    if (signal?.aborted) break;

    const results = await Promise.allSettled(
      chunk.map(async (station) => {
        if (signal?.aborted) return null;

        const cpId = station.cpId;
        const cuprId = station.locationData.cuprId;

        try {
          const details = await fetchStationDetails(cuprId);
          completed++;
          onProgress?.(completed, total);

          if (!hasPaidPorts(details)) {
            return extractStationInfo(cpId, cuprId, details);
          }
        } catch (err) {
          console.warn(`Failed to fetch station ${cpId}:`, err);
          completed++;
          onProgress?.(completed, total);
        }

        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        freeStations.push(result.value);
      }
    }
  }

  return freeStations;
}

/**
 * Fetches stations in radius and returns partial info immediately from batch API.
 * Note: Price info is not available from batch API, will be loaded via enrichStationDetails.
 */
export async function fetchStationsPartial(
  latitude: number,
  longitude: number,
  radiusKm: number
): Promise<StationInfoPartial[]> {
  const stationsList = await fetchStationsInRadius(latitude, longitude, radiusKm);

  const partialStations: StationInfoPartial[] = [];

  for (const item of stationsList) {
    if (isStationListItemFull(item)) {
      partialStations.push(extractPartialFromBatch(item));
    }
  }

  return partialStations;
}

/**
 * Enriches partial station info with detailed data from cache or API.
 * Uses TTL-based cache lookup to minimize API requests.
 *
 * @param partial Partial station info from batch API
 * @param cachedMap Optional pre-fetched cache map (for batch optimization)
 * @returns Updated station with maxPower, freePorts, priceKwh, socketType, etc.
 */
export async function enrichStationDetails(
  partial: StationInfoPartial,
  cachedMap?: Map<number, CachedStationInfo>
): Promise<StationInfoPartial> {
  try {
    // Check cache first (TTL-aware)
    if (cachedMap) {
      const cached = cachedMap.get(partial.cpId);
      if (cached) {
        console.log(`[enrichment] Using fresh cache for cpId=${partial.cpId}`);
        return {
          ...partial,
          maxPower: cached.maxPower,
          freePorts: cached.freePorts,
          priceKwh: cached.priceKwh,
          socketType: cached.socketType,
          emergencyStopPressed: cached.emergencyStopPressed,
          _fromCache: true,
        };
      }
    }

    // Cache MISS or stale - fetch from API
    console.log(`[enrichment] Cache miss for cpId=${partial.cpId}, fetching from API`);
    const details = await fetchStationDetails(partial.cuprId);
    if (!details) return partial;

    const logical = details.logicalSocket || [];
    const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
    const availableSockets = flattened.filter(
      (ps) => ps.status?.statusCode === CHARGING_POINT_STATUS.AVAILABLE
    );

    const firstSocket = flattened[0];
    const socketType = firstSocket?.socketType?.socketName || 'Unknown';

    const prices = flattened
      .map((ps) => ps.appliedRate?.recharge?.finalPrice)
      .filter((p): p is number => typeof p === 'number');
    const priceKwh = prices.length > 0 ? Math.min(...prices) : 0;

    return {
      ...partial,
      maxPower: flattened.reduce((acc, ps) => Math.max(acc, ps.maxPower || 0), 0) || 0,
      freePorts: availableSockets.length,
      priceKwh,
      socketType,
      emergencyStopPressed: details.emergencyStopButtonPressed || false,
      _fromCache: false,
    };
  } catch (err) {
    console.warn(`Failed to enrich station ${partial.cpId}:`, err);
    return partial;
  }
}

/**
 * Gets user's current geolocation
 * @returns GeolocationPosition
 * @throws GeolocationPositionError if location access is denied or unavailable
 */
export async function getUserLocation(): Promise<GeolocationPosition> {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

/**
 * Fetches station and converts to ChargerStatus-compatible format (for API fallback)
 */
export interface ChargerStatusFromApi {
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

export async function fetchStationAsChargerStatus(
  cuprId: number,
  cpId: number
): Promise<ChargerStatusFromApi | null> {
  const details = await fetchStationDetails(cuprId);
  if (!details) return null;

  const logical = details.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);

  const port1 = flattened[0];
  const port2 = flattened[1];

  const addr = details.locationData?.supplyPointData?.cpAddress;
  const addressFull = addr
    ? `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim()
    : null;

  const now = new Date().toISOString();

  return {
    id: `api-${cpId}`,
    created_at: now,
    cp_id: cpId,
    cp_name: details.locationData?.cuprName || 'Unknown',
    schedule: '24/7',
    port1_status: port1?.status?.statusCode || null,
    port2_status: port2?.status?.statusCode || null,
    port1_power_kw: port1?.maxPower || null,
    port1_update_date: port1?.status?.updateDate || now,
    port2_power_kw: port2?.maxPower || null,
    port2_update_date: port2?.status?.updateDate || now,
    overall_status: details.cpStatus?.statusCode || null,
    overall_update_date: now,
    cp_latitude: details.locationData?.latitude || null,
    cp_longitude: details.locationData?.longitude || null,
    address_full: addressFull,
    port1_price_kwh: port1?.appliedRate?.recharge?.finalPrice || 0,
    port2_price_kwh: port2?.appliedRate?.recharge?.finalPrice || 0,
    port1_socket_type: port1?.socketType?.socketName || null,
    port2_socket_type: port2?.socketType?.socketName || null,
    emergency_stop_pressed: details.emergencyStopButtonPressed || false,
    situation_code: details.locationData?.situationCode || null,
  };
}
