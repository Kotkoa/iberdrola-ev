/**
 * Unified API Response Types for Edge Functions
 *
 * All Edge Functions (poll-station, start-watch) follow this response format.
 * Use type guards `isApiSuccess` and `isRateLimited` for type-safe handling.
 */

/**
 * Success response wrapper
 */
export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

/**
 * Error response wrapper with machine-readable code
 */
export interface ApiErrorResponse {
  ok: false;
  error: {
    /** Machine-readable error code */
    code: ApiErrorCode;
    /** Human-readable error message */
    message: string;
    /** Seconds until retry is allowed (for RATE_LIMITED) */
    retry_after?: number;
  };
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Machine-readable error codes
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

// ============================================================================
// poll-station Types
// ============================================================================

/**
 * Response data from POST /functions/v1/poll-station
 */
export interface PollStationData {
  /** Charge point ID */
  cp_id: number;
  /** Port 1 status (e.g., 'Available', 'Occupied', 'OutOfService') */
  port1_status: string | null;
  /** Port 1 power in kW */
  port1_power_kw?: number | null;
  /** Port 1 price per kWh */
  port1_price_kwh?: number | null;
  /** Timestamp when port 1 status last changed */
  port1_update_date: string | null;
  /** Port 2 status */
  port2_status: string | null;
  /** Port 2 power in kW */
  port2_power_kw?: number | null;
  /** Port 2 price per kWh */
  port2_price_kwh?: number | null;
  /** Timestamp when port 2 status last changed */
  port2_update_date: string | null;
  /** Overall station status */
  overall_status: string | null;
  /** Whether emergency stop is pressed */
  emergency_stop_pressed?: boolean | null;
  /** Situation code (e.g., 'OPER') */
  situation_code?: string | null;
  /** Timestamp when snapshot was recorded */
  observed_at: string;
}

/**
 * Meta information from poll-station response
 */
export interface PollStationMeta {
  /** Always false — data is from Supabase cache, not live Iberdrola API */
  fresh: boolean;
  /** True if GitHub Action scraper was dispatched */
  scraper_triggered: boolean;
  /** Seconds until next scraper trigger allowed (null if can trigger now) */
  retry_after: number | null;
}

/**
 * Full success response from poll-station (includes meta).
 * Separate type from generic ApiSuccessResponse to preserve meta access after type guards.
 */
export interface PollStationSuccessResponse {
  ok: true;
  data: PollStationData;
  meta: PollStationMeta;
}

/**
 * Request body for POST /functions/v1/poll-station
 */
export interface PollStationRequest {
  /** CUPR ID of the station to poll */
  cupr_id: number;
}

// ============================================================================
// start-watch Types
// ============================================================================

/**
 * Response data from POST /functions/v1/start-watch
 */
export interface StartWatchData {
  /** UUID of created subscription */
  subscription_id: string;
  /** UUID of polling task */
  task_id: string;
  /** Current station status at subscription time */
  current_status: {
    port1_status: string | null;
    port2_status: string | null;
    observed_at: string;
  };
  /** True if data was freshly polled, false if from cache (rate limited) */
  fresh: boolean;
  /** Seconds until next poll (when fresh=false) */
  next_poll_in: number | null;
}

/**
 * Request body for POST /functions/v1/start-watch
 */
export interface StartWatchRequest {
  /** CUPR ID of the station to watch */
  cupr_id: number;
  /** Port to watch: 1, 2, or null for any */
  port: 1 | 2 | null;
  /** Push subscription details */
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

// ============================================================================
// search-nearby Types
// ============================================================================

/**
 * Single station result from search-nearby
 */
export interface SearchNearbyStation {
  cpId: number;
  cuprId: number;
  name: string;
  latitude: number;
  longitude: number;
  addressFull: string;
  overallStatus: string | null;
  totalPorts: number | null;
  maxPower: number | null;
  freePorts: number | null;
  priceKwh: number | null;
  socketType: string | null;
  distanceKm: number;
  verificationState: 'verified_free' | 'verified_paid' | 'unprocessed' | 'failed' | 'dead_letter';
}

/**
 * Response data from POST /functions/v1/search-nearby
 */
export interface SearchNearbyData {
  stations: SearchNearbyStation[];
  count: number;
}

/**
 * Meta information from search-nearby response
 */
export interface SearchNearbyMeta {
  /** Always false - data from cache */
  fresh: boolean;
  /** True if GitHub Action was triggered */
  scraper_triggered: boolean;
  /** Seconds until next trigger allowed (null if can trigger now) */
  retry_after: number | null;
  /** Number of stations enqueued for verification in this request */
  verification_enqueued?: number;
}

/**
 * Full success response from search-nearby (includes meta)
 */
export interface SearchNearbySuccessResponse {
  ok: true;
  data: SearchNearbyData;
  meta: SearchNearbyMeta;
}

/**
 * Request body for POST /functions/v1/search-nearby
 */
export interface SearchNearbyRequest {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for successful API response
 *
 * @example
 * ```typescript
 * const response = await pollStation(144569);
 * if (isApiSuccess(response)) {
 *   console.log(response.data.port1_status); // TypeScript knows data exists
 * }
 * ```
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.ok === true;
}

/**
 * Type guard for rate limited response
 *
 * @example
 * ```typescript
 * const response = await pollStation(144569);
 * if (isRateLimited(response)) {
 *   const retryAfter = response.error.retry_after ?? 300;
 *   console.log(`Retry after ${retryAfter} seconds`);
 * }
 * ```
 */
export function isRateLimited(
  response: ApiResponse<unknown>
): response is ApiErrorResponse & { error: { code: 'RATE_LIMITED' } } {
  return response.ok === false && response.error.code === 'RATE_LIMITED';
}

/**
 * Type guard for any error response
 */
export function isApiError(response: ApiResponse<unknown>): response is ApiErrorResponse {
  return response.ok === false;
}
