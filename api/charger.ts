import { supabase, supabaseFetch } from './supabase.js';
import type { ChargerStatus } from '../types/charger.js';

export async function getLatestChargerStatus() {
  return supabaseFetch<ChargerStatus[]>(
    'charge_logs_parsed?select=*&order=created_at.desc&limit=1'
  );
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
        const newData = payload.new as ChargerStatus;
        // Validate essential fields before updating to prevent crashes from partial data
        if (newData && newData.cp_id && newData.cp_name && newData.overall_status) {
          onUpdate(newData);
        } else {
          console.warn('Received incomplete charger data from Realtime, ignoring:', newData);
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
