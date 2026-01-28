export interface ReconnectionConfig {
  /** Initial delay in ms before first reconnect attempt (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms between reconnect attempts (default: 30000) */
  maxDelayMs: number;
  /** Maximum number of reconnect attempts (default: 10) */
  maxAttempts: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: ReconnectionConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: 10,
  backoffMultiplier: 2,
};

/**
 * Manages reconnection attempts with exponential backoff
 *
 * Backoff sequence (with defaults): 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
 *
 * @example
 * ```typescript
 * const manager = new ReconnectionManager();
 *
 * // When connection fails
 * manager.scheduleReconnect(() => {
 *   // Attempt to reconnect
 *   socket.connect();
 * });
 *
 * // When connection succeeds
 * manager.reset();
 * ```
 */
export class ReconnectionManager {
  private attempts = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private config: ReconnectionConfig;

  constructor(config: Partial<ReconnectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Schedules a reconnection attempt with exponential backoff
   * @param reconnectFn Function to call when attempting to reconnect
   * @returns Whether a reconnection was scheduled (false if max attempts reached)
   */
  scheduleReconnect(reconnectFn: () => void): boolean {
    if (this.attempts >= this.config.maxAttempts) {
      console.log(
        `[ReconnectionManager] Max attempts (${this.config.maxAttempts}) reached, giving up`
      );
      return false;
    }

    // Clear any existing timeout
    this.cancelPending();

    const delay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, this.attempts),
      this.config.maxDelayMs
    );

    console.log(
      `[ReconnectionManager] Scheduling reconnect in ${delay}ms (attempt ${this.attempts + 1}/${this.config.maxAttempts})`
    );

    this.timeoutId = setTimeout(() => {
      this.attempts++;
      reconnectFn();
    }, delay);

    return true;
  }

  /**
   * Cancels any pending reconnection attempt
   */
  cancelPending(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Resets the reconnection manager (call on successful connection)
   */
  reset(): void {
    this.attempts = 0;
    this.cancelPending();
  }

  /**
   * Returns the current number of reconnection attempts
   */
  getAttempts(): number {
    return this.attempts;
  }

  /**
   * Returns whether max attempts have been reached
   */
  isExhausted(): boolean {
    return this.attempts >= this.config.maxAttempts;
  }
}
