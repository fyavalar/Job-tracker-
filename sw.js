const CACHE = "jobs-v2";
const BASE = new URL("./", self.location);
const FILES = [
  "",
  "index.html",
  "manifest.json",
  "css/app.css",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "js/app.js",
  "js/format.js",
  "js/model.js",
  "js/phone.js",
  "js/calc.js",
  "js/migrate.js",
  "js/csv.js",
  "js/search.js",
  "js/pdf.js",
  "js/backup.js",
  "js/db.js",
  "js/state.js",
  "js/actions.js",
  "js/icons.js",
  "js/components.js",
  "js/images.js",
  "js/nav.js",
  "js/views/home.js",
  "js/views/jobs.js",
  "js/views/customers.js",
  "js/views/docs.js",
  "js/views/calendar.js",
  "js/views/money.js",
  "js/views/inventory.js",
  "js/views/more.js"
].map((path) => new URL(path, BASE).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match(new URL("index.html", BASE).href)))
  );
});
