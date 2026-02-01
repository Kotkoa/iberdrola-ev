/**
 * Client-side rate limit cache
 *
 * Tracks rate-limited stations to avoid unnecessary API calls.
 * When a station returns RATE_LIMITED error, we cache it for retry_after seconds.
 *
 * @example
 * ```typescript
 * import { isStationRateLimited, markRateLimited } from './rateLimitCache';
 *
 * // Before making API call
 * if (isStationRateLimited(cuprId)) {
 *   // Use cached data instead
 *   return;
 * }
 *
 * const response = await pollStation(cuprId);
 * if (isRateLimited(response)) {
 *   markRateLimited(cuprId, response.error.retry_after ?? 300);
 * }
 * ```
 */

interface RateLimitEntry {
  /** Timestamp (ms) when rate limit expires */
  until: number;
}

/**
 * In-memory cache of rate-limited stations
 * Key: cuprId, Value: { until: timestamp }
 */
const rateLimitCache = new Map<number, RateLimitEntry>();

/**
 * Check if a station is currently rate limited
 *
 * @param cuprId - CUPR ID of the station
 * @returns true if station is rate limited (should not poll)
 */
export function isStationRateLimited(cuprId: number): boolean {
  const entry = rateLimitCache.get(cuprId);
  if (!entry) return false;

  const now = Date.now();
  if (now < entry.until) {
    return true;
  }

  // Rate limit expired, clean up entry
  rateLimitCache.delete(cuprId);
  return false;
}

/**
 * Get seconds remaining until rate limit expires
 *
 * @param cuprId - CUPR ID of the station
 * @returns Seconds remaining, or 0 if not rate limited
 */
export function getRateLimitSecondsRemaining(cuprId: number): number {
  const entry = rateLimitCache.get(cuprId);
  if (!entry) return 0;

  const remaining = Math.ceil((entry.until - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Mark a station as rate limited
 *
 * @param cuprId - CUPR ID of the station
 * @param retryAfterSeconds - Seconds until rate limit expires (default: 300)
 */
export function markRateLimited(cuprId: number, retryAfterSeconds: number = 300): void {
  rateLimitCache.set(cuprId, {
    until: Date.now() + retryAfterSeconds * 1000,
  });
}

/**
 * Clear rate limit for a specific station
 *
 * @param cuprId - CUPR ID of the station
 */
export function clearStationRateLimit(cuprId: number): void {
  rateLimitCache.delete(cuprId);
}

/**
 * Clear all rate limit entries
 * Useful for testing or when user logs out
 */
export function clearRateLimitCache(): void {
  rateLimitCache.clear();
}

/**
 * Get the number of currently rate-limited stations
 * Useful for debugging
 */
export function getRateLimitedStationCount(): number {
  // Clean up expired entries first
  const now = Date.now();
  for (const [cuprId, entry] of rateLimitCache) {
    if (now >= entry.until) {
      rateLimitCache.delete(cuprId);
    }
  }
  return rateLimitCache.size;
}
