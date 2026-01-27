import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDuration, isDataStale } from './time';

describe('formatDuration', () => {
  it('should return null when duration is null', () => {
    expect(formatDuration(null)).toBe(null);
  });

  it('should return "< 1 min" for duration less than 1 minute', () => {
    expect(formatDuration(0)).toBe('< 1 min');
    expect(formatDuration(0.5)).toBe('< 1 min');
  });

  it('should format minutes only when less than an hour', () => {
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(59)).toBe('59 min');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(61)).toBe('1 h 1 min');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(125)).toBe('2 h 5 min');
  });

  it('should format hours without minutes when exact hour', () => {
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(180)).toBe('3 h');
  });

  it('should handle large durations', () => {
    expect(formatDuration(1440)).toBe('24 h'); // 1 day
    expect(formatDuration(1441)).toBe('24 h 1 min');
  });
});

describe('isDataStale', () => {
  const TTL_MINUTES = 5;

  beforeEach(() => {
    // Mock Date.now() to return a fixed timestamp
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true for null createdAt', () => {
    expect(isDataStale(null, TTL_MINUTES)).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isDataStale('', TTL_MINUTES)).toBe(true);
  });

  it('should return false for fresh data (within TTL)', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from 3 minutes ago (fresh)
    const createdAt = new Date('2024-01-01T11:57:00Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(false);
  });

  it('should return false for data exactly at TTL boundary (not stale yet)', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from exactly 5 minutes ago (boundary - still fresh)
    const createdAt = new Date('2024-01-01T11:55:00.000Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(false);
  });

  it('should return true for stale data (older than TTL)', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from 10 minutes ago (stale)
    const createdAt = new Date('2024-01-01T11:50:00Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(true);
  });

  it('should return true for data just over TTL boundary', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from 5 minutes and 1 millisecond ago (stale)
    const createdAt = new Date('2024-01-01T11:54:59.999Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(true);
  });

  it('should work with different TTL values', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    const createdAt = new Date('2024-01-01T11:58:00Z').toISOString(); // 2 minutes ago

    // Fresh with 5-minute TTL
    expect(isDataStale(createdAt, 5)).toBe(false);

    // Stale with 1-minute TTL
    expect(isDataStale(createdAt, 1)).toBe(true);

    // Fresh with 10-minute TTL
    expect(isDataStale(createdAt, 10)).toBe(false);
  });

  it('should handle invalid date strings gracefully', () => {
    // Invalid date string should be considered stale
    expect(isDataStale('invalid-date', TTL_MINUTES)).toBe(true);
  });

  it('should work with very recent data', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from 1 second ago (very fresh)
    const createdAt = new Date('2024-01-01T11:59:59Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(false);
  });

  it('should work with very old data', () => {
    // Current time: 2024-01-01T12:00:00Z
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);

    // Data from 1 hour ago (very stale)
    const createdAt = new Date('2024-01-01T11:00:00Z').toISOString();
    expect(isDataStale(createdAt, TTL_MINUTES)).toBe(true);
  });
});
