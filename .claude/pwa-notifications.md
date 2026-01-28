# PWA & Push Notifications

## Push Notification Flow

```typescript
// 1. Check support
isPushSupported() // from src/pwa.ts

// 2. Subscribe flow
subscribeToStationNotifications(stationId, portNumber)
  → Request permission
  → Register service worker
  → Subscribe to push
  → Save to backend
```

## Required Environment Variables

```bash
VITE_VAPID_PUBLIC_KEY          # Web Push public key
VITE_SAVE_SUBSCRIPTION_URL     # Backend endpoint for subscriptions
VITE_CHECK_SUB_URL             # Check existing subscriptions
```

## Key Files

- **[src/pwa.ts](../src/pwa.ts)** - PWA utilities and push notification functions
- **[public/sw.js](../public/sw.js)** - Service worker implementation (handles push events and notification clicks)

## PWA Detection

Use `isStandaloneApp()` - checks both:

- `display-mode: standalone` media query
- `navigator.standalone` property (iOS)

## Subscription Retry Logic

When saving push subscription to backend, the app uses retry with exponential backoff:

- **Max attempts**: 3
- **Delay**: 1s, 2s, 3s (linear backoff)
- **4xx errors**: No retry (client error, immediate throw)
- **5xx errors**: Retry with backoff

```typescript
// In src/pwa.ts
async function saveSubscriptionWithRetry(stationId, portNumber, subscription) {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(SAVE_SUBSCRIPTION_ENDPOINT, {...});

    if (response.ok) return;

    // Don't retry on client errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Client error: ${response.status}`);
    }

    // Wait before retry (exponential backoff)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
  }
  throw lastError;
}
```

## Subscription Button Debounce

To prevent multiple rapid subscription requests, the "Get notified" button uses debounce:

- **Debounce delay**: 2000ms
- **Per-port tracking**: Each port has independent debounce
- **Implementation**: `useRef` with last click timestamp
