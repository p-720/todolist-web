const CACHE = 'pomotasker-v3';

const BASE = '/pomotask';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request)),
  );
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch (err) {}

  // Drop notifications that are not for the user logged into this device
  // (push subs are per-user now; the server stamps each payload with `user`).
  e.waitUntil(
    fetch(`${BASE}/api/auth`)
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me || !me.authenticated) return;
        if (data.user && me.username !== data.user) return;
        show(data);
      })
      .catch(() => {}),
  );
});

function show(data) {
  if (data.digest) {
    self.registration.showNotification(data.title || 'Goals', {
      body: data.body || '',
      icon: `${BASE}/icons/icon-192.png`,
      tag: 'goals-digest',
      data: { digest: true },
      vibrate: [100, 50, 100],
    });
    return;
  }
  self.registration.showNotification(data.title || 'PomoTasker', {
    body: data.body || '',
    icon: `${BASE}/icons/icon-192.png`,
    tag: `goal-${data.goalId || 'x'}`,
    data: { goalId: data.goalId },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'complete', title: '✓ Complete' },
      { action: 'update', title: '✎ Update' },
      { action: 'archive', title: '🗄 Archive' },
    ],
  });
});

async function goalAction(goalId, action) {
  try {
    await fetch(`${BASE}/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  } catch (err) {
    console.error('goal action failed:', err);
  }
}

self.addEventListener('notificationclick', (e) => {
  const goalId = e.notification.data?.goalId;
  e.notification.close();

  if (e.action === 'complete' || e.action === 'archive') {
    e.waitUntil(goalAction(goalId, e.action));
    return;
  }

  // 'update' or plain tap: open the app so the user can edit the goal
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(BASE) && 'focus' in client) {
          client.postMessage({ type: 'goals:open', goalId });
          return client.focus();
        }
      }
      return self.clients.openWindow(self.registration.scope + (goalId ? `?goal=${goalId}` : ''));
    }),
  );
});