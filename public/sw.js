self.addEventListener('push', (event) => {
  let payload = {
    title: 'Iberdrola EV Watcher',
    body: 'Новое уведомление',
    url: '/',
  }

  if (event.data) {
    try {
      const data = event.data.json()
      payload = { ...payload, ...data }
    } catch (error) {
      console.error('Failed to parse push payload', error)
    }
  }

  const { title, body, url } = payload

  event.waitUntil(
    self.registration.showNotification(title ?? 'Iberdrola EV Watcher', {
      body,
      data: { url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  const targetUrl = event.notification?.data?.url || '/'
  event.notification.close()

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of allClients) {
        if ('focus' in client && client.url.startsWith(self.location.origin)) {
          await client.focus()
          if ('navigate' in client && targetUrl) {
            await client.navigate(targetUrl)
          }
          return
        }
      }

      if (clients.openWindow && targetUrl) {
        await clients.openWindow(targetUrl)
      }
    })()
  )
})
