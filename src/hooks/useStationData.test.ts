import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStationData } from './useStationData';
import * as charger from '../../api/charger';
import * as apiClient from '../services/apiClient';
import * as rateLimitCache from '../utils/rateLimitCache';
import * as time from '../utils/time';
import type { RealtimeConnectionState } from '../../types/realtime';
import type { ApiResponse, PollStationData } from '../types/api';

// Mock modules
vi.mock('../../api/charger', () => ({
  getLatestSnapshot: vi.fn(),
  getStationMetadata: vi.fn(),
  subscribeToSnapshots: vi.fn(),
  snapshotToChargerStatus: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  pollStation: vi.fn(),
  isApiSuccess: vi.fn((response: ApiResponse<unknown>) => response.ok === true),
  isRateLimited: vi.fn(
    (response: ApiResponse<unknown>) => !response.ok && response.error.code === 'RATE_LIMITED'
  ),
}));

vi.mock('../utils/rateLimitCache', () => ({
  isStationRateLimited: vi.fn(),
  markRateLimited: vi.fn(),
}));

vi.mock('../utils/time', () => ({
  isDataStale: vi.fn(),
}));

describe('useStationData', () => {
  const mockSnapshot: charger.StationSnapshot = {
    id: 'test-id',
    cp_id: 12345,
    source: 'user_station',
    observed_at: '2024-01-01T12:00:00Z',
    port1_status: 'AVAILABLE',
    port1_power_kw: 22,
    port1_price_kwh: 0,
    port1_update_date: null,
    port2_status: 'OCCUPIED',
    port2_power_kw: 22,
    port2_price_kwh: 0,
    port2_update_date: null,
    overall_status: 'AVAILABLE',
    emergency_stop_pressed: false,
    situation_code: 'OPER',
    created_at: '2024-01-01T12:00:00Z',
  };

  const mockMetadata: charger.StationMetadata = {
    cp_id: 12345,
    cupr_id: 67890,
    latitude: 40.4168,
    longitude: -3.7038,
    address_full: 'Calle Test 123, Madrid',
  };

  const mockChargerStatus = {
    id: 'test-id',
    cp_id: 12345,
    cp_name: 'Calle Test 123',
    schedule: null,
    cp_latitude: 40.4168,
    cp_longitude: -3.7038,
    address_full: 'Calle Test 123, Madrid',
    overall_status: 'AVAILABLE',
    overall_update_date: null,
    port1_status: 'AVAILABLE',
    port1_power_kw: 22,
    port1_price_kwh: 0,
    port1_update_date: null,
    port2_status: 'OCCUPIED',
    port2_power_kw: 22,
    port2_price_kwh: 0,
    port2_update_date: null,
    created_at: '2024-01-01T12:00:00Z',
    emergency_stop_pressed: false,
    situation_code: 'OPER',
  };

  const mockPollData: PollStationData = {
    cp_id: 12345,
    port1_status: 'AVAILABLE',
    port2_status: 'OCCUPIED',
    overall_status: 'AVAILABLE',
    observed_at: '2024-01-01T12:00:00Z',
  };

  const mockPollSuccessResponse: ApiResponse<PollStationData> = {
    ok: true,
    data: mockPollData,
  };

  const mockPollRateLimitResponse: ApiResponse<PollStationData> = {
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      retry_after: 300,
    },
  };

  const mockPollNotFoundResponse: ApiResponse<PollStationData> = {
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Station not found',
    },
  };

  // Helper to create mock SubscriptionResult
  const createMockSubscriptionResult = (
    onConnectionStateChange?: (state: RealtimeConnectionState) => void
  ) => {
    // Simulate connected state synchronously to avoid timer-related flakes in tests
    // In real code, Supabase calls this asynchronously, but for tests we call it immediately
    // after the mock is set up via queueMicrotask (more predictable than setTimeout)
    if (onConnectionStateChange) {
      queueMicrotask(() => onConnectionStateChange('connected'));
    }
    return {
      unsubscribe: vi.fn(),
      getConnectionState: vi.fn().mockReturnValue('connected'),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: returns SubscriptionResult object and calls connectionState callback
    vi.mocked(charger.subscribeToSnapshots).mockImplementation(
      (_cpId, _onUpdate, onConnectionStateChange) =>
        createMockSubscriptionResult(onConnectionStateChange)
    );
    vi.mocked(charger.snapshotToChargerStatus).mockReturnValue(mockChargerStatus);
    // Default: not rate limited
    vi.mocked(rateLimitCache.isStationRateLimited).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('state machine', () => {
    it('should return idle state when cpId is null', () => {
      const { result } = renderHook(() => useStationData(null, undefined));

      expect(result.current.state).toBe('idle');
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.hasRealtime).toBe(false);
      expect(result.current.isStale).toBe(false);
    });

    it('should start with loading_cache state when cpId is provided', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      const { result } = renderHook(() => useStationData(12345, 67890));

      // Initially loading
      expect(result.current.state).toBe('loading_cache');

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });
    });

    it('should transition to ready state with fresh cache data', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false); // Fresh data

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(result.current.data).toEqual(mockChargerStatus);
        expect(result.current.hasRealtime).toBe(true);
      });
    });

    it('should transition to loading_api when cache is stale', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true); // Stale data
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollSuccessResponse);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(apiClient.pollStation).toHaveBeenCalledWith(67890);
      });
    });

    it('should transition to error state on failure', async () => {
      vi.mocked(charger.getLatestSnapshot).mockRejectedValue(new Error('Network error'));
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('Network error');
      });
    });
  });

  describe('TTL checking', () => {
    it('should use cache when data is fresh (within TTL)', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      renderHook(() => useStationData(12345, 67890, 15));

      await waitFor(() => {
        expect(time.isDataStale).toHaveBeenCalledWith(mockSnapshot.observed_at, 15);
        expect(apiClient.pollStation).not.toHaveBeenCalled();
      });
    });

    it('should fetch from Edge when cache is stale', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollSuccessResponse);

      renderHook(() => useStationData(12345, 67890, 5));

      await waitFor(() => {
        expect(apiClient.pollStation).toHaveBeenCalledWith(67890);
      });
    });

    it('should use stale data when cuprId is undefined', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true); // Stale

      const { result } = renderHook(() => useStationData(12345, undefined, 5));

      await waitFor(() => {
        // Should still become ready using stale data
        expect(result.current.state).toBe('ready');
        expect(apiClient.pollStation).not.toHaveBeenCalled();
      });
    });
  });

  describe('realtime subscription', () => {
    it('should subscribe to realtime updates', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(charger.subscribeToSnapshots).toHaveBeenCalledWith(
          12345,
          expect.any(Function),
          expect.any(Function)
        );
      });
    });

    it('should unsubscribe on unmount', async () => {
      const unsubscribeMock = vi.fn();
      vi.mocked(charger.subscribeToSnapshots).mockImplementation(
        (_cpId, _onUpdate, onConnectionStateChange) => {
          if (onConnectionStateChange) {
            queueMicrotask(() => onConnectionStateChange('connected'));
          }
          return {
            unsubscribe: unsubscribeMock,
            getConnectionState: vi.fn().mockReturnValue('connected'),
          };
        }
      );
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      const { unmount } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(charger.subscribeToSnapshots).toHaveBeenCalled();
      });

      unmount();

      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('should update data on realtime event with newer timestamp', async () => {
      let realtimeCallback: ((snapshot: charger.StationSnapshot) => void) | null = null;

      vi.mocked(charger.subscribeToSnapshots).mockImplementation(
        (_cpId, callback, onConnectionStateChange) => {
          realtimeCallback = callback;
          if (onConnectionStateChange) {
            queueMicrotask(() => onConnectionStateChange('connected'));
          }
          return {
            unsubscribe: vi.fn(),
            getConnectionState: vi.fn().mockReturnValue('connected'),
          };
        }
      );
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      const updatedChargerStatus = {
        ...mockChargerStatus,
        port1_status: 'OCCUPIED',
        created_at: '2024-01-01T13:00:00Z', // Newer timestamp
      };
      vi.mocked(charger.snapshotToChargerStatus)
        .mockReturnValueOnce(mockChargerStatus)
        .mockReturnValueOnce(updatedChargerStatus);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      // Simulate realtime update with newer data
      const newerSnapshot = {
        ...mockSnapshot,
        port1_status: 'OCCUPIED',
        observed_at: '2024-01-01T13:00:00Z',
        created_at: '2024-01-01T13:00:00Z',
      };

      if (realtimeCallback) {
        realtimeCallback(newerSnapshot);
      }

      await waitFor(() => {
        expect(result.current.data?.port1_status).toBe('OCCUPIED');
      });
    });
  });

  describe('cpId changes', () => {
    it('should reset state when cpId changes', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      const { result, rerender } = renderHook(({ cpId }) => useStationData(cpId, 67890), {
        initialProps: { cpId: 12345 as number | null },
      });

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      // Change cpId
      rerender({ cpId: 99999 });

      // Should reset and reload
      await waitFor(() => {
        expect(charger.getLatestSnapshot).toHaveBeenCalledWith(99999);
      });
    });

    it('should return idle when cpId becomes null', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(false);

      const { result, rerender } = renderHook(({ cpId }) => useStationData(cpId, 67890), {
        initialProps: { cpId: 12345 as number | null },
      });

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
      });

      // Set cpId to null
      rerender({ cpId: null });

      expect(result.current.state).toBe('idle');
      expect(result.current.data).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle missing snapshot (no cache)', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollSuccessResponse);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(apiClient.pollStation).toHaveBeenCalled();
      });
    });

    it('should show error when no data available and no cuprId', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(null);
      vi.mocked(time.isDataStale).mockReturnValue(true);

      const { result } = renderHook(() => useStationData(12345, undefined));

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('No data available');
      });
    });

    it('should show error when poll-station returns NOT_FOUND', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollNotFoundResponse);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('Station not found');
      });
    });
  });

  describe('rate limiting', () => {
    it('should use cache when station is rate limited in cache', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(rateLimitCache.isStationRateLimited).mockReturnValue(true);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(result.current.isRateLimited).toBe(true);
        expect(apiClient.pollStation).not.toHaveBeenCalled();
      });
    });

    it('should mark rate limited and use cache on RATE_LIMITED response', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollRateLimitResponse);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(result.current.isRateLimited).toBe(true);
        expect(result.current.nextPollIn).toBe(300);
        expect(rateLimitCache.markRateLimited).toHaveBeenCalledWith(67890, 300);
      });
    });

    it('should show error on rate limit with no cache', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(apiClient.pollStation).mockResolvedValue(mockPollRateLimitResponse);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('Data unavailable (rate limited)');
      });
    });
  });
});
