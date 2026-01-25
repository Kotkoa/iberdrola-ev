self.addEventListener('push', (event) => {
  let payload = {
    title: 'Iberdrola EV Watcher',
    body: 'New notification',
    url: '/',
  };

  if (event.data) {
    try {
      const data = event.data.json();
      payload = { ...payload, ...data };
    } catch (error) {
      console.error('Failed to parse push payload', error);
    }
  }

  const { title, body, url } = payload;

  event.waitUntil(
    self.registration.showNotification(title ?? 'Iberdrola EV Watcher', {
      body,
      data: { url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      silent: false,
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
