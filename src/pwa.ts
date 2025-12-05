const SAVE_SUBSCRIPTION_ENDPOINT =
  import.meta.env.VITE_SAVE_SUBSCRIPTION_URL ?? '/save-subscription'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_ANON_KEY is not set; edge calls may fail.')
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported in this browser.')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    console.info('Service worker registered', registration)
    return registration
  } catch (error) {
    console.error('Service worker registration failed', error)
    return null
  }
}

export async function subscribeToStationNotifications(
  stationId: number,
  portNumber?: number
) {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.') // on english.
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID public key not set.')
  }

  let permission: NotificationPermission = Notification.permission

  if (permission === 'default') {
    permission = await Notification.requestPermission()
  } else if (permission === 'denied') {
    throw new Error(
      'Notifications are blocked. Please allow them in browser settings.'
    )
  }

  if (permission !== 'granted') {
    throw new Error(
      'Subscription is not possible without notification permission.'
    )
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

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
  })

  if (!response.ok) {
    throw new Error('Failed to save subscription on the server.')
  }

  return subscription
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}
