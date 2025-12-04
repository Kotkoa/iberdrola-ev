import { supabase, supabaseFetch } from './supabase'
import type { ChargerStatus } from '../types/charger'

export async function getLatestChargerStatus() {
  return supabaseFetch<ChargerStatus[]>(
    'charge_logs_parsed?select=*&order=created_at.desc&limit=1'
  )
}

export function subscribeToLatestCharger(
  onUpdate: (charger: ChargerStatus) => void
) {
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
        onUpdate(payload.new as ChargerStatus)
      }
    )
    .subscribe()

  return () => {
    channel.unsubscribe()
  }
}
