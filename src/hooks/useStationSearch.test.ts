import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStationSearch } from './useStationSearch';
import * as stationApi from '../services/stationApi';
import * as iberdrola from '../services/iberdrola';
import { shouldSaveStationToCache } from '../utils/station';
import type { CachedStationInfo } from '../services/stationApi';
import type { StationInfoPartial } from '../services/iberdrola';

// Mock modules
vi.mock('../services/stationApi', async () => {
  const actual = await vi.importActual('../services/stationApi');
  return {
    ...actual,
    getStationsFromCache: vi.fn(),
    saveSnapshot: vi.fn(),
  };
});

vi.mock('../services/iberdrola', async () => {
  const actual = await vi.importActual('../services/iberdrola');
  return {
    ...actual,
    getUserLocation: vi.fn(),
    fetchStationsPartial: vi.fn(),
    enrichStationDetails: vi.fn(),
    fetchStationDetails: vi.fn(),
  };
});

vi.mock('../utils/station', () => ({
  shouldSaveStationToCache: vi.fn().mockReturnValue(false),
}));

// Mock GeolocationPositionError (not available in test environment)
interface GeolocationPositionErrorConstructor {
  new (message: string, code: number): GeolocationPositionError;
  readonly PERMISSION_DENIED: number;
  readonly POSITION_UNAVAILABLE: number;
  readonly TIMEOUT: number;
}

global.GeolocationPositionError = class GeolocationPositionError extends Error {
  code: number;
  PERMISSION_DENIED = 1;
  POSITION_UNAVAILABLE = 2;
  TIMEOUT = 3;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = 'GeolocationPositionError';
  }
} as unknown as GeolocationPositionErrorConstructor;

describe('useStationSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useStationSearch());

    expect(result.current.stations).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.enriching).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
  });

  it('should provide search and clear functions', () => {
    const { result } = renderHook(() => useStationSearch());

    expect(typeof result.current.search).toBe('function');
    expect(typeof result.current.clear).toBe('function');
  });

  it('should clear search results', () => {
    const { result } = renderHook(() => useStationSearch());

    result.current.clear();

    expect(result.current.stations).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
  });

  it('should perform batch cache lookup before enrichment', async () => {
    const mockCachedMap = new Map<number, CachedStationInfo>([
      [
        123,
        {
          cpId: 123,
          cuprId: 456,
          name: 'Station 1',
          latitude: 40.4168,
          longitude: -3.7038,
          maxPower: 22,
          freePorts: 2,
          priceKwh: 0.35,
          socketType: 'Type 2',
          addressFull: 'Street 1, Madrid',
          emergencyStopPressed: false,
        },
      ],
      [
        124,
        {
          cpId: 124,
          cuprId: 457,
          name: 'Station 2',
          latitude: 40.4268,
          longitude: -3.7138,
          maxPower: 50,
          freePorts: 1,
          priceKwh: 0.45,
          socketType: 'CCS',
          addressFull: 'Street 2, Madrid',
          emergencyStopPressed: false,
        },
      ],
    ]);

    const partialResults: StationInfoPartial[] = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Station 1',
        latitude: 40.4168,
        longitude: -3.7038,
        addressFull: 'Street 1, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
      },
      {
        cpId: 124,
        cuprId: 457,
        name: 'Station 2',
        latitude: 40.4268,
        longitude: -3.7138,
        addressFull: 'Street 2, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue({
      coords: {
        latitude: 40.4168,
        longitude: -3.7038,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    vi.mocked(iberdrola.fetchStationsPartial).mockResolvedValue(partialResults);
    vi.mocked(stationApi.getStationsFromCache).mockResolvedValue(mockCachedMap);
    vi.mocked(iberdrola.enrichStationDetails).mockImplementation(async (partial, cachedMap) => {
      const cached = cachedMap?.get(partial.cpId);
      if (cached) {
        return {
          ...partial,
          maxPower: cached.maxPower,
          freePorts: cached.freePorts,
          priceKwh: cached.priceKwh,
          socketType: cached.socketType,
          emergencyStopPressed: cached.emergencyStopPressed,
          _fromCache: true,
        };
      }
      return partial;
    });

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.stations).toHaveLength(2);
    });

    // Verify batch cache lookup was called ONCE with all cpIds
    expect(stationApi.getStationsFromCache).toHaveBeenCalledTimes(1);
    expect(stationApi.getStationsFromCache).toHaveBeenCalledWith([123, 124], 15);

    // Verify enriched data from cache
    expect(result.current.stations[0].maxPower).toBe(22);
    expect(result.current.stations[1].maxPower).toBe(50);
  });

  it('should handle empty cache gracefully', async () => {
    const partialResults: StationInfoPartial[] = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Station 1',
        latitude: 40.4168,
        longitude: -3.7038,
        addressFull: 'Street 1, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 1,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue({
      coords: {
        latitude: 40.4168,
        longitude: -3.7038,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    vi.mocked(iberdrola.fetchStationsPartial).mockResolvedValue(partialResults);
    vi.mocked(stationApi.getStationsFromCache).mockResolvedValue(new Map());
    vi.mocked(iberdrola.fetchStationDetails).mockResolvedValue({
      logicalSocket: [
        {
          physicalSocket: [
            {
              status: { statusCode: 'AVAILABLE' },
              maxPower: 22,
              appliedRate: { recharge: { finalPrice: 0 } },
              socketType: { socketName: 'Type 2' },
            },
          ],
        },
      ],
      emergencyStopButtonPressed: false,
    });
    vi.mocked(iberdrola.enrichStationDetails).mockImplementation(async (partial) => ({
      ...partial,
      maxPower: 22,
      freePorts: 1,
      priceKwh: 0,
      socketType: 'Type 2',
      emergencyStopPressed: false,
    }));

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.stations).toHaveLength(1);
    });

    // Verify cache lookup was called even if empty
    expect(stationApi.getStationsFromCache).toHaveBeenCalledTimes(1);

    // Verify API enrichment was used when cache is empty
    expect(result.current.stations[0].maxPower).toBe(22);
  });

  it('should handle cache lookup errors gracefully', async () => {
    const partialResults: StationInfoPartial[] = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Station 1',
        latitude: 40.4168,
        longitude: -3.7038,
        addressFull: 'Street 1, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 1,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue({
      coords: {
        latitude: 40.4168,
        longitude: -3.7038,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    vi.mocked(iberdrola.fetchStationsPartial).mockResolvedValue(partialResults);
    vi.mocked(stationApi.getStationsFromCache).mockRejectedValue(new Error('DB error'));
    vi.mocked(iberdrola.enrichStationDetails).mockResolvedValue({
      ...partialResults[0],
      maxPower: 22,
      freePorts: 1,
      priceKwh: 0,
      socketType: 'Type 2',
      emergencyStopPressed: false,
    });

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    // Should handle error and still complete search
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it('should NOT call fetchStationDetails when enrichment used cache (_fromCache=true)', async () => {
    // Test for Bug #3 fix: verify no duplicate API call when data from cache
    const mockCachedMap = new Map<number, CachedStationInfo>([
      [
        123,
        {
          cpId: 123,
          cuprId: 456,
          name: 'Free Station',
          latitude: 40.4168,
          longitude: -3.7038,
          maxPower: 22,
          freePorts: 2,
          priceKwh: 0, // FREE station
          socketType: 'Type 2',
          addressFull: 'Street 1, Madrid',
          emergencyStopPressed: false,
        },
      ],
    ]);

    const partialResults: StationInfoPartial[] = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Free Station',
        latitude: 40.4168,
        longitude: -3.7038,
        addressFull: 'Street 1, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue({
      coords: {
        latitude: 40.4168,
        longitude: -3.7038,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    vi.mocked(iberdrola.fetchStationsPartial).mockResolvedValue(partialResults);
    vi.mocked(stationApi.getStationsFromCache).mockResolvedValue(mockCachedMap);

    // Mock enrichStationDetails to return _fromCache=true
    vi.mocked(iberdrola.enrichStationDetails).mockImplementation(async (partial, cachedMap) => {
      const cached = cachedMap?.get(partial.cpId);
      if (cached) {
        return {
          ...partial,
          maxPower: cached.maxPower,
          freePorts: cached.freePorts,
          priceKwh: cached.priceKwh,
          socketType: cached.socketType,
          emergencyStopPressed: cached.emergencyStopPressed,
          _fromCache: true, // Data from cache
        };
      }
      return partial;
    });

    // Spy on fetchStationDetails to verify it's NOT called
    const fetchStationDetailsSpy = vi.spyOn(iberdrola, 'fetchStationDetails');

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.stations).toHaveLength(1);
    });

    // CRITICAL: Verify fetchStationDetails was NOT called (Bug #3 fix)
    expect(fetchStationDetailsSpy).not.toHaveBeenCalled();

    // Verify enriched data is correct
    expect(result.current.stations[0].priceKwh).toBe(0);
    expect(result.current.stations[0]._fromCache).toBe(true);
  });

  it('should call fetchStationDetails when enrichment used API (_fromCache=false)', async () => {
    // Test for Bug #3 fix: verify API call happens when data NOT from cache
    const mockCachedMap = new Map<number, CachedStationInfo>(); // Empty cache

    const partialResults: StationInfoPartial[] = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Free Station',
        latitude: 40.4168,
        longitude: -3.7038,
        addressFull: 'Street 1, Madrid',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue({
      coords: {
        latitude: 40.4168,
        longitude: -3.7038,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });

    vi.mocked(iberdrola.fetchStationsPartial).mockResolvedValue(partialResults);
    vi.mocked(stationApi.getStationsFromCache).mockResolvedValue(mockCachedMap);

    // Override shouldSaveStationToCache to return true for free stations
    vi.mocked(shouldSaveStationToCache).mockReturnValue(true);

    // Mock enrichStationDetails to return _fromCache=false (API fetch)
    vi.mocked(iberdrola.enrichStationDetails).mockResolvedValue({
      ...partialResults[0],
      maxPower: 22,
      freePorts: 2,
      priceKwh: 0, // FREE station
      socketType: 'Type 2',
      emergencyStopPressed: false,
      _fromCache: false, // Data from API
    });

    // Mock fetchStationDetails for snapshot saving
    const fetchStationDetailsMock = vi.mocked(iberdrola.fetchStationDetails);
    fetchStationDetailsMock.mockResolvedValue({
      logicalSocket: [
        {
          physicalSocket: [
            {
              status: { statusCode: 'AVAILABLE' },
              maxPower: 22,
              appliedRate: { recharge: { finalPrice: 0 } },
              socketType: { socketName: 'Type 2' },
            },
          ],
        },
      ],
      emergencyStopButtonPressed: false,
    });

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.stations).toHaveLength(1);
    });

    // Wait for async snapshot save to complete
    await waitFor(
      () => {
        expect(fetchStationDetailsMock).toHaveBeenCalledWith(456);
      },
      { timeout: 3000 }
    );

    // Verify enriched data is correct
    expect(result.current.stations[0].priceKwh).toBe(0);
    expect(result.current.stations[0]._fromCache).toBe(false);
  });
});
