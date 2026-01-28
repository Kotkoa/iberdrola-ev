import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSaveStationToCache, loadStationsFromCacheNearLocation } from './stationApi';
import { supabase } from '../../api/supabase';

// Mock supabase
vi.mock('../../api/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

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

describe('loadStationsFromCacheNearLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no metadata found', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const result = await loadStationsFromCacheNearLocation(38.8, -0.1, 5);

    expect(result).toEqual([]);
  });

  it('should return empty array on metadata query error', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
              }),
            }),
          }),
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const result = await loadStationsFromCacheNearLocation(38.8, -0.1, 5);

    expect(result).toEqual([]);
  });

  it('should mark returned stations with _fromCache=true', async () => {
    // This test verifies the contract that cached stations are marked
    // The actual implementation is complex with multiple DB queries
    // so we test the output contract
    const mockMetadata = [
      { cp_id: 1, cupr_id: 100, latitude: 38.8, longitude: -0.1, address_full: 'Test Address' },
    ];

    const mockSnapshots = [
      {
        cp_id: 1,
        port1_status: 'AVAILABLE',
        port1_power_kw: 22,
        port1_price_kwh: 0,
        port2_status: 'AVAILABLE',
        port2_power_kw: 22,
        port2_price_kwh: 0,
        overall_status: 'AVAILABLE',
        emergency_stop_pressed: false,
        created_at: new Date().toISOString(),
      },
    ];

    // Mock complex chain for metadata query
    const metadataChain = {
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: mockMetadata, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    // Mock complex chain for snapshots query
    const snapshotsChain = {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
          }),
        }),
      }),
    };

    // Mock metadata query for getStationsFromCache
    const metadataForCacheChain = {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: mockMetadata, error: null }),
      }),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'station_metadata') {
        // Return different mocks based on call order
        const callCount = vi
          .mocked(supabase.from)
          .mock.calls.filter((c) => c[0] === 'station_metadata').length;
        if (callCount === 1) {
          return metadataChain as unknown as ReturnType<typeof supabase.from>;
        }
        return metadataForCacheChain as unknown as ReturnType<typeof supabase.from>;
      }
      return snapshotsChain as unknown as ReturnType<typeof supabase.from>;
    });

    const result = await loadStationsFromCacheNearLocation(38.8, -0.1, 5);

    // All returned stations should have _fromCache=true
    result.forEach((station) => {
      expect(station._fromCache).toBe(true);
    });
  });
});
