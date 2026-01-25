import type { StationInfo, StationDetails } from './iberdrola';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

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

export function stationInfoToSnapshotData(
  station: StationInfo,
  details: StationDetails | null
): SaveSnapshotRequest['stationData'] {
  const logical = details?.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
  const port1 = flattened[0];
  const port2 = flattened[1];

  return {
    cpName: details?.locationData?.cuprName,
    latitude: station.latitude,
    longitude: station.longitude,
    addressFull: station.addressFull,
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
    overallStatus: details?.cpStatus?.statusCode,
    emergencyStopPressed: details?.emergencyStopButtonPressed,
    situationCode: details?.locationData?.situationCode,
  };
}

export function detailsToSnapshotData(details: StationDetails): SaveSnapshotRequest['stationData'] {
  const logical = details.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
  const port1 = flattened[0];
  const port2 = flattened[1];

  const addr = details.locationData?.supplyPointData?.cpAddress;
  const addressFull = addr
    ? `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim()
    : undefined;

  return {
    cpName: details.locationData?.cuprName,
    latitude: details.locationData?.latitude,
    longitude: details.locationData?.longitude,
    addressFull,
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
    overallStatus: details.cpStatus?.statusCode,
    emergencyStopPressed: details.emergencyStopButtonPressed,
    situationCode: details.locationData?.situationCode,
  };
}

export { type SaveSnapshotRequest };
