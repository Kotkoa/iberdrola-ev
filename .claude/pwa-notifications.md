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
