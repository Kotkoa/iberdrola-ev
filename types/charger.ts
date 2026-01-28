import type { RealtimeConnectionState } from './realtime.js';

export interface ChargerStatus {
  id: string;
  created_at: string;
  cp_id: number;
  cp_name: string;
  schedule: string | null;
  port1_status: string | null;
  port2_status: string | null;
  port1_power_kw: number | null;
  port1_update_date: string | null;
  port2_power_kw: number | null;
  port2_update_date: string | null;
  overall_status: string | null;
  overall_update_date: string | null;
  // Location
  cp_latitude?: number | null;
  cp_longitude?: number | null;
  // Extended fields from Iberdrola API
  address_full?: string | null;
  port1_price_kwh?: number | null;
  port2_price_kwh?: number | null;
  port1_socket_type?: string | null;
  port2_socket_type?: string | null;
  emergency_stop_pressed?: boolean | null;
  situation_code?: string | null;
}

/**
 * State machine for station data loading
 *
 * State transitions:
 * - idle → loading_cache (when cpId is provided)
 * - loading_cache → ready (fresh data found)
 * - loading_cache → loading_api (stale/missing data, need Edge fetch)
 * - loading_api → ready (Edge fetch successful)
 * - loading_api → error (Edge fetch failed)
 * - * → idle (cpId cleared)
 * - * → error (any error occurs)
 */
export type StationDataState =
  | 'idle' // No cpId selected
  | 'loading_cache' // Fetching from Supabase
  | 'loading_api' // Fetching from Edge (stale/missing data)
  | 'ready' // Data available
  | 'error'; // Error occurred

/**
 * Status returned by useStationData hook
 *
 * Replaces multiple boolean flags with a clear state machine
 * and provides all information needed to render loading/error/data states
 */
export interface StationDataStatus {
  /** Current state of data loading */
  state: StationDataState;
  /** Station data (null if not loaded yet) */
  data: ChargerStatus | null;
  /** Error message (null if no error) */
  error: string | null;
  /**
   * WebSocket connection state for realtime updates
   * Possible values: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'
   */
  connectionState: RealtimeConnectionState;
  /**
   * Whether realtime subscription is active
   * @deprecated Use connectionState === 'connected' instead
   */
  hasRealtime: boolean;
  /** Whether current data is stale (older than TTL) */
  isStale: boolean;
}
