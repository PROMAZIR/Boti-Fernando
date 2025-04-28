// Adicione este código ao seu service worker (sw.js)

// Estratégia de cache para conteúdo dinâmico
async function networkFirstWithCache(request, cacheName, maxAge = 5 * 60 * 1000) {
    const cache = await caches.open(cacheName);
    
    try {
        // Tentar buscar do servidor primeiro
        const networkResponse = await fetch(request);
        
        // Se a resposta for bem-sucedida, armazenar no cache
        if (networkResponse.ok) {
            // Clonar a resposta para poder armazená-la no cache
            const responseToCache = networkResponse.clone();
            
            // Armazenar no cache com metadados
            const headers = new Headers(responseToCache.headers);
            headers.append('x-cache-timestamp', Date.now().toString());
            
            const cachedResponse = new Response(await responseToCache.blob(), {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: headers
            });
            
            cache.put(request, cachedResponse);
        }
        
        return networkResponse;
    } catch (error) {
        // Se falhar, tentar buscar do cache
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            // Verificar idade do cache
            const timestamp = cachedResponse.headers.get('x-cache-timestamp');
            if (timestamp) {
                const age = Date.now() - parseInt(timestamp);
                if (age > maxAge) {
                    // Cache muito antigo, remover
                    cache.delete(request);
                    return new Response('Content unavailable', { status: 503 });
                }
            }
            return cachedResponse;
        }
        
        // Se não estiver no cache, retornar erro
        return new Response('Network error', { status: 503 });
    }
}

// Modificar o event listener de fetch para usar a nova estratégia
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Verificar se é uma URL de conteúdo dinâmico
    const isDynamicContent = ['/banner', '/carousel', '/promos'].some(path => 
        url.pathname.includes(path)
    );
    
    // Para conteúdo dinâmico, usar estratégia network-first com cache inteligente
    if (isDynamicContent) {
        event.respondWith(
            networkFirstWithCache(event.request, CACHE_NAME)
        );
    } else {
        // Para outros recursos, usar estratégia padrão de cache-first
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request)
                        .then(fetchResponse => {
                            // Armazenar no cache
                            const responseClone = fetchResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                                
                            return fetchResponse;
                        });
                })
        );
    }
});
