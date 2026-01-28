import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStationData } from './useStationData';
import * as charger from '../../api/charger';
import * as stationApi from '../services/stationApi';
import * as time from '../utils/time';

// Mock modules
vi.mock('../../api/charger', () => ({
  getLatestSnapshot: vi.fn(),
  getStationMetadata: vi.fn(),
  subscribeToSnapshots: vi.fn(),
  snapshotToChargerStatus: vi.fn(),
}));

vi.mock('../services/stationApi', () => ({
  fetchStationViaEdge: vi.fn(),
}));

vi.mock('../utils/time', () => ({
  isDataStale: vi.fn(),
}));

describe('useStationData', () => {
  const mockSnapshot = {
    id: 'test-id',
    cp_id: 12345,
    source: 'user_station',
    observed_at: '2024-01-01T12:00:00Z',
    payload_hash: 'hash123',
    port1_status: 'AVAILABLE',
    port1_power_kw: '22',
    port1_price_kwh: '0',
    port1_update_date: null,
    port2_status: 'OCCUPIED',
    port2_power_kw: '22',
    port2_price_kwh: '0',
    port2_update_date: null,
    overall_status: 'AVAILABLE',
    emergency_stop_pressed: false,
    situation_code: 'OPER',
    created_at: '2024-01-01T12:00:00Z',
  };

  const mockMetadata = {
    latitude: 40.4168,
    longitude: -3.7038,
    address_full: 'Calle Test 123, Madrid',
  };

  const mockChargerStatus = {
    cp_id: 12345,
    cp_name: 'Calle Test 123',
    cp_latitude: 40.4168,
    cp_longitude: -3.7038,
    address_full: 'Calle Test 123, Madrid',
    overall_status: 'AVAILABLE',
    port1_status: 'AVAILABLE',
    port1_power_kw: 22,
    port1_price_kwh: 0,
    port2_status: 'OCCUPIED',
    port2_power_kw: 22,
    port2_price_kwh: 0,
    created_at: '2024-01-01T12:00:00Z',
    emergency_stop_pressed: false,
    situation_code: 'OPER',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: returns unsubscribe function
    vi.mocked(charger.subscribeToSnapshots).mockReturnValue(() => {});
    vi.mocked(charger.snapshotToChargerStatus).mockReturnValue(mockChargerStatus);
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
      vi.mocked(stationApi.fetchStationViaEdge).mockResolvedValue(mockChargerStatus);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(stationApi.fetchStationViaEdge).toHaveBeenCalledWith(12345, 67890);
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
        expect(time.isDataStale).toHaveBeenCalledWith(mockSnapshot.created_at, 15);
        expect(stationApi.fetchStationViaEdge).not.toHaveBeenCalled();
      });
    });

    it('should fetch from Edge when cache is stale', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(mockSnapshot);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(stationApi.fetchStationViaEdge).mockResolvedValue(mockChargerStatus);

      renderHook(() => useStationData(12345, 67890, 5));

      await waitFor(() => {
        expect(stationApi.fetchStationViaEdge).toHaveBeenCalledWith(12345, 67890);
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
        expect(stationApi.fetchStationViaEdge).not.toHaveBeenCalled();
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
        expect(charger.subscribeToSnapshots).toHaveBeenCalledWith(12345, expect.any(Function));
      });
    });

    it('should unsubscribe on unmount', async () => {
      const unsubscribeMock = vi.fn();
      vi.mocked(charger.subscribeToSnapshots).mockReturnValue(unsubscribeMock);
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
      let realtimeCallback: ((snapshot: typeof mockSnapshot) => void) | null = null;

      vi.mocked(charger.subscribeToSnapshots).mockImplementation((cpId, callback) => {
        realtimeCallback = callback;
        return () => {};
      });
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
      vi.mocked(stationApi.fetchStationViaEdge).mockResolvedValue(mockChargerStatus);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('ready');
        expect(stationApi.fetchStationViaEdge).toHaveBeenCalled();
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

    it('should show error when Edge returns null', async () => {
      vi.mocked(charger.getLatestSnapshot).mockResolvedValue(null);
      vi.mocked(charger.getStationMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(time.isDataStale).mockReturnValue(true);
      vi.mocked(stationApi.fetchStationViaEdge).mockResolvedValue(null);

      const { result } = renderHook(() => useStationData(12345, 67890));

      await waitFor(() => {
        expect(result.current.state).toBe('error');
        expect(result.current.error).toBe('Station not found');
      });
    });
  });
});
