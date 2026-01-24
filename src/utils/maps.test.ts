import { describe, it, expect } from 'vitest';
import { generateGoogleMapsDirectionsUrl, calculateDistance } from './maps';

describe('generateGoogleMapsDirectionsUrl', () => {
  it('should generate directions URL', () => {
    const url = generateGoogleMapsDirectionsUrl(38.839266, -0.120815);
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=38.839266,-0.120815');
  });

  it('should handle negative coordinates', () => {
    const url = generateGoogleMapsDirectionsUrl(-33.8688, 151.2093);
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=-33.8688,151.2093');
  });
});

describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const distance = calculateDistance(38.839266, -0.120815, 38.84, -0.121);
    expect(distance).toBeCloseTo(0.084, 2);
  });

  it('should return 0 for same coordinates', () => {
    const distance = calculateDistance(38.839266, -0.120815, 38.839266, -0.120815);
    expect(distance).toBe(0);
  });

  it('should calculate longer distance', () => {
    const distance = calculateDistance(40.7128, -74.006, 51.5074, -0.1278);
    expect(distance).toBeCloseTo(5570, -1);
  });
});
