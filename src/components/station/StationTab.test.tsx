import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { StationTab } from './StationTab';
import type { StationSnapshot } from '../../../api/charger';

type MessageHandler = (event: { data: unknown }) => void;

// Mock the context
const mockPrimaryStation: StationSnapshot = {
  id: 'test-id',
  cp_id: 147988,
  source: 'user_station',
  observed_at: '2024-01-01T00:00:00Z',
  port1_status: 'OCCUPIED',
  port1_power_kw: 22,
  port1_price_kwh: 0,
  port1_update_date: '2024-01-01T00:00:00Z',
  port2_status: 'AVAILABLE',
  port2_power_kw: 22,
  port2_price_kwh: 0,
  port2_update_date: null,
  overall_status: 'AVAILABLE',
  emergency_stop_pressed: false,
  situation_code: 'OPER',
  created_at: '2024-01-01T00:00:00Z',
};

vi.mock('../../context/PrimaryStationContext', () => ({
  usePrimaryStation: vi.fn(() => ({
    primaryStation: mockPrimaryStation,
    loading: false,
    error: null,
    primaryStationId: 147988,
    hasRealtime: true,
  })),
  PrimaryStationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: { latitude: 38.8, longitude: -0.1 },
    error: null,
    loading: false,
  }),
}));

// Mock PWA functions
vi.mock('../../pwa', () => ({
  isPushSupported: vi.fn(() => true),
  subscribeWithWatch: vi.fn(),
}));

describe('StationTab', () => {
  const originalFetch = globalThis.fetch;
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset service worker mock
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: () =>
              Promise.resolve({
                endpoint: 'https://fcm.googleapis.com/test-endpoint',
              }),
          },
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('restoreSubscriptionState', () => {
    it('should correctly parse subscribedPorts from check-subscription API response', async () => {
      // Mock the check-subscription endpoint returning { subscribedPorts: [1] }
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [1] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('check-subscription'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('147988'),
          })
        );
      });
    });

    it('should NOT use deprecated "ports" field from API response', async () => {
      // Simulate old API response format with "ports" instead of "subscribedPorts"
      // This should NOT work - the button should remain in idle state
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ports: [1] }), // Wrong field name
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // The "Alert active" button should NOT appear because we're using wrong field
      // This test documents the expected behavior after the bug fix
      await waitFor(
        () => {
          const alertActiveButtons = screen.queryAllByRole('button', { name: /alert active/i });
          expect(alertActiveButtons).toHaveLength(0);
        },
        { timeout: 1000 }
      );
    });

    it('should show Alert active button when subscribedPorts includes port number', async () => {
      // Mock the check-subscription endpoint returning correct field
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [1] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      // Wait for the subscription state to be restored
      await waitFor(
        () => {
          const alertActiveButton = screen.queryByRole('button', { name: /alert active/i });
          // Button should exist because port 1 is in subscribedPorts
          expect(alertActiveButton).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it('should handle empty subscribedPorts array', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // "Get notified" button should be visible (not subscribed)
      await waitFor(
        () => {
          const getNotifiedButton = screen.queryByRole('button', { name: /get notified/i });
          expect(getNotifiedButton).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });

    it('should handle missing subscribedPorts field gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}), // No subscribedPorts field
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalled();
      });

      // Should default to empty array, so "Get notified" should be visible
      await waitFor(
        () => {
          const getNotifiedButton = screen.queryByRole('button', { name: /get notified/i });
          expect(getNotifiedButton).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });
  });

  describe('SW postMessage PUSH_RECEIVED', () => {
    /**
     * Helper: extracts the 'message' event handler registered on
     * navigator.serviceWorker.addEventListener during render.
     */
    function getSwMessageHandler(): MessageHandler {
      const addEventListenerMock = navigator.serviceWorker.addEventListener as ReturnType<
        typeof vi.fn
      >;
      const call = addEventListenerMock.mock.calls.find((c: unknown[]) => c[0] === 'message');
      if (!call) throw new Error('No message handler registered on serviceWorker');
      return call[1] as MessageHandler;
    }

    it('should reset subscription state to idle when PUSH_RECEIVED matches station and port', async () => {
      // Restore subscription state so port 1 shows "Alert active"
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [1] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      // Wait for "Alert active" to appear (subscription restored)
      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /alert active/i })).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Simulate SW sending PUSH_RECEIVED for the same station and port
      const handler = getSwMessageHandler();
      act(() => {
        handler({ data: { type: 'PUSH_RECEIVED', stationId: '147988', portNumber: 1 } });
      });

      // Button should revert to "Get notified"
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /get notified/i })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /alert active/i })).not.toBeInTheDocument();
    });

    it('should ignore PUSH_RECEIVED when stationId does not match', async () => {
      // Restore subscription state so port 1 shows "Alert active"
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [1] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /alert active/i })).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Dispatch PUSH_RECEIVED for a different station
      const handler = getSwMessageHandler();
      act(() => {
        handler({ data: { type: 'PUSH_RECEIVED', stationId: '999999', portNumber: 1 } });
      });

      // Button should still show "Alert active" (not reset)
      expect(screen.getByRole('button', { name: /alert active/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /get notified/i })).not.toBeInTheDocument();
    });

    it('should ignore PUSH_RECEIVED when portNumber does not match any valid port', async () => {
      // Restore subscription state so port 1 shows "Alert active"
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ subscribedPorts: [1] }),
      });

      render(<StationTab onNavigateToSearch={mockNavigate} />);

      await waitFor(
        () => {
          expect(screen.getByRole('button', { name: /alert active/i })).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // Dispatch PUSH_RECEIVED with an invalid port number
      const handler = getSwMessageHandler();
      act(() => {
        handler({ data: { type: 'PUSH_RECEIVED', stationId: '147988', portNumber: 3 } });
      });

      // Button should still show "Alert active" (not reset)
      expect(screen.getByRole('button', { name: /alert active/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /get notified/i })).not.toBeInTheDocument();
    });
  });
});
