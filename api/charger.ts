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
        if (rawData && rawData.cp_id && rawData.cp_name && rawData.overall_status) {
          const normalizedData = normalizeChargerData(rawData);
          onUpdate(normalizedData);
        } else {
          console.warn('Received incomplete charger data from Realtime, ignoring:', rawData);
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
        if (rawData && rawData.cp_id && rawData.cp_name && rawData.overall_status) {
          const normalizedData = normalizeChargerData(rawData);
          onUpdate(normalizedData);
        } else {
          console.warn('Received incomplete charger data from Realtime, ignoring:', rawData);
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
