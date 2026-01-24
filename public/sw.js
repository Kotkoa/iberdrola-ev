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
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL('/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Try to find and focus existing client
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }

      // No existing client found, open new window at root
      if (clients.openWindow) {
        await clients.openWindow(urlToOpen);
      }
    })()
  );
});
