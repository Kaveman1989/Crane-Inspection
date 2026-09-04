const CACHE = "crane-inspection-v1.4.2-4-0";
const ASSETS = ["./", "./index.html", "./operator.html", "./executive.html", "./manifest.json", "./icon.svg", "./config.js", "./auth.js", "./operator-cloud.js"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(()=>{}))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener("fetch", event => { if(event.request.method !== 'GET') return; event.respondWith(fetch(event.request).then(response=>{const copy=response.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{}); return response;}).catch(()=>caches.match(event.request))); });
