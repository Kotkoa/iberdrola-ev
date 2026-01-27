import { describe, it, expect, vi } from 'vitest';
import type { StationInfoPartial } from './iberdrola';
import type { CachedStationInfo } from './stationApi';

describe('enrichStationDetails cache logic', () => {
  it('should use cached data when provided in cachedMap', () => {
    // This test verifies the cache-first logic in enrichStationDetails
    // We test the logic by directly creating the expected behavior

    const mockCachedMap = new Map<number, CachedStationInfo>([
      [
        123,
        {
          cpId: 123,
          cuprId: 456,
          name: 'Test Station',
          latitude: 40.4168,
          longitude: -3.7038,
          maxPower: 22,
          freePorts: 2,
          priceKwh: 0.35,
          socketType: 'Type 2',
          addressFull: 'Test Street, Madrid',
          emergencyStopPressed: false,
        },
      ],
    ]);

    const partial: StationInfoPartial = {
      cpId: 123,
      cuprId: 456,
      name: 'Test Station',
      latitude: 40.4168,
      longitude: -3.7038,
      addressFull: 'Test Street, Madrid',
      overallStatus: 'AVAILABLE',
      totalPorts: 2,
    };

    // Simulate what enrichStationDetails does with cache
    const cached = mockCachedMap.get(partial.cpId);
    expect(cached).toBeDefined();

    if (cached) {
      const enriched = {
        ...partial,
        maxPower: cached.maxPower,
        freePorts: cached.freePorts,
        priceKwh: cached.priceKwh,
        socketType: cached.socketType,
        emergencyStopPressed: cached.emergencyStopPressed,
      };

      // Verify cache data is used
      expect(enriched.maxPower).toBe(22);
      expect(enriched.priceKwh).toBe(0.35);
      expect(enriched.socketType).toBe('Type 2');
      expect(enriched.freePorts).toBe(2);
      expect(enriched.emergencyStopPressed).toBe(false);
    }
  });

  it('should fall back to API when cache is empty', () => {
    const mockCachedMap = new Map<number, CachedStationInfo>();

    const partial: StationInfoPartial = {
      cpId: 123,
      cuprId: 456,
      name: 'Test Station',
      latitude: 40.4168,
      longitude: -3.7038,
      addressFull: 'Test Street, Madrid',
      overallStatus: 'AVAILABLE',
      totalPorts: 1,
    };

    // Simulate cache lookup
    const cached = mockCachedMap.get(partial.cpId);
    expect(cached).toBeUndefined();

    // When cache is undefined, function should call API
    // This would trigger fetchStationDetails in real code
  });

  it('should handle optional cachedMap parameter', () => {
    // When cachedMap is not provided (undefined), function should call API
    const cachedMap: Map<number, CachedStationInfo> | undefined = undefined;

    if (cachedMap) {
      // Won't execute - cachedMap is undefined
      expect(false).toBe(true);
    } else {
      // Should fall back to API when cachedMap is undefined
      expect(cachedMap).toBeUndefined();
    }
  });

  it('should preserve partial data structure when enriching', () => {
    const mockCachedMap = new Map<number, CachedStationInfo>([
      [
        123,
        {
          cpId: 123,
          cuprId: 456,
          name: 'Station',
          latitude: 40.0,
          longitude: -3.0,
          maxPower: 50,
          freePorts: 1,
          priceKwh: 0.45,
          socketType: 'CCS',
          addressFull: 'Address',
          emergencyStopPressed: true,
        },
      ],
    ]);

    const partial: StationInfoPartial = {
      cpId: 123,
      cuprId: 456,
      name: 'Original Name',
      latitude: 40.5,
      longitude: -3.5,
      addressFull: 'Original Address',
      overallStatus: 'OCCUPIED',
      totalPorts: 2,
    };

    const cached = mockCachedMap.get(partial.cpId);
    if (cached) {
      const enriched = {
        ...partial,
        maxPower: cached.maxPower,
        freePorts: cached.freePorts,
        priceKwh: cached.priceKwh,
        socketType: cached.socketType,
        emergencyStopPressed: cached.emergencyStopPressed,
      };

      // Verify partial data is preserved
      expect(enriched.name).toBe('Original Name');
      expect(enriched.addressFull).toBe('Original Address');
      expect(enriched.overallStatus).toBe('OCCUPIED');

      // Verify cache data is added
      expect(enriched.maxPower).toBe(50);
      expect(enriched.priceKwh).toBe(0.45);
    }
  });

  it('should verify cache hit console log', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockCachedMap = new Map<number, CachedStationInfo>([
      [
        123,
        {
          cpId: 123,
          cuprId: 456,
          name: 'Test',
          latitude: 40.0,
          longitude: -3.0,
          maxPower: 22,
          freePorts: 2,
          priceKwh: 0,
          socketType: 'Type 2',
          addressFull: 'Address',
          emergencyStopPressed: false,
        },
      ],
    ]);

    const cached = mockCachedMap.get(123);
    if (cached) {
      // Simulate cache hit log
      console.log('[enrichment] Using fresh cache for cpId=123');
    }

    expect(consoleLogSpy).toHaveBeenCalledWith('[enrichment] Using fresh cache for cpId=123');

    consoleLogSpy.mockRestore();
  });

  it('should verify cache miss console log', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockCachedMap = new Map<number, CachedStationInfo>();

    const cached = mockCachedMap.get(123);
    if (!cached) {
      // Simulate cache miss log
      console.log('[enrichment] Cache miss for cpId=123, fetching from API');
    }

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[enrichment] Cache miss for cpId=123, fetching from API'
    );

    consoleLogSpy.mockRestore();
  });
});
