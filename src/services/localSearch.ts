/**
 * Station search with Supabase primary and local JSON fallback
 */

import { supabase } from '../../api/supabase';
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

interface SupabaseStationResult {
  cp_id: number;
  cupr_id: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  socket_type: string | null;
  max_power: number | null;
  price_kwh: number;
  total_ports: number;
  free: boolean;
  distance_km: number;
}

let libraryCache: LibraryStation[] | null = null;

/**
 * Search stations via Supabase RPC
 */
async function searchViaSupabase(
  lat: number,
  lon: number,
  radiusKm: number,
  onlyFree: boolean
): Promise<StationInfoPartial[] | null> {
  try {
    const { data, error } = await supabase.rpc('search_stations_nearby', {
      p_lat: lat,
      p_lon: lon,
      p_radius_km: radiusKm,
      p_only_free: onlyFree,
    });

    if (error) {
      console.warn('[LocalSearch] Supabase RPC error:', error.message);
      return null;
    }

    if (!data || !Array.isArray(data)) {
      return null;
    }

    return (data as SupabaseStationResult[]).map((s) => ({
      cpId: s.cp_id,
      cuprId: s.cupr_id,
      name: s.name,
      latitude: s.lat,
      longitude: s.lon,
      addressFull: s.address,
      overallStatus: 'AVAILABLE' as const,
      totalPorts: s.total_ports,
      maxPower: s.max_power ?? undefined,
      priceKwh: s.price_kwh,
      socketType: s.socket_type ?? 'Unknown',
      _fromCache: true,
      _distanceKm: s.distance_km,
    }));
  } catch (err) {
    console.warn('[LocalSearch] Supabase fetch failed:', err);
    return null;
  }
}

/**
 * Load station library from public/stations/library.json
 * Used as fallback when Supabase is unavailable
 */
async function loadLibrary(): Promise<LibraryStation[]> {
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
    overallStatus: 'AVAILABLE',
    totalPorts: station.totalPorts,
    maxPower: station.maxPower ?? undefined,
    priceKwh: station.priceKwh ?? 0,
    socketType: station.socketType,
    _fromCache: true,
    ...(distanceKm !== undefined && { _distanceKm: distanceKm }),
  };
}

/**
 * Search stations from local library (fallback)
 */
async function searchFromLibrary(
  lat: number,
  lon: number,
  radiusKm: number,
  onlyFree: boolean
): Promise<StationInfoPartial[]> {
  const library = await loadLibrary();

  if (library.length === 0) {
    return [];
  }

  const results: Array<{ station: LibraryStation; distance: number }> = [];

  for (const station of library) {
    if (onlyFree && !station.free) {
      continue;
    }

    const distance = calculateDistance(lat, lon, station.lat, station.lon);

    if (distance <= radiusKm) {
      results.push({ station, distance });
    }
  }

  results.sort((a, b) => a.distance - b.distance);

  return results.map(({ station, distance }) => toStationInfoPartial(station, distance));
}

/**
 * Search stations by location
 * Primary: Supabase RPC
 * Fallback: Local JSON library (3 nearby stations)
 */
export async function searchLocalStations(
  lat: number,
  lon: number,
  radiusKm: number,
  onlyFree = true
): Promise<StationInfoPartial[]> {
  // Try Supabase first
  const supabaseResults = await searchViaSupabase(lat, lon, radiusKm, onlyFree);

  if (supabaseResults !== null) {
    console.log(`[LocalSearch] Found ${supabaseResults.length} stations via Supabase`);
    return supabaseResults;
  }

  // Fallback to local library
  console.log('[LocalSearch] Using local library fallback');
  return searchFromLibrary(lat, lon, radiusKm, onlyFree);
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
