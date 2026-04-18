// firebase-messaging-sw.js — Service Worker do Firebase Cloud Messaging
// Precisa ficar no ROOT do site (https://erlongiovanini.github.io/firebase-messaging-sw.js)

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAoPUBPNSPPzd67L0FQDBHtUe4CoxTzkaA",
  authDomain: "erlon-consultoria.firebaseapp.com",
  projectId: "erlon-consultoria",
  storageBucket: "erlon-consultoria.firebasestorage.app",
  messagingSenderId: "8286279189",
  appId: "1:8286279189:web:c8255d120df62613e8e01c"
});

const messaging = firebase.messaging();

// Recebe mensagem em background (app fechado ou em outra aba)
messaging.onBackgroundMessage(function(payload) {
  const title = (payload.notification && payload.notification.title) || 'Erlon Giovanini';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.tag) || 'default'
  };
  return self.registration.showNotification(title, options);
});

// Clique na notificação abre/foca a aba
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlAbrir = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var c = windowClients[i];
        if (c.url.indexOf(urlAbrir) > -1 && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlAbrir);
    })
  );
});
