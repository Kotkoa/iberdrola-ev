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
  /** Port 2 status */
  port2_status: string | null;
  /** Overall station status */
  overall_status: string | null;
  /** Timestamp when data was observed */
  observed_at: string;
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
