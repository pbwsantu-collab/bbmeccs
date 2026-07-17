cat << 'EOF' > public/sw.js
const CACHE_NAME = 'bbm-eccs-v2';
const ASSETS_TO_CACHE = [
    '/',
        '/index.html',
            '/assets/css/style.css',
                '/assets/js/app.js',
                    '/assets/js/db.js',
                        '/manifest.json'
                        ];

                        self.addEventListener('install', (event) => {
                            event.waitUntil(
                                    caches.open(CACHE_NAME).then((cache) => {
                                                console.log('Pre-caching core structural files...');
                                                            return cache.addAll(ASSETS_TO_CACHE);
                                                                    })
                                                                        );
                                                                            self.skipWaiting();
                                                                            });

                                                                            self.addEventListener('activate', (event) => {
                                                                                event.waitUntil(
                                                                                        caches.keys().then((keys) => {
                                                                                                    return Promise.all(
                                                                                                                    keys.map((key) => {
                                                                                                                                        if (key !== CACHE_NAME) {
                                                                                                                                                                console.log('Clearing old cache partition:', key);
                                                                                                                                                                                        return caches.delete(key);
                                                                                                                                                                                                            }
                                                                                                                                                                                                                            })
                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                })
                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                        self.clients.claim();
                                                                                                                                                                                                                                                        });

                                                                                                                                                                                                                                                        self.addEventListener('fetch', (event) => {
                                                                                                                                                                                                                                                            if (!event.request.url.startsWith(self.location.origin)) return;

                                                                                                                                                                                                                                                                event.respondWith(
                                                                                                                                                                                                                                                                        fetch(event.request)
                                                                                                                                                                                                                                                                                    .then((response) => {
                                                                                                                                                                                                                                                                                                    const resClone = response.clone();
                                                                                                                                                                                                                                                                                                                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
                                                                                                                                                                                                                                                                                                                                    return response;
                                                                                                                                                                                                                                                                                                                                                })
                                                                                                                                                                                                                                                                                                                                                            .catch(() => {
                                                                                                                                                                                                                                                                                                                                                                            return caches.match(event.request);
                                                                                                                                                                                                                                                                                                                                                                                        })
                                                                                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                                                                                            });
                                                                                                                                                                                                                                                                                                                                                                                            EOF
                                                                                                                                                                                                                                                                                                                                                                                            