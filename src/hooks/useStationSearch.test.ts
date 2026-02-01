import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStationSearch } from './useStationSearch';
import * as apiClient from '../services/apiClient';
import * as iberdrola from '../services/iberdrola';
import * as localSearch from '../services/localSearch';
import type { SearchNearbySuccessResponse, ApiErrorResponse } from '../types/api';
import type { StationInfoPartial } from '../services/iberdrola';

// Mock modules
vi.mock('../services/apiClient', async () => {
  const actual = await vi.importActual('../services/apiClient');
  return {
    ...actual,
    searchNearby: vi.fn(),
  };
});

vi.mock('../services/iberdrola', async () => {
  const actual = await vi.importActual('../services/iberdrola');
  return {
    ...actual,
    getUserLocation: vi.fn(),
  };
});

vi.mock('../services/localSearch', () => ({
  searchLocalStations: vi.fn(),
}));

// Mock GeolocationPositionError (not available in test environment)
class MockGeolocationPositionError extends Error {
  code: number;
  PERMISSION_DENIED = 1;
  POSITION_UNAVAILABLE = 2;
  TIMEOUT = 3;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = 'GeolocationPositionError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).GeolocationPositionError = MockGeolocationPositionError;

// Helper to create mock GeolocationCoordinates with toJSON method
function createMockCoords(lat: number, lon: number): GeolocationCoordinates {
  return {
    latitude: lat,
    longitude: lon,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return {
        latitude: this.latitude,
        longitude: this.longitude,
        accuracy: this.accuracy,
        altitude: this.altitude,
        altitudeAccuracy: this.altitudeAccuracy,
        heading: this.heading,
        speed: this.speed,
      };
    },
  };
}

// Helper to create mock GeolocationPosition with toJSON method
function createMockPosition(lat: number, lon: number): GeolocationPosition {
  const coords = createMockCoords(lat, lon);
  return {
    coords,
    timestamp: Date.now(),
    toJSON() {
      return {
        coords: coords.toJSON(),
        timestamp: this.timestamp,
      };
    },
  };
}

// Helper to create successful response
function createSuccessResponse(
  stations: SearchNearbySuccessResponse['data']['stations'],
  scraperTriggered = false
): SearchNearbySuccessResponse {
  return {
    ok: true,
    data: {
      stations,
      count: stations.length,
    },
    meta: {
      fresh: false,
      scraper_triggered: scraperTriggered,
      retry_after: null,
    },
  };
}

// Helper to create error response
function createErrorResponse(message: string, code = 'INTERNAL_ERROR'): ApiErrorResponse {
  return {
    ok: false,
    error: {
      code: code as ApiErrorResponse['error']['code'],
      message,
    },
  };
}

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
    expect(result.current.usingCachedData).toBe(false);
    expect(result.current.scraperTriggered).toBe(false);
  });

  it('should provide search and clear functions', () => {
    const { result } = renderHook(() => useStationSearch());

    expect(typeof result.current.search).toBe('function');
    expect(typeof result.current.clear).toBe('function');
  });

  it('should clear search results including scraperTriggered', () => {
    const { result } = renderHook(() => useStationSearch());

    act(() => {
      result.current.clear();
    });

    expect(result.current.stations).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.usingCachedData).toBe(false);
    expect(result.current.scraperTriggered).toBe(false);
  });

  it('should call searchNearby Edge Function with correct params', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createSuccessResponse([]));

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    expect(apiClient.searchNearby).toHaveBeenCalledWith({
      latitude: 38.84,
      longitude: -0.12,
      radiusKm: 5,
    });
  });

  it('should set stations from successful response', async () => {
    const mockStations = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Station 1',
        latitude: 38.84,
        longitude: -0.12,
        addressFull: 'Street 1, Valencia',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
        maxPower: 22,
        freePorts: 1,
        priceKwh: 0,
        socketType: 'Type 2',
        distanceKm: 0.5,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createSuccessResponse(mockStations));

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stations).toHaveLength(1);
    expect(result.current.stations[0].cpId).toBe(123);
    expect(result.current.stations[0].name).toBe('Station 1');
    expect(result.current.stations[0].maxPower).toBe(22);
    expect(result.current.stations[0]._fromCache).toBe(true);
    expect(result.current.usingCachedData).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should set scraperTriggered when meta.scraper_triggered is true', async () => {
    const mockStations = [
      {
        cpId: 123,
        cuprId: 456,
        name: 'Station 1',
        latitude: 38.84,
        longitude: -0.12,
        addressFull: 'Street 1',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
        maxPower: 22,
        freePorts: 1,
        priceKwh: 0,
        socketType: 'Type 2',
        distanceKm: 0.5,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(
      createSuccessResponse(mockStations, true) // scraper_triggered = true
    );

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.scraperTriggered).toBe(true);
  });

  it('should set scraperTriggered to false when meta.scraper_triggered is false', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(
      createSuccessResponse([], false) // scraper_triggered = false
    );

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.scraperTriggered).toBe(false);
  });

  it('should show error when no stations found', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createSuccessResponse([]));

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stations).toHaveLength(0);
    expect(result.current.error).toBe('No stations found in this area.');
  });

  it('should fallback to local search when Edge Function fails', async () => {
    const localStations: StationInfoPartial[] = [
      {
        cpId: 789,
        cuprId: 101,
        name: 'Local Station',
        latitude: 38.85,
        longitude: -0.13,
        addressFull: 'Local Street',
        overallStatus: 'AVAILABLE',
        totalPorts: 2,
        _fromCache: true,
      },
    ];

    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createErrorResponse('Edge Function error'));

    vi.mocked(localSearch.searchLocalStations).mockResolvedValue(localStations);

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(localSearch.searchLocalStations).toHaveBeenCalledWith(38.84, -0.12, 5, true);
    expect(result.current.stations).toHaveLength(1);
    expect(result.current.stations[0].name).toBe('Local Station');
    expect(result.current.usingCachedData).toBe(true);
    expect(result.current.error).toBe('Live data unavailable. Showing cached results.');
    expect(result.current.scraperTriggered).toBe(false);
  });

  it('should show error when both Edge Function and local fallback fail', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(
      createErrorResponse('Edge Function unavailable')
    );

    vi.mocked(localSearch.searchLocalStations).mockResolvedValue([]);

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stations).toHaveLength(0);
    expect(result.current.usingCachedData).toBe(false);
    expect(result.current.error).toBe('Edge Function unavailable');
  });

  it('should handle geolocation error', async () => {
    vi.mocked(iberdrola.getUserLocation).mockRejectedValue(
      new MockGeolocationPositionError('User denied Geolocation', 1)
    );

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Location access denied');
    expect(result.current.stations).toHaveLength(0);
  });

  it('should handle network errors', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useStationSearch());

    await act(async () => {
      await result.current.search(5);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('should set loading state during search', async () => {
    vi.mocked(iberdrola.getUserLocation).mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(createMockPosition(38.84, -0.12)), 100))
    );

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createSuccessResponse([]));

    const { result } = renderHook(() => useStationSearch());

    act(() => {
      result.current.search(5);
    });

    // Should be loading immediately
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should reset state when starting new search', async () => {
    vi.mocked(iberdrola.getUserLocation).mockResolvedValue(createMockPosition(38.84, -0.12));

    vi.mocked(apiClient.searchNearby).mockResolvedValue(createSuccessResponse([]));

    const { result } = renderHook(() => useStationSearch());

    // First search
    await act(async () => {
      await result.current.search(5);
    });

    // Second search should reset scraperTriggered
    await act(async () => {
      await result.current.search(10);
    });

    expect(result.current.scraperTriggered).toBe(false);
  });
});
