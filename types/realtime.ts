/**
 * WebSocket connection state machine for Supabase Realtime
 *
 * State transitions:
 * - disconnected -> connecting (subscription initiated)
 * - connecting -> connected (subscribe callback: SUBSCRIBED)
 * - connecting -> error (subscribe callback: CHANNEL_ERROR/TIMED_OUT)
 * - connected -> disconnected (channel closed / network loss)
 * - error -> reconnecting (reconnection attempt scheduled)
 * - disconnected -> reconnecting (reconnection attempt scheduled)
 * - reconnecting -> connecting (reconnection attempt started)
 * - reconnecting -> connected (reconnection successful)
 */
export type RealtimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface RealtimeConnectionStatus {
  state: RealtimeConnectionState;
  lastConnectedAt: Date | null;
  lastErrorAt: Date | null;
  errorMessage: string | null;
  reconnectAttempts: number;
}

export interface SubscriptionResult {
  unsubscribe: () => void;
  getConnectionState: () => RealtimeConnectionState;
}
