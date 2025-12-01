import { supabaseFetch } from './supabase'
import type { ChargerStatus } from '../types/charger'

export async function getLatestChargerStatus() {
  return supabaseFetch<ChargerStatus[]>(
    'charge_logs_parsed?select=*&order=created_at.desc&limit=1'
  )
}
