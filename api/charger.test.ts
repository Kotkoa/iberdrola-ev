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

import { subscribeToLatestCharger, unsubscribeAllChannels } from './charger.js';

describe('charger API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('subscribeToLatestCharger', () => {
    it('should create a channel and subscribe to postgres_changes', () => {
      const onUpdate = vi.fn();

      subscribeToLatestCharger(onUpdate);

      expect(mockChannel).toHaveBeenCalledWith('charge_logs_latest');
      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'charge_logs_parsed',
        },
        expect.any(Function)
      );
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it('should return unsubscribe function that calls channel.unsubscribe', () => {
      const onUpdate = vi.fn();

      const unsubscribe = subscribeToLatestCharger(onUpdate);
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalledOnce();
    });

    it('should call onUpdate with valid charger data', () => {
      const onUpdate = vi.fn();
      let capturedCallback!: (payload: { new: unknown }) => void;

      mockOn.mockImplementation((_event, _config, callback) => {
        capturedCallback = callback;
        return { subscribe: mockSubscribe };
      });

      subscribeToLatestCharger(onUpdate);

      const validData = {
        cp_id: '123',
        cp_name: 'Test Station',
        overall_status: 'AVAILABLE',
      };
      capturedCallback({ new: validData });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          cp_id: '123',
          cp_name: 'Test Station',
          overall_status: 'AVAILABLE',
          port1_price_kwh: null,
          port2_price_kwh: null,
          cp_latitude: null,
          cp_longitude: null,
        })
      );
    });

    it('should not call onUpdate with incomplete charger data', () => {
      const onUpdate = vi.fn();
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let capturedCallback!: (payload: { new: unknown }) => void;

      mockOn.mockImplementation((_event, _config, callback) => {
        capturedCallback = callback;
        return { subscribe: mockSubscribe };
      });

      subscribeToLatestCharger(onUpdate);

      const incompleteData = { cp_id: '123' };
      capturedCallback({ new: incompleteData });

      expect(onUpdate).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(
        'Received incomplete charger data from Realtime, ignoring:',
        incompleteData
      );

      consoleWarn.mockRestore();
    });
  });

  describe('unsubscribeAllChannels', () => {
    it('should call supabase.removeAllChannels', () => {
      unsubscribeAllChannels();

      expect(mockRemoveAllChannels).toHaveBeenCalledOnce();
    });
  });
});
