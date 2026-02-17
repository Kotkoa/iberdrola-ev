import { TEST_STATION } from './constants';

interface PollStationOptions {
  cpId?: number;
  port1Status?: string | null;
  port2Status?: string | null;
  overallStatus?: string | null;
  observedAt?: string;
}

/** Successful poll-station response matching ApiSuccessResponse<PollStationData> */
export function createPollSuccess(options: PollStationOptions = {}) {
  const observedAt = options.observedAt ?? new Date().toISOString();
  return {
    ok: true,
    data: {
      cp_id: options.cpId ?? TEST_STATION.cpId,
      port1_status: options.port1Status ?? 'AVAILABLE',
      port2_status: options.port2Status ?? 'BUSY',
      port1_update_date: observedAt,
      port2_update_date: observedAt,
      overall_status: options.overallStatus ?? 'AVAILABLE',
      observed_at: observedAt,
    },
  };
}

/** Rate-limited poll-station response matching ApiErrorResponse */
export function createPollRateLimited(retryAfter = 300) {
  return {
    ok: false,
    error: {
      code: 'RATE_LIMITED' as const,
      message: 'Too many requests',
      retry_after: retryAfter,
    },
  };
}

/** Generic error poll-station response */
export function createPollError(code = 'INTERNAL_ERROR', message = 'Internal error') {
  return {
    ok: false,
    error: { code, message },
  };
}

interface StartWatchOptions {
  port1Status?: string | null;
  port2Status?: string | null;
}

/** Successful start-watch response matching ApiSuccessResponse<StartWatchData> */
export function createStartWatchSuccess(options: StartWatchOptions = {}) {
  return {
    ok: true,
    data: {
      subscription_id: 'test-sub-id-000',
      task_id: 'test-task-id-000',
      current_status: {
        port1_status: options.port1Status ?? 'BUSY',
        port2_status: options.port2Status ?? 'BUSY',
        observed_at: new Date().toISOString(),
      },
      fresh: true,
      next_poll_in: null,
    },
  };
}

/** check-subscription response */
export function createCheckSubscriptionResponse(subscribedPorts: number[] = []) {
  return { subscribedPorts };
}
