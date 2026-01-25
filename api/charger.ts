import { supabase, supabaseFetch } from './supabase.js';
import type { ChargerStatus } from '../types/charger.js';

type RawChargerStatus = Omit<
  ChargerStatus,
  'port1_price_kwh' | 'port2_price_kwh' | 'cp_latitude' | 'cp_longitude'
> & {
  port1_price_kwh?: string | number | null;
  port2_price_kwh?: string | number | null;
  cp_latitude?: string | number | null;
  cp_longitude?: string | number | null;
};

function normalizeChargerData(raw: RawChargerStatus): ChargerStatus {
  return {
    ...raw,
    port1_price_kwh: raw.port1_price_kwh != null ? Number(raw.port1_price_kwh) : null,
    port2_price_kwh: raw.port2_price_kwh != null ? Number(raw.port2_price_kwh) : null,
    cp_latitude: raw.cp_latitude != null ? Number(raw.cp_latitude) : null,
    cp_longitude: raw.cp_longitude != null ? Number(raw.cp_longitude) : null,
  };
}

export async function getLatestChargerStatus() {
  const data = await supabaseFetch<ChargerStatus[]>(
    'charge_logs_parsed?select=*&order=created_at.desc&limit=1'
  );
  return data?.map(normalizeChargerData);
}

export async function getChargerStatusById(cpId: number): Promise<ChargerStatus | null> {
  const data = await supabaseFetch<ChargerStatus[]>(
    `charge_logs_parsed?select=*&cp_id=eq.${cpId}&order=created_at.desc&limit=1`
  );
  if (!data || data.length === 0) return null;
  return normalizeChargerData(data[0] as RawChargerStatus);
}

export function subscribeToLatestCharger(onUpdate: (charger: ChargerStatus) => void) {
  const channel = supabase
    .channel('charge_logs_latest')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'charge_logs_parsed',
      },
      (payload) => {
        const rawData = payload.new as RawChargerStatus;
        console.log('[Realtime:latest] Raw payload:', JSON.stringify(rawData, null, 2));

        if (rawData && rawData.cp_id && rawData.cp_name && rawData.overall_status) {
          try {
            const normalizedData = normalizeChargerData(rawData);
            console.log('[Realtime:latest] Normalized:', {
              cp_id: normalizedData.cp_id,
              port1_status: normalizedData.port1_status,
              port2_status: normalizedData.port2_status,
            });
            onUpdate(normalizedData);
          } catch (err) {
            console.error('[Realtime:latest] Normalize error:', err);
          }
        } else {
          console.warn('[Realtime:latest] Incomplete data, ignoring:', rawData);
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToCharger(cpId: number, onUpdate: (charger: ChargerStatus) => void) {
  const channel = supabase
    .channel(`charge_logs_${cpId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'charge_logs_parsed',
        filter: `cp_id=eq.${cpId}`,
      },
      (payload) => {
        const rawData = payload.new as RawChargerStatus;
        console.log(`[Realtime:${cpId}] Raw payload:`, JSON.stringify(rawData, null, 2));

        if (rawData && rawData.cp_id && rawData.cp_name && rawData.overall_status) {
          try {
            const normalizedData = normalizeChargerData(rawData);
            console.log(`[Realtime:${cpId}] Normalized:`, {
              cp_id: normalizedData.cp_id,
              port1_status: normalizedData.port1_status,
              port2_status: normalizedData.port2_status,
            });
            onUpdate(normalizedData);
          } catch (err) {
            console.error(`[Realtime:${cpId}] Normalize error:`, err);
          }
        } else {
          console.warn(`[Realtime:${cpId}] Incomplete data, ignoring:`, rawData);
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

export function unsubscribeAllChannels(): void {
  supabase.removeAllChannels();
}

// ========================
// Station Snapshots (new table)
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

export function subscribeToSnapshots(cpId: number, onUpdate: (snapshot: StationSnapshot) => void) {
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
    .subscribe();

  return () => {
    channel.unsubscribe();
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
