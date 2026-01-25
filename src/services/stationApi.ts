import type { ChargerStatus } from '../../types/charger';
import type { StationInfo } from './iberdrola';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface SearchResponse {
  stations: (StationInfo & {
    port1_status: string | null;
    port2_status: string | null;
    port1_power_kw: number | null;
    port2_power_kw: number | null;
    port1_price_kwh: number | null;
    port2_price_kwh: number | null;
    overall_status: string | null;
    emergency_stop_pressed: boolean;
    situation_code: string | null;
  })[];
  count: number;
}

interface StationDetailsResponse {
  station: ChargerStatus;
}

export async function searchNearbyStations(
  latitude: number,
  longitude: number,
  radiusKm: number
): Promise<StationInfo[]> {
  const response = await fetch(`${EDGE_BASE}/search-nearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ latitude, longitude, radiusKm }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Search failed' }));
    throw new Error(error.error || 'Search failed');
  }

  const data: SearchResponse = await response.json();
  return data.stations;
}

export async function getStationDetails(
  cuprId: number,
  cpId: number
): Promise<ChargerStatus | null> {
  const response = await fetch(`${EDGE_BASE}/station-details`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ cuprId, cpId }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const error = await response.json().catch(() => ({ error: 'Failed to fetch station details' }));
    throw new Error(error.error || 'Failed to fetch station details');
  }

  const data: StationDetailsResponse = await response.json();
  return data.station;
}
