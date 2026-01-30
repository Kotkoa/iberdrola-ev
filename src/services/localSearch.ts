/**
 * Client-side local search for stations from pre-built library
 * Zero network requests, works offline
 */

import { calculateDistance } from '../utils/maps';
import type { StationInfoPartial } from './iberdrola';

interface LibraryStation {
  cpId: number;
  cuprId: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  socketType: string;
  maxPower: number | null;
  priceKwh: number | null;
  totalPorts: number;
  free: boolean;
}

let libraryCache: LibraryStation[] | null = null;

/**
 * Load station library from public/stations/library.json
 * Caches result in memory
 */
export async function loadLibrary(): Promise<LibraryStation[]> {
  if (libraryCache) {
    return libraryCache;
  }

  try {
    const response = await fetch('/stations/library.json');
    if (!response.ok) {
      throw new Error(`Failed to load library: ${response.status}`);
    }
    libraryCache = await response.json();
    return libraryCache!;
  } catch (error) {
    console.error('[LocalSearch] Failed to load library:', error);
    return [];
  }
}

/**
 * Convert library station to StationInfoPartial format
 */
function toStationInfoPartial(station: LibraryStation, distanceKm?: number): StationInfoPartial {
  return {
    cpId: station.cpId,
    cuprId: station.cuprId,
    name: station.name,
    latitude: station.lat,
    longitude: station.lon,
    addressFull: station.address,
    overallStatus: 'AVAILABLE', // Static status for library
    totalPorts: station.totalPorts,
    maxPower: station.maxPower ?? undefined,
    priceKwh: station.priceKwh ?? 0,
    socketType: station.socketType,
    _fromCache: true,
    // Add distance for sorting (not part of StationInfoPartial but useful internally)
    ...(distanceKm !== undefined && { _distanceKm: distanceKm }),
  };
}

/**
 * Search stations by location from local library
 * No network requests - instant results
 */
export async function searchLocalStations(
  lat: number,
  lon: number,
  radiusKm: number,
  onlyFree = true
): Promise<StationInfoPartial[]> {
  const library = await loadLibrary();

  if (library.length === 0) {
    console.warn('[LocalSearch] Library is empty');
    return [];
  }

  const results: Array<{ station: LibraryStation; distance: number }> = [];

  for (const station of library) {
    // Filter by free/paid
    if (onlyFree && !station.free) {
      continue;
    }

    const distance = calculateDistance(lat, lon, station.lat, station.lon);

    if (distance <= radiusKm) {
      results.push({ station, distance });
    }
  }

  // Sort by distance (closest first)
  results.sort((a, b) => a.distance - b.distance);

  return results.map(({ station, distance }) => toStationInfoPartial(station, distance));
}

/**
 * Get library statistics
 */
export async function getLibraryStats(): Promise<{
  total: number;
  free: number;
  paid: number;
}> {
  const library = await loadLibrary();
  const free = library.filter((s) => s.free).length;
  return {
    total: library.length,
    free,
    paid: library.length - free,
  };
}

/**
 * Check if local library is available
 */
export async function isLibraryAvailable(): Promise<boolean> {
  const library = await loadLibrary();
  return library.length > 0;
}

/**
 * Clear library cache (for testing or reload)
 */
export function clearLibraryCache(): void {
  libraryCache = null;
}
