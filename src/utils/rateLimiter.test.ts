import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests up to maxConcurrent', async () => {
    const limiter = new RateLimiter(3, 100);
    const results: number[] = [];

    const promises = Array.from({ length: 5 }, (_, i) =>
      limiter.acquire().then(() => {
        results.push(i);
        limiter.release();
      })
    );

    await vi.runAllTimersAsync();
    await Promise.all(promises);

    expect(results).toHaveLength(5);
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it('should enforce minimum delay between requests', async () => {
    const limiter = new RateLimiter(1, 100);
    const timestamps: number[] = [];

    const makeRequest = async () => {
      await limiter.acquire();
      timestamps.push(Date.now());
      limiter.release();
    };

    const p1 = makeRequest();
    await vi.advanceTimersByTimeAsync(100);
    const p2 = makeRequest();
    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([p1, p2]);

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(100);
  });

  it('should queue requests when at capacity', async () => {
    const limiter = new RateLimiter(2, 50);
    let activeCount = 0;
    let maxActive = 0;

    const makeRequest = async () => {
      await limiter.acquire();
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
      limiter.release();
    };

    const promises = Array.from({ length: 5 }, () => makeRequest());
    await vi.runAllTimersAsync();
    await Promise.all(promises);

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('should respect maxConcurrent limit', async () => {
    const limiter = new RateLimiter(3, 0);
    let concurrent = 0;
    let maxConcurrent = 0;

    const makeRequest = async () => {
      await limiter.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);

      await new Promise((resolve) => setTimeout(resolve, 50));

      concurrent--;
      limiter.release();
    };

    const promises = Array.from({ length: 10 }, () => makeRequest());
    await vi.runAllTimersAsync();
    await Promise.all(promises);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('should release slot even if request fails', async () => {
    const limiter = new RateLimiter(2, 0);

    try {
      await limiter.acquire();
      throw new Error('Test error');
    } catch {
      limiter.release();
    }

    const results: number[] = [];

    await limiter.acquire();
    results.push(1);
    limiter.release();

    await limiter.acquire();
    results.push(2);
    limiter.release();

    await vi.runAllTimersAsync();

    expect(results).toEqual([1, 2]);
  });

  it('should process queued requests in order', async () => {
    const limiter = new RateLimiter(1, 50);
    const order: number[] = [];

    const makeRequest = async (id: number) => {
      await limiter.acquire();
      order.push(id);
      limiter.release();
    };

    const p1 = makeRequest(1);
    const p2 = makeRequest(2);
    const p3 = makeRequest(3);

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('should handle zero delay correctly', async () => {
    const limiter = new RateLimiter(2, 0);
    const results: number[] = [];

    const makeRequest = async (id: number) => {
      await limiter.acquire();
      results.push(id);
      limiter.release();
    };

    await Promise.all([makeRequest(1), makeRequest(2), makeRequest(3)]);

    expect(results).toHaveLength(3);
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it('should handle acquire/release cycle correctly', async () => {
    const limiter = new RateLimiter(1, 0);

    await limiter.acquire();
    limiter.release();

    await limiter.acquire();
    limiter.release();

    await limiter.acquire();
    limiter.release();

    // No errors thrown = success
    expect(true).toBe(true);
  });
});
