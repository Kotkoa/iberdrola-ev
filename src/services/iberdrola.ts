import { CHARGING_POINT_STATUS } from '../constants';
import { type CachedStationInfo } from './stationApi';

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
  _fromCache?: boolean;
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
  addressFull: string;
  socketType: string;
  priceKwh: number;
  emergencyStopPressed: boolean;
  supportsReservation: boolean;
}

/**
 * @deprecated Iberdrola API is blocked (403). Always returns null.
 * Data should come from Supabase cache (populated by GitHub Actions scraper).
 */
export async function fetchStationDetails(cuprId: number): Promise<StationDetails | null> {
  void cuprId;
  console.warn('[fetchStationDetails] Iberdrola API is blocked. Use cache instead.');
  return null;
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

  const addr = details.locationData?.supplyPointData?.cpAddress;
  const addressFull = addr
    ? `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim()
    : 'Address unknown';

  const firstSocket = flattened[0];
  const socketType = firstSocket?.socketType?.socketName
    ? `${firstSocket.socketType.socketName} (Type ${firstSocket.socketType.socketTypeId})`
    : 'Unknown';

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
    addressFull,
    socketType,
    priceKwh,
    emergencyStopPressed: details.emergencyStopButtonPressed || false,
    supportsReservation: details.locationData?.cuprReservationIndicator || false,
  };
}

/**
 * @deprecated Iberdrola API is blocked (403). Always throws error.
 * Data should come from Supabase cache (populated by GitHub Actions scraper).
 */
export async function fetchStationsPartial(
  latitude: number,
  longitude: number,
  radiusKm: number
): Promise<StationInfoPartial[]> {
  void latitude;
  void longitude;
  void radiusKm;
  throw new Error('Iberdrola API is blocked. Use loadStationsFromCacheNearLocation instead.');
}

/**
 * Enriches partial station info with detailed data from cache.
 * API path is disabled (Iberdrola blocks all proxies with 403).
 *
 * @param partial Partial station info
 * @param cachedMap Pre-fetched cache map (required for enrichment)
 * @returns Updated station with maxPower, freePorts, priceKwh, socketType, etc.
 */
export async function enrichStationDetails(
  partial: StationInfoPartial,
  cachedMap?: Map<number, CachedStationInfo>
): Promise<StationInfoPartial> {
  if (cachedMap) {
    const cached = cachedMap.get(partial.cpId);
    if (cached) {
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

  // No cache available - return partial as-is (API is blocked)
  console.warn(`[enrichment] No cache for cpId=${partial.cpId}, API is blocked`);
  return partial;
}

/**
 * Gets user's current geolocation
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
 * @deprecated Iberdrola API is blocked (403). Always returns null.
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

/**
 * @deprecated Iberdrola API is blocked (403). Always returns null.
 */
export async function fetchStationAsChargerStatus(
  cuprId: number,
  cpId: number
): Promise<ChargerStatusFromApi | null> {
  void cuprId;
  void cpId;
  console.warn('[fetchStationAsChargerStatus] Iberdrola API is blocked. Use cache instead.');
  return null;
}
