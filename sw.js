const CACHE = 'sf-v1';
const FILES = [
  './index.html','./style.css','./app.js','./router.js',
  './db.js','./engine.js','./ui-saisie.js','./ui-etat.js',
  './ui-recurrent.js','./ui-stats.js','./ui-archives.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
