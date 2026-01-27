/**
 * Rate limiter for controlling request concurrency and delay
 *
 * Limits both the number of concurrent requests and enforces
 * a minimum delay between requests to avoid overwhelming the API.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter(5, 100); // max 5 concurrent, 100ms delay
 *
 * await limiter.acquire();
 * try {
 *   await fetchData();
 * } finally {
 *   limiter.release();
 * }
 * ```
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests = 0;
  private lastRequestTime = 0;
  private readonly maxConcurrent: number;
  private readonly minDelayMs: number;

  /**
   * Create a rate limiter
   * @param maxConcurrent Maximum number of concurrent requests
   * @param minDelayMs Minimum delay in milliseconds between requests
   */
  constructor(maxConcurrent: number, minDelayMs: number) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
  }

  /**
   * Acquire a slot for making a request
   *
   * This method will block until:
   * 1. There's an available slot (< maxConcurrent active requests)
   * 2. Enough time has passed since the last request (>= minDelayMs)
   *
   * @returns Promise that resolves when the slot is acquired
   */
  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.activeRequests < this.maxConcurrent) {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;

          if (timeSinceLastRequest >= this.minDelayMs) {
            this.activeRequests++;
            this.lastRequestTime = now;
            resolve();
          } else {
            // Wait for remaining delay
            setTimeout(tryAcquire, this.minDelayMs - timeSinceLastRequest);
          }
        } else {
          // Queue the request
          this.queue.push(tryAcquire);
        }
      };

      tryAcquire();
    });
  }

  /**
   * Release a slot after request completion
   *
   * This should be called in a finally block to ensure
   * the slot is always released, even on errors.
   */
  release(): void {
    this.activeRequests--;
    const next = this.queue.shift();
    if (next) next();
  }
}
