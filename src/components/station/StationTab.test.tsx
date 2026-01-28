import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StationTab } from './StationTab';
import type { StationSnapshot } from '../../../api/charger';

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
  isStandaloneApp: vi.fn(() => false),
  subscribeToStationNotifications: vi.fn(),
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
});
