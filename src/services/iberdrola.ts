import { API_ENDPOINTS, CHARGING_POINT_STATUS, SEARCH_FILTERS, GEO_CONSTANTS } from '../constants';

// API Response Types
export interface PhysicalSocket {
  status?: { statusCode?: string };
  appliedRate?: {
    recharge?: {
      finalPrice?: number;
    };
  };
  maxPower?: number;
}

export interface LogicalSocket {
  physicalSocket?: PhysicalSocket[];
}

export interface StationDetails {
  cpStatus?: { statusCode?: string };
  logicalSocket?: LogicalSocket[];
  locationData?: {
    cuprName?: string;
    latitude?: number;
    longitude?: number;
  };
}

export interface StationListItem {
  cpId?: number;
  locationData?: {
    cuprId?: number;
  };
}

// Domain Types
export interface StationInfo {
  cpId: number;
  name: string;
  latitude: number;
  longitude: number;
  maxPower: number;
  freePorts: number;
}

/**
 * Fetches a list of charging stations within a given radius
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

  const res = await fetch(API_ENDPOINTS.LIST_CHARGING_POINTS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error('Failed to fetch stations: ' + res.status);

  const data = await res.json();
  return data.entidad || [];
}

/**
 * Fetches detailed information for a specific charging station
 */
async function fetchStationDetails(cuprId: number): Promise<StationDetails | null> {
  const res = await fetch(API_ENDPOINTS.GET_CHARGING_POINT_DETAILS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ dto: { cuprId: [cuprId] }, language: 'en' }),
  });

  if (!res.ok) throw new Error('Failed to fetch station details: ' + res.status);

  const data = await res.json();
  return data.entidad?.[0] || null;
}

/**
 * Checks if a station has any available ports
 */
function hasAvailablePorts(details: StationDetails | null): boolean {
  if (!details) return false;

  if (details.cpStatus?.statusCode === CHARGING_POINT_STATUS.AVAILABLE) return true;

  return (
    details.logicalSocket?.some((socket) =>
      socket.physicalSocket?.some((ps) => ps.status?.statusCode === CHARGING_POINT_STATUS.AVAILABLE)
    ) ?? false
  );
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
function extractStationInfo(cpId: number, details: StationDetails | null): StationInfo | null {
  if (!details) return null;

  const logical = details.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
  const availableSockets = flattened.filter(
    (ps) => ps.status?.statusCode === CHARGING_POINT_STATUS.AVAILABLE
  );
  const freePorts = availableSockets.length;
  const maxPower = flattened.reduce((acc, ps) => Math.max(acc, ps.maxPower || 0), 0) || 0;

  return {
    cpId,
    name: details.locationData?.cuprName || 'Unknown',
    latitude: details.locationData?.latitude || 0,
    longitude: details.locationData?.longitude || 0,
    maxPower,
    freePorts,
  };
}

/**
 * Finds free (unpaid and available) charging stations near a location
 * @param latitude - User's latitude
 * @param longitude - User's longitude
 * @param radiusKm - Search radius in kilometers
 * @param onProgress - Optional callback for progress updates
 * @returns Array of free charging stations
 */
export async function findNearestFreeStations(
  latitude: number,
  longitude: number,
  radiusKm: number,
  onProgress?: (current: number, total: number) => void
): Promise<StationInfo[]> {
  const stationsList = await fetchStationsInRadius(latitude, longitude, radiusKm);

  const freeStations: StationInfo[] = [];
  const total = stationsList.length;

  for (let i = 0; i < stationsList.length; i++) {
    onProgress?.(i + 1, total);

    const station = stationsList[i];
    const cpId = station.cpId;
    const cuprId = station.locationData?.cuprId;

    if (!cpId || !cuprId) {
      continue;
    }

    const details = await fetchStationDetails(cuprId);

    const hasAvailable = hasAvailablePorts(details);
    const isPaid = hasPaidPorts(details);

    if (!isPaid && hasAvailable) {
      const stationInfo = extractStationInfo(cpId, details);
      if (stationInfo) {
        freeStations.push(stationInfo);
      }
    }
  }

  return freeStations;
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
