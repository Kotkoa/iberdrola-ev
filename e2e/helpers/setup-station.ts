import type { BrowserContext } from '@playwright/test';
import { TEST_STATION, STORAGE_KEY_PRIMARY_STATION } from '../fixtures/constants';

/**
 * Seeds localStorage with primary station data BEFORE any app code runs.
 * Must be called before page.goto().
 */
export async function seedPrimaryStation(
  context: BrowserContext,
  cpId: number = TEST_STATION.cpId,
  cuprId: number = TEST_STATION.cuprId
) {
  await context.addInitScript(
    ({ key, cpId, cuprId }) => {
      localStorage.setItem(key, JSON.stringify({ cpId, cuprId }));
    },
    { key: STORAGE_KEY_PRIMARY_STATION, cpId, cuprId }
  );
}

/**
 * Mocks Push API (ServiceWorker + PushManager + Notification) for E2E tests.
 * Must be called before page.goto().
 *
 * Provides:
 * - navigator.serviceWorker.ready → mock registration
 * - registration.pushManager.getSubscription() → mock PushSubscription
 * - registration.pushManager.subscribe() → mock PushSubscription
 * - Notification.permission = 'granted'
 */
export async function mockPushApi(context: BrowserContext) {
  await context.addInitScript(() => {
    const MOCK_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-push-endpoint';
    const MOCK_KEY_BYTES = new Uint8Array(65).fill(4); // p256dh
    const MOCK_AUTH_BYTES = new Uint8Array(16).fill(7); // auth

    const mockPushSubscription = {
      endpoint: MOCK_ENDPOINT,
      expirationTime: null,
      options: {
        applicationServerKey: MOCK_KEY_BYTES.buffer,
        userVisibleOnly: true,
      },
      getKey(name: string) {
        if (name === 'p256dh') return MOCK_KEY_BYTES.buffer;
        if (name === 'auth') return MOCK_AUTH_BYTES.buffer;
        return null;
      },
      unsubscribe: async () => true,
      toJSON() {
        return { endpoint: MOCK_ENDPOINT, keys: { p256dh: 'mock', auth: 'mock' } };
      },
    };

    const mockPushManager = {
      getSubscription: async () => mockPushSubscription,
      subscribe: async () => mockPushSubscription,
      permissionState: async () => 'granted' as const,
    };

    const mockRegistration = {
      pushManager: mockPushManager,
      active: { state: 'activated' },
      installing: null,
      waiting: null,
      scope: '/',
      updateViaCache: 'none' as const,
      addEventListener: () => {},
      removeEventListener: () => {},
      update: async () => mockRegistration,
      unregister: async () => true,
      showNotification: async () => {},
      getNotifications: async () => [],
      navigationPreload: {
        enable: async () => {},
        disable: async () => {},
        setHeaderValue: async () => {},
        getState: async () => ({ enabled: false, headerValue: '' }),
      },
    };

    // Mock navigator.serviceWorker.ready
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        get: () => Promise.resolve(mockRegistration),
      });
      // Also mock register to prevent real SW registration
      navigator.serviceWorker.register = async () =>
        mockRegistration as unknown as ServiceWorkerRegistration;
    }

    // Mock Notification
    if ('Notification' in window) {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'granted',
        configurable: true,
      });
      Notification.requestPermission = async () => 'granted';
    }
  });
}
