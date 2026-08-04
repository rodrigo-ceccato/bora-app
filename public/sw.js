self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || {};
  event.waitUntil(self.registration.showNotification(data.title || 'Bora', {
    body: data.body || 'Você tem uma atualização no Bora.',
    icon: '/bora-share.svg',
    badge: '/bora-share.svg',
    data: { url: data.url || '/my-events' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/my-events'));
});
