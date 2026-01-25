import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUnsubscribe, mockSubscribe, mockOn, mockChannel, mockRemoveAllChannels } = vi.hoisted(
  () => {
    const mockUnsubscribe = vi.fn();
    const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: mockUnsubscribe });
    const mockOn = vi.fn().mockReturnValue({ subscribe: mockSubscribe });
    const mockChannel = vi.fn().mockReturnValue({ on: mockOn });
    const mockRemoveAllChannels = vi.fn();
    return {
      mockUnsubscribe,
      mockSubscribe,
      mockOn,
      mockChannel,
      mockRemoveAllChannels,
    };
  }
);

vi.mock('./supabase.js', () => ({
  supabase: {
    channel: mockChannel,
    removeAllChannels: mockRemoveAllChannels,
  },
  supabaseFetch: vi.fn(),
}));

import { subscribeToSnapshots, unsubscribeAllChannels } from './charger.js';

describe('charger API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToSnapshots', () => {
    it('should create a channel and subscribe to postgres_changes on station_snapshots', () => {
      const onUpdate = vi.fn();
      const cpId = 12345;

      subscribeToSnapshots(cpId, onUpdate);

      expect(mockChannel).toHaveBeenCalledWith(`station_snapshots_${cpId}`);
      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'station_snapshots',
          filter: `cp_id=eq.${cpId}`,
        },
        expect.any(Function)
      );
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it('should return unsubscribe function that calls channel.unsubscribe', () => {
      const onUpdate = vi.fn();

      const unsubscribe = subscribeToSnapshots(12345, onUpdate);
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });

    it('should call onUpdate with valid snapshot data', () => {
      const onUpdate = vi.fn();
      let capturedCallback!: (payload: { new: unknown }) => void;

      mockOn.mockImplementation((_event, _config, callback) => {
        capturedCallback = callback;
        return { subscribe: mockSubscribe };
      });

      subscribeToSnapshots(12345, onUpdate);

      const validData = {
        id: 'test-id',
        cp_id: 12345,
        source: 'user_station',
        observed_at: '2024-01-01T00:00:00Z',
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
        created_at: '2024-01-01T00:00:00Z',
      };
      capturedCallback({ new: validData });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          cp_id: 12345,
          source: 'user_station',
          port1_status: 'AVAILABLE',
          port1_power_kw: 22,
          port1_price_kwh: 0,
          port2_status: 'OCCUPIED',
          port2_power_kw: 22,
          port2_price_kwh: 0,
        })
      );
    });

    it('should not call onUpdate when cp_id is missing', () => {
      const onUpdate = vi.fn();
      let capturedCallback!: (payload: { new: unknown }) => void;

      mockOn.mockImplementation((_event, _config, callback) => {
        capturedCallback = callback;
        return { subscribe: mockSubscribe };
      });

      subscribeToSnapshots(12345, onUpdate);

      const incompleteData = { id: 'test-id' };
      capturedCallback({ new: incompleteData });

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeAllChannels', () => {
    it('should call supabase.removeAllChannels', () => {
      unsubscribeAllChannels();

      expect(mockRemoveAllChannels).toHaveBeenCalledOnce();
    });
  });
});
