// CRM CEA Aragón — Service Worker
const CACHE = 'crm-fn-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (e) => {
  // Pass-through: no caching strategy needed, just ensure SW exists for PWA installability
  e.respondWith(fetch(e.request))
})
