export interface ChargerStatus {
  id: string
  created_at: string
  cp_id: number
  cp_name: string
  schedule: string | null
  port1_status: string | null
  port2_status: string | null
  port1_power_kw: number | null
  port1_update_date: string | null
  port2_power_kw: number | null
  port2_update_date: string | null
  overall_status: string | null
  overall_update_date: string | null
}
