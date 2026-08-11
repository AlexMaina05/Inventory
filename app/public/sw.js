// Service Worker di base per abilitare l'installazione PWA
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  return self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  // Lasciamo gestire il caching al browser e a Vercel
});
