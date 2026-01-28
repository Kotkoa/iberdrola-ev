import { describe, it, expect } from 'vitest';
import { shouldSaveStationToCache } from './stationApi';

describe('shouldSaveStationToCache', () => {
  it('should return true for FREE stations (priceKwh === 0)', () => {
    expect(shouldSaveStationToCache(0)).toBe(true);
  });

  it('should return false for paid stations', () => {
    expect(shouldSaveStationToCache(0.45)).toBe(false);
    expect(shouldSaveStationToCache(0.67)).toBe(false);
    expect(shouldSaveStationToCache(1.5)).toBe(false);
  });

  it('should return false for undefined priceKwh (loading state)', () => {
    expect(shouldSaveStationToCache(undefined)).toBe(false);
  });

  it('should return false for very small positive prices', () => {
    expect(shouldSaveStationToCache(0.01)).toBe(false);
    expect(shouldSaveStationToCache(0.001)).toBe(false);
  });
});
