import type { StationInfo, StationDetails } from './iberdrola';
import { supabase } from '../../api/supabase';
import { CHARGING_POINT_STATUS } from '../constants';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const CACHE_TTL_MINUTES = 5;

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
  cpIds: number[]
): Promise<Map<number, CachedStationInfo>> {
  const result = new Map<number, CachedStationInfo>();

  if (cpIds.length === 0) return result;

  const ttlAgo = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();

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
