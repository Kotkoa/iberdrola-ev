import { supabase, supabaseFetch } from './supabase.js';
import type { ChargerStatus } from '../types/charger.js';
import type { RealtimeConnectionState, SubscriptionResult } from '../types/realtime.js';

export function unsubscribeAllChannels(): void {
  supabase.removeAllChannels();
}

// ========================
// Station Snapshots
// ========================

type RawSnapshotData = {
  id: string;
  cp_id: number;
  source: string;
  observed_at: string;
  payload_hash: string;
  port1_status: string | null;
  port1_power_kw: string | number | null;
  port1_price_kwh: string | number | null;
  port1_update_date: string | null;
  port2_status: string | null;
  port2_power_kw: string | number | null;
  port2_price_kwh: string | number | null;
  port2_update_date: string | null;
  overall_status: string | null;
  emergency_stop_pressed: boolean | null;
  situation_code: string | null;
  created_at: string;
};

export interface StationSnapshot {
  id: string;
  cp_id: number;
  source: 'scraper' | 'user_nearby' | 'user_station';
  observed_at: string;
  port1_status: string | null;
  port1_power_kw: number | null;
  port1_price_kwh: number | null;
  port1_update_date: string | null;
  port2_status: string | null;
  port2_power_kw: number | null;
  port2_price_kwh: number | null;
  port2_update_date: string | null;
  overall_status: string | null;
  emergency_stop_pressed: boolean | null;
  situation_code: string | null;
  created_at: string;
}

function normalizeSnapshotData(raw: RawSnapshotData): StationSnapshot {
  return {
    ...raw,
    source: raw.source as StationSnapshot['source'],
    port1_power_kw: raw.port1_power_kw != null ? Number(raw.port1_power_kw) : null,
    port2_power_kw: raw.port2_power_kw != null ? Number(raw.port2_power_kw) : null,
    port1_price_kwh: raw.port1_price_kwh != null ? Number(raw.port1_price_kwh) : null,
    port2_price_kwh: raw.port2_price_kwh != null ? Number(raw.port2_price_kwh) : null,
  };
}

export async function getLatestSnapshot(cpId: number): Promise<StationSnapshot | null> {
  const data = await supabaseFetch<RawSnapshotData[]>(
    `station_snapshots?select=*&cp_id=eq.${cpId}&order=observed_at.desc&limit=1`
  );
  if (!data || data.length === 0) return null;
  return normalizeSnapshotData(data[0]);
}

export function subscribeToSnapshots(
  cpId: number,
  onUpdate: (snapshot: StationSnapshot) => void,
  onConnectionStateChange?: (state: RealtimeConnectionState) => void
): SubscriptionResult {
  let connectionState: RealtimeConnectionState = 'connecting';

  const channel = supabase
    .channel(`station_snapshots_${cpId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'station_snapshots',
        filter: `cp_id=eq.${cpId}`,
      },
      (payload) => {
        const rawData = payload.new as RawSnapshotData;
        console.log(`[Realtime:snapshots:${cpId}] New snapshot:`, rawData);

        if (rawData && rawData.cp_id) {
          try {
            const normalizedData = normalizeSnapshotData(rawData);
            onUpdate(normalizedData);
          } catch (err) {
            console.error(`[Realtime:snapshots:${cpId}] Normalize error:`, err);
          }
        }
      }
    )
    .subscribe((status, err) => {
      switch (status) {
        case 'SUBSCRIBED':
          connectionState = 'connected';
          console.log(`[Realtime:${cpId}] Connected`);
          onConnectionStateChange?.('connected');
          break;
        case 'CHANNEL_ERROR':
          connectionState = 'error';
          console.error(`[Realtime:${cpId}] Channel error:`, err?.message);
          onConnectionStateChange?.('error');
          break;
        case 'TIMED_OUT':
          connectionState = 'error';
          console.error(`[Realtime:${cpId}] Connection timed out`);
          onConnectionStateChange?.('error');
          break;
        case 'CLOSED':
          connectionState = 'disconnected';
          console.log(`[Realtime:${cpId}] Disconnected`);
          onConnectionStateChange?.('disconnected');
          break;
      }
    });

  return {
    unsubscribe: () => {
      channel.unsubscribe();
    },
    getConnectionState: () => connectionState,
  };
}

export function snapshotToChargerStatus(
  snapshot: StationSnapshot,
  metadata?: {
    cp_name?: string;
    cp_latitude?: number;
    cp_longitude?: number;
    address_full?: string;
  }
): ChargerStatus {
  return {
    id: snapshot.id,
    created_at: snapshot.created_at,
    cp_id: snapshot.cp_id,
    cp_name: metadata?.cp_name || 'Unknown',
    schedule: '24/7',
    port1_status: snapshot.port1_status,
    port2_status: snapshot.port2_status,
    port1_power_kw: snapshot.port1_power_kw,
    port2_power_kw: snapshot.port2_power_kw,
    port1_update_date: snapshot.port1_update_date,
    port2_update_date: snapshot.port2_update_date,
    overall_status: snapshot.overall_status,
    overall_update_date: snapshot.observed_at,
    cp_latitude: metadata?.cp_latitude,
    cp_longitude: metadata?.cp_longitude,
    address_full: metadata?.address_full,
    port1_price_kwh: snapshot.port1_price_kwh,
    port2_price_kwh: snapshot.port2_price_kwh,
    emergency_stop_pressed: snapshot.emergency_stop_pressed,
    situation_code: snapshot.situation_code,
  };
}

// ========================
// Station Metadata
// ========================

export interface StationMetadata {
  cp_id: number;
  cupr_id: number;
  latitude: number | null;
  longitude: number | null;
  address_full: string | null;
}

type RawMetadataRow = {
  cp_id: number;
  cupr_id: number;
  latitude: string | number | null;
  longitude: string | number | null;
  address_full: string | null;
};

export async function getStationMetadata(cpId: number): Promise<StationMetadata | null> {
  const data = await supabaseFetch<RawMetadataRow[]>(
    `station_metadata?select=cp_id,cupr_id,latitude,longitude,address_full&cp_id=eq.${cpId}&limit=1`
  );
  if (!data || data.length === 0) return null;

  const raw = data[0];
  return {
    cp_id: raw.cp_id,
    cupr_id: raw.cupr_id,
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    address_full: raw.address_full,
  };
}
