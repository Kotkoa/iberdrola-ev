/**
 * API Client for Edge Functions
 *
 * Provides typed functions for calling poll-station and start-watch Edge Functions.
 * All functions return ApiResponse<T> which should be handled with type guards.
 *
 * @example
 * ```typescript
 * import { pollStation, isApiSuccess, isRateLimited } from './apiClient';
 *
 * const response = await pollStation(144569);
 *
 * if (isApiSuccess(response)) {
 *   console.log(response.data.port1_status);
 * } else if (isRateLimited(response)) {
 *   console.log(`Retry after ${response.error.retry_after}s`);
 * } else {
 *   console.error(response.error.message);
 * }
 * ```
 */

import type { ApiResponse, PollStationData, StartWatchData, StartWatchRequest } from '../types/api';

// Re-export type guards for convenience
export { isApiSuccess, isRateLimited, isApiError } from '../types/api';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Base URL for Edge Functions
 */
const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

/**
 * Default headers for Edge Function requests
 */
function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

/**
 * Poll a station for fresh data
 *
 * Fetches current status directly from Iberdrola API via Edge Function.
 * May return RATE_LIMITED error if polled too frequently (5 min interval).
 *
 * @param cuprId - CUPR ID of the station to poll
 * @returns ApiResponse with PollStationData on success
 *
 * @example
 * ```typescript
 * const response = await pollStation(144569);
 * if (isApiSuccess(response)) {
 *   const { port1_status, port2_status } = response.data;
 * }
 * ```
 */
export async function pollStation(cuprId: number): Promise<ApiResponse<PollStationData>> {
  try {
    const response = await fetch(`${EDGE_BASE}/poll-station`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ cupr_id: cuprId }),
    });

    const json = await response.json();

    // Edge Function always returns valid JSON with ok field
    return json as ApiResponse<PollStationData>;
  } catch (error) {
    // Network error or JSON parse error
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  }
}

/**
 * Subscribe to station updates with automatic polling
 *
 * Creates a push subscription and polling task for the specified station/port.
 * Returns current status (fresh or cached) along with subscription details.
 *
 * @param request - StartWatchRequest with cupr_id, port, and subscription details
 * @returns ApiResponse with StartWatchData on success
 *
 * @example
 * ```typescript
 * const response = await startWatch({
 *   cupr_id: 144569,
 *   port: 1,
 *   subscription: {
 *     endpoint: pushSubscription.endpoint,
 *     keys: { p256dh: '...', auth: '...' }
 *   }
 * });
 *
 * if (isApiSuccess(response)) {
 *   const { subscription_id, fresh, next_poll_in } = response.data;
 *   if (!fresh) {
 *     console.log(`Data from cache, next poll in ${next_poll_in}s`);
 *   }
 * }
 * ```
 */
export async function startWatch(request: StartWatchRequest): Promise<ApiResponse<StartWatchData>> {
  try {
    const response = await fetch(`${EDGE_BASE}/start-watch`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(request),
    });

    const json = await response.json();

    return json as ApiResponse<StartWatchData>;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  }
}
