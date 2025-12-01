export interface ChargerStatus {
  id: string
  created_at: string
  cp_id: number
  cp_name: string
  schedule: string | null
  port1_status: string | null
  port2_status: string | null
  port1_power_kw: number | null
  port2_power_kw: number | null
  overall_status: string | null
}
