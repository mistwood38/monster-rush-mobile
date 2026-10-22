importScripts("./v17-cache.js");
const CACHE = "monster-rush-horde-rework-3";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./audio.js",
  "./sprites.js",
  "./actors3d.js",
  "./horde.js",
  "./sprite-state.mjs",
  "./v17-cache.js",
  "./config/balance-v17.js",
  "./systems.js",
  "./config/catalog.js",
  "./assets/characters/player_soldier_back.webp",
  "./assets/backgrounds/highway_day.webp",
  "./assets/gates/fire_rate_plus_20.webp",
  "./assets/pets/dragon.svg",
  "./assets/pets/owl.svg",
  "./assets/pets/drone.svg",
  "./assets/pets/fairy.svg",
  "./assets/armors/thunder.svg",
  "./assets/armors/molten.svg",
  "./assets/armors/phantom.svg",

  "./assets/enemies/scout.svg",
  "./assets/enemies/runner.svg",
  "./assets/enemies/heavy.svg",
  "./assets/enemies/ranged.svg",
  "./assets/enemies/charger.svg",
  "./assets/enemies/elite.svg",
  "./assets/enemies/boss.svg",

  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/three/three.module.min.js",
  "./vendor/three/LICENSE",
];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([...FILES, ...self.V17_FILES])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin
  )
    return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => caches.match("./index.html")),
    ),
  );
});
