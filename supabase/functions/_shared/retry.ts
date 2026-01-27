/**
 * HTTP error classification types
 */
export type HttpErrorType = 'rate_limit' | 'server_error' | 'not_found' | 'unknown';

/**
 * Classify HTTP status code into error type
 * @param status HTTP status code
 * @returns Error type classification
 */
export function classifyHttpError(status: number): HttpErrorType {
  if (status === 403 || status === 429) return 'rate_limit';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/**
 * Configuration for retry with exponential backoff
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 5000,
};

/**
 * Retry a function with exponential backoff
 *
 * Handles HTTP errors with different retry strategies:
 * - 404: No retry (not found is permanent)
 * - 403/429: Rate limit - retry with backoff
 * - 500+: Server error - retry with backoff
 *
 * @param fn Function to retry
 * @param config Retry configuration
 * @returns Object with either data or error
 *
 * @example
 * ```typescript
 * const { data, error } = await retryWithBackoff(
 *   async () => {
 *     const response = await fetch(url);
 *     if (!response.ok) throw response;
 *     return await response.json();
 *   },
 *   { maxAttempts: 2, baseDelayMs: 500 }
 * );
 *
 * if (error) {
 *   if (error.type === 'rate_limit') {
 *     // Handle rate limit - maybe serve from cache
 *   }
 * }
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<{ data?: T; error?: { type: HttpErrorType; message: string } }> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fn();
      return { data };
    } catch (error: unknown) {
      const isLastAttempt = attempt === maxAttempts;

      if (error instanceof Response) {
        const errorType = classifyHttpError(error.status);

        // Don't retry 404s - not found is permanent
        if (errorType === 'not_found') {
          return { error: { type: errorType, message: 'Station not found' } };
        }

        // Don't retry rate limits on last attempt
        if (errorType === 'rate_limit' && isLastAttempt) {
          return { error: { type: errorType, message: 'Rate limit exceeded' } };
        }

        if (!isLastAttempt) {
          // Exponential backoff: 1s, 2s, 4s, etc (capped at maxDelayMs)
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return { error: { type: errorType, message: error.statusText || 'HTTP error' } };
      }

      if (isLastAttempt) {
        return {
          error: {
            type: 'unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        };
      }
    }
  }

  return { error: { type: 'unknown', message: 'Max retries exceeded' } };
}
