import { describe, it, expect } from 'vitest';
import { formatDuration } from './time';

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
