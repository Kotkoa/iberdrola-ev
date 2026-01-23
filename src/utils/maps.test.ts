import { describe, it, expect } from 'vitest';
import { generateGoogleMapsUrl } from './maps';

describe('generateGoogleMapsUrl', () => {
  it('should generate URL without zoom', () => {
    const url = generateGoogleMapsUrl(38.839266, -0.120815);
    expect(url).toBe('https://www.google.com/maps?q=38.839266,-0.120815');
  });

  it('should generate URL with zoom', () => {
    const url = generateGoogleMapsUrl(38.839266, -0.120815, 15);
    expect(url).toBe('https://www.google.com/maps?q=38.839266,-0.120815&z=15');
  });

  it('should handle negative coordinates', () => {
    const url = generateGoogleMapsUrl(-33.8688, 151.2093, 10);
    expect(url).toBe('https://www.google.com/maps?q=-33.8688,151.2093&z=10');
  });

  it('should handle zero coordinates', () => {
    const url = generateGoogleMapsUrl(0, 0);
    expect(url).toBe('https://www.google.com/maps?q=0,0');
  });

  it('should handle zoom level 1', () => {
    const url = generateGoogleMapsUrl(40.7128, -74.006, 1);
    expect(url).toBe('https://www.google.com/maps?q=40.7128,-74.006&z=1');
  });

  it('should handle zoom level 21', () => {
    const url = generateGoogleMapsUrl(40.7128, -74.006, 21);
    expect(url).toBe('https://www.google.com/maps?q=40.7128,-74.006&z=21');
  });
});
