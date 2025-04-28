const CACHE_NAME = 'cred-fernando-v1.1.0';
const DYNAMIC_CACHE = 'cred-fernando-dynamic-v1.1.0';

// Recursos a serem cacheados inicialmente
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png'
];

// Instalar o service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativar o service worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE;
        }).map(cacheName => {
          console.log('Removendo cache antigo:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de cache: Network First para o iframe, Cache First para recursos estáticos
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Verificar se é uma solicitação para o iframe do Google Apps Script
  if (url.href.includes('script.google.com')) {
    // Para o iframe, sempre buscar da rede primeiro
    event.respondWith(
      fetch(event.request, { 
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      })
        .then(response => {
          // Clonar a resposta para poder usá-la e armazená-la
          const responseClone = response.clone();
          
          caches.open(DYNAMIC_CACHE)
            .then(cache => {
              cache.put(event.request, responseClone);
            });
            
          return response;
        })
        .catch(() => {
          // Se falhar, tentar do cache
          return caches.match(event.request);
        })
    );
  } else {
    // Para outros recursos, usar cache first
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          return response || fetch(event.request)
            .then(fetchResponse => {
              return caches.open(DYNAMIC_CACHE)
                .then(cache => {
                  // Não armazenar em cache respostas de API ou recursos dinâmicos
                  if (!event.request.url.includes('api') && 
                      !event.request.url.includes('socket') &&
                      event.request.method === 'GET') {
                    cache.put(event.request, fetchResponse.clone());
                  }
                  return fetchResponse;
                });
            });
        })
    );
  }
});

// Lidar com mensagens do cliente
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.delete(DYNAMIC_CACHE).then(() => {
      console.log('Cache dinâmico limpo');
    });
  }
});

// Sincronização em segundo plano
self.addEventListener('sync', event => {
  if (event.tag === 'refresh-content') {
    event.waitUntil(
      // Limpar o cache do iframe
      caches.open(DYNAMIC_CACHE).then(cache => {
        return cache.keys().then(keys => {
          return Promise.all(
            keys.filter(request => {
              return request.url.includes('script.google.com');
            }).map(request => {
              return cache.delete(request);
            })
          );
        });
      })
    );
  }
});

// Notificações push
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'Há uma atualização disponível!',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-32x32.png',
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Atualização', options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'}).then(clientList => {
      // Verificar se já há uma janela aberta e focar nela
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Se não houver janela aberta, abrir uma nova
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
