// firebase-messaging-sw.js — Service Worker do Firebase Cloud Messaging
// Precisa ficar no ROOT do site (https://erlongiovanini.github.io/firebase-messaging-sw.js)
//
// Bloco 12 — Anti-duplicação iOS PWA:
// Backend envia payload SÓ com 'data' (sem 'notification').
// Apenas este Service Worker mostra a notificação, evitando duplicação.
//
// Bloco 9D — Roteamento inteligente:
// Ao clicar na notificação, abre a tela específica (ex: /aluna.html?tela=renovar)

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
// Lê título e corpo do campo 'data' (não mais 'notification')
messaging.onBackgroundMessage(function(payload) {
  var d = payload.data || {};
  var title = d.title || 'Erlon Giovanini';
  var body = d.body || '';
  var options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: d,
    tag: d.tag || 'default'
  };
  return self.registration.showNotification(title, options);
});

// Bloco 9D — Clique na notificação abre/foca a tela correta
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var data = event.notification.data || {};
  var urlAbrir = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Procura por uma aba do app já aberta na URL exata destino
      for (var i = 0; i < windowClients.length; i++) {
        var c = windowClients[i];
        if (c.url.indexOf(urlAbrir) > -1 && 'focus' in c) {
          return c.focus();
        }
      }
      // Se tem aba do app (aluna.html) aberta — navega ela pro destino
      for (var j = 0; j < windowClients.length; j++) {
        var c2 = windowClients[j];
        if (c2.url.indexOf('aluna.html') > -1 && 'navigate' in c2 && 'focus' in c2) {
          return c2.navigate(urlAbrir).then(function() { return c2.focus(); });
        }
      }
      // Senão, abre uma nova janela
      if (clients.openWindow) return clients.openWindow(urlAbrir);
    })
  );
});
