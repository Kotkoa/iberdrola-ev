import { startWatch, isApiSuccess } from './services/apiClient';
import type { StartWatchData } from './types/api';

const SAVE_SUBSCRIPTION_ENDPOINT =
  import.meta.env.VITE_SAVE_SUBSCRIPTION_URL ?? '/save-subscription';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Result from start-watch API call
 */
export interface StartWatchResult {
  subscriptionId: string;
  taskId: string;
  currentStatus: StartWatchData['current_status'];
  fresh: boolean;
  nextPollIn: number | null;
}

interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  const isDisplayModeStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const isNavigatorStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    (navigator as NavigatorStandalone).standalone === true;

  return isDisplayModeStandalone || isNavigatorStandalone;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    return registration;
  } catch {
    return null;
  }
}

/**
 * Ensures push notifications are supported, permission is granted,
 * and returns a valid PushSubscription (creating or re-creating if needed).
 */
async function ensurePushSubscription(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID public key not set.');
  }

  let permission: NotificationPermission = Notification.permission;

  if (permission === 'default') {
    permission = await Notification.requestPermission();
  } else if (permission === 'denied') {
    throw new Error('Notifications are blocked. Please allow them in browser settings.');
  }

  if (permission !== 'granted') {
    throw new Error('Subscription is not possible without notification permission.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const expectedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const existingKey = subscription.options?.applicationServerKey
      ? new Uint8Array(subscription.options.applicationServerKey as ArrayBuffer)
      : null;

    const keysMatch =
      existingKey &&
      existingKey.length === expectedKey.length &&
      existingKey.every((byte, i) => byte === expectedKey[i]);

    if (!keysMatch) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  return subscription;
}

export async function subscribeToStationNotifications(stationId: number, portNumber?: number) {
  const subscription = await ensurePushSubscription();
  await saveSubscriptionWithRetry(stationId, portNumber, subscription);
  return subscription;
}

async function saveSubscriptionWithRetry(
  stationId: number,
  portNumber: number | undefined,
  subscription: PushSubscription
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(SAVE_SUBSCRIPTION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_ANON_KEY
            ? {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              }
            : {}),
        },
        body: JSON.stringify({
          stationId: String(stationId),
          portNumber,
          subscription,
        }),
      });

      if (response.ok) {
        return;
      }

      // Don't retry on 4xx client errors - these are validation/auth issues
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `Client error: ${response.status} ${response.statusText}`);
      }

      lastError = new Error(`Server returned ${response.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Network error');
    }

    // Wait before retrying (exponential backoff)
    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }
  }

  throw lastError ?? new Error('Failed to save subscription after retries');
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Subscribe to station notifications using the new start-watch API
 * This triggers server-side polling and returns current status
 *
 * @param cuprId - CUPR ID for the station
 * @param portNumber - Port number (1 or 2) or null for any port
 * @returns StartWatchResult with subscription info and current status
 */
export async function subscribeWithWatch(
  cuprId: number,
  portNumber: 1 | 2 | null
): Promise<StartWatchResult> {
  const subscription = await ensurePushSubscription();

  // Call start-watch API
  const result = await startWatch({
    cupr_id: cuprId,
    port: portNumber,
    subscription: {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
        auth: arrayBufferToBase64(subscription.getKey('auth')!),
      },
    },
  });

  if (!isApiSuccess(result)) {
    throw new Error(result.error.message);
  }

  return {
    subscriptionId: result.data.subscription_id,
    taskId: result.data.task_id,
    currentStatus: result.data.current_status,
    fresh: result.data.fresh,
    nextPollIn: result.data.next_poll_in,
  };
}
