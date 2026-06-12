const CACHE = 'eyeq-v3'; // bumped for the Next.js topology — old caches are purged on activate
const SHELL = ['/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first for API calls (so real data takes priority when online)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((c) => c ?? new Response('{"error":"offline"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
    );
    return;
  }

  // Network-first for page navigations — otherwise deploys stay invisible
  // until the second visit. Each route's HTML is cached under its own URL
  // (Next renders per-route documents, unlike the single SPA shell).
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then((c) => c ?? caches.match('/'))
        )
    );
    return;
  }

  // Cache-first for everything else (hashed /_next/static chunks, anatomy
  // images, generated media, icons)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      });
      return cached ?? network;
    })
  );
});

// Background sync: replay failed gamification writes from IDB queue
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-gamification") {
    e.waitUntil(replayGamificationQueue());
  }
});

async function replayGamificationQueue() {
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("eyebot", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (event) => {
        const d = event.target.result;
        if (!d.objectStoreNames.contains("qcache")) d.createObjectStore("qcache");
        if (!d.objectStoreNames.contains("syncQueue")) d.createObjectStore("syncQueue", { autoIncrement: true });
      };
    });
  } catch {
    return;
  }

  const items = await new Promise((resolve) => {
    const tx = db.transaction("syncQueue", "readonly");
    const req = tx.objectStore("syncQueue").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });

  for (let i = 0; i < items.length; i++) {
    try {
      const res = await fetch("/api/gamification/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items[i]),
      });
      if (res.ok) {
        await new Promise((resolve) => {
          // Delete by index (IDB autoIncrement keys start at 1)
          const tx = db.transaction("syncQueue", "readwrite");
          const store = tx.objectStore("syncQueue");
          const getReq = store.getAllKeys();
          getReq.onsuccess = () => {
            const keys = getReq.result;
            if (keys[i] !== undefined) store.delete(keys[i]);
            resolve(undefined);
          };
          getReq.onerror = () => resolve(undefined);
        });
      }
    } catch {
      // Network still down — leave in queue for next sync attempt
    }
  }
}
