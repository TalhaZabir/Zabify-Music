import type { Track } from '@zabify/shared';

// Minimal IndexedDB wrapper for cached audio. Blobs live here; only tiny
// metadata lives in localStorage. No external dependency needed.
const DB = 'zabify-v1';
const STORE = 'audio';

export interface CachedAudio {
  trackId: string;
  blob: Blob;
  mime: string;
  size: number;
  cachedAt: number;
  track: Track;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'trackId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
        t.oncomplete = () => db.close();
        t.onerror = () => db.close();
      }),
  );
}

export const audioDb = {
  put: (entry: CachedAudio) => tx('readwrite', (s) => s.put(entry)),
  get: (trackId: string) => tx<CachedAudio | undefined>('readonly', (s) => s.get(trackId)),
  has: async (trackId: string): Promise<boolean> => (await tx<IDBValidKey | undefined>('readonly', (s) => s.getKey(trackId))) !== undefined,
  remove: (trackId: string) => tx('readwrite', (s) => s.delete(trackId)),
  clear: () => tx('readwrite', (s) => s.clear()),
  list: (): Promise<{ trackId: string; size: number; cachedAt: number; track: Track }[]> =>
    open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const out: { trackId: string; size: number; cachedAt: number; track: Track }[] = [];
          const t = db.transaction(STORE, 'readonly');
          const cursor = t.objectStore(STORE).openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) {
              db.close();
              resolve(out);
              return;
            }
            const v = c.value as CachedAudio;
            out.push({ trackId: v.trackId, size: v.size, cachedAt: v.cachedAt, track: v.track });
            c.continue();
          };
          cursor.onerror = () => {
            db.close();
            reject(cursor.error ?? new Error('IndexedDB failed'));
          };
        }),
    ),
};
