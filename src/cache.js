// Synced lyrics are cached permanently in IndexedDB; unsynced results are never cached.
export const lyricsCache = (() => {
  const memory = new Map(); // uri -> entry, mirrors what has been read/written this session
  const dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open("synced-lyrics", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("lyrics");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  const run = async (mode, fn) => {
    const db = await dbPromise;
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const req = fn(db.transaction("lyrics", mode).objectStore("lyrics"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };

  return {
    async get(uri) {
      if (memory.has(uri)) return memory.get(uri);
      const entry = await run("readonly", (store) => store.get(uri));
      if (entry) memory.set(uri, entry);
      return entry || null;
    },
    set(uri, result) {
      const entry = { status: "synced", source: result.source, url: result.url, lines: result.lines, plain: null };
      memory.set(uri, entry);
      return run("readwrite", (store) => store.put(entry, uri));
    },
  };
})();
