import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isStationRateLimited,
  getRateLimitSecondsRemaining,
  markRateLimited,
  clearStationRateLimit,
  clearRateLimitCache,
  getRateLimitedStationCount,
} from './rateLimitCache';

describe('rateLimitCache', () => {
  beforeEach(() => {
    clearRateLimitCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isStationRateLimited', () => {
    it('returns false for unknown station', () => {
      expect(isStationRateLimited(144569)).toBe(false);
    });

    it('returns true after markRateLimited', () => {
      markRateLimited(144569, 300);
      expect(isStationRateLimited(144569)).toBe(true);
    });

    it('returns false after rate limit expires', () => {
      markRateLimited(144569, 300);
      expect(isStationRateLimited(144569)).toBe(true);

      // Advance time past rate limit
      vi.advanceTimersByTime(301 * 1000);

      expect(isStationRateLimited(144569)).toBe(false);
    });

    it('cleans up expired entry on check', () => {
      markRateLimited(144569, 60);
      expect(getRateLimitedStationCount()).toBe(1);

      vi.advanceTimersByTime(61 * 1000);

      // Check triggers cleanup
      isStationRateLimited(144569);
      expect(getRateLimitedStationCount()).toBe(0);
    });
  });

  describe('getRateLimitSecondsRemaining', () => {
    it('returns 0 for unknown station', () => {
      expect(getRateLimitSecondsRemaining(144569)).toBe(0);
    });

    it('returns correct seconds remaining', () => {
      markRateLimited(144569, 300);
      expect(getRateLimitSecondsRemaining(144569)).toBe(300);

      vi.advanceTimersByTime(100 * 1000);
      expect(getRateLimitSecondsRemaining(144569)).toBe(200);

      vi.advanceTimersByTime(150 * 1000);
      expect(getRateLimitSecondsRemaining(144569)).toBe(50);
    });

    it('returns 0 when rate limit expired', () => {
      markRateLimited(144569, 60);
      vi.advanceTimersByTime(61 * 1000);
      expect(getRateLimitSecondsRemaining(144569)).toBe(0);
    });
  });

  describe('markRateLimited', () => {
    it('uses default 300 seconds when not specified', () => {
      markRateLimited(144569);
      expect(getRateLimitSecondsRemaining(144569)).toBe(300);
    });

    it('accepts custom retry time', () => {
      markRateLimited(144569, 60);
      expect(getRateLimitSecondsRemaining(144569)).toBe(60);
    });

    it('updates existing entry', () => {
      markRateLimited(144569, 100);
      expect(getRateLimitSecondsRemaining(144569)).toBe(100);

      markRateLimited(144569, 200);
      expect(getRateLimitSecondsRemaining(144569)).toBe(200);
    });
  });

  describe('clearStationRateLimit', () => {
    it('removes rate limit for specific station', () => {
      markRateLimited(144569, 300);
      markRateLimited(144570, 300);

      clearStationRateLimit(144569);

      expect(isStationRateLimited(144569)).toBe(false);
      expect(isStationRateLimited(144570)).toBe(true);
    });

    it('does nothing for unknown station', () => {
      clearStationRateLimit(144569);
      expect(isStationRateLimited(144569)).toBe(false);
    });
  });

  describe('clearRateLimitCache', () => {
    it('removes all entries', () => {
      markRateLimited(144569, 300);
      markRateLimited(144570, 300);
      markRateLimited(144571, 300);

      expect(getRateLimitedStationCount()).toBe(3);

      clearRateLimitCache();

      expect(getRateLimitedStationCount()).toBe(0);
      expect(isStationRateLimited(144569)).toBe(false);
      expect(isStationRateLimited(144570)).toBe(false);
      expect(isStationRateLimited(144571)).toBe(false);
    });
  });

  describe('getRateLimitedStationCount', () => {
    it('returns 0 when empty', () => {
      expect(getRateLimitedStationCount()).toBe(0);
    });

    it('returns correct count', () => {
      markRateLimited(144569, 300);
      expect(getRateLimitedStationCount()).toBe(1);

      markRateLimited(144570, 300);
      expect(getRateLimitedStationCount()).toBe(2);
    });

    it('excludes expired entries', () => {
      markRateLimited(144569, 60);
      markRateLimited(144570, 120);
      expect(getRateLimitedStationCount()).toBe(2);

      vi.advanceTimersByTime(61 * 1000);
      expect(getRateLimitedStationCount()).toBe(1);

      vi.advanceTimersByTime(60 * 1000);
      expect(getRateLimitedStationCount()).toBe(0);
    });
  });
});
