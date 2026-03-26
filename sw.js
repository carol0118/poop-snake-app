self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("poop-snake-v1").then((cache) =>
      cache.addAll(["./", "./index.html", "./styles.css", "./app.js", "./icon.svg", "./manifest.webmanifest"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== "poop-snake-v1").map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
