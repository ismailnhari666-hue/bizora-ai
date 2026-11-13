const CACHE_NAME = "bizora-shell-v63";
const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const APP_SHELL = ["./", "./index.html", "./style.css?v=20261108-restore01", "./app.js?v=20261113-reset01", "./i18n-extra.js?v=20261113-reset01", "./locale.js?v=20261113-reset01", "./manifest.webmanifest", "./icons/bizora-icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).then(() => cache.add(new Request(SUPABASE_CDN, { mode: "no-cors" })).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.url === SUPABASE_CDN) {
    event.respondWith(fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); return response; }).catch(() => caches.match(request)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/rest/") || url.pathname.includes("/auth/") || url.pathname.includes("/realtime/")) return;
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok && request.url.startsWith(self.registration.scope)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html"))));
});