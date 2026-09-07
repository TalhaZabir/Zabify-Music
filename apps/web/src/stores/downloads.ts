import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@zabify/shared';
import { audioDb } from '../lib/audioDb';
import { currentBases } from '../lib/apiClient';
import { toast } from './toast';

export type DownloadState = 'idle' | 'downloading' | 'cached' | 'failed';

export interface DownloadEntry {
  trackId: string;
  state: DownloadState;
  progress: number; // 0..1 while downloading
  size?: number;
  error?: string;
}

interface DownloadsState {
  entries: Record<string, DownloadEntry>;
  download: (track: Track) => Promise<void>;
  remove: (trackId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
  stateOf: (trackId: string) => DownloadState;
}

function setEntry(trackId: string, patch: Partial<DownloadEntry>): void {
  useDownloads.setState((s) => ({
    entries: { ...s.entries, [trackId]: { trackId, state: 'idle', progress: 0, ...s.entries[trackId], ...patch } },
  }));
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set, get) => ({
      entries: {},
      stateOf: (trackId) => get().entries[trackId]?.state ?? 'idle',

      download: async (track) => {
        const cur = get().entries[track.id];
        if (cur?.state === 'downloading' || cur?.state === 'cached') return;
        setEntry(track.id, { state: 'downloading', progress: 0, error: undefined });
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 120_000);
        try {
          const base = currentBases()[0] ?? '/api';
          const res = await fetch(`${base}/tracks/${encodeURIComponent(track.id)}/audio?quality=high`, {
            signal: ctrl.signal,
          });
          if ((!res.ok && res.status !== 206) || !res.body) {
            throw new Error(res.status === 404 ? 'Track unavailable' : `HTTP ${res.status}`);
          }
          const total = Number(res.headers.get('content-length') ?? '0');
          const reader = res.body.getReader();
          const chunks: BlobPart[] = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            if (total > 0) setEntry(track.id, { progress: Math.min(0.99, received / total) });
            if (received > 30 * 1024 * 1024) throw new Error('Too large to cache');
          }
          const blob = new Blob(chunks, { type: res.headers.get('content-type') ?? 'audio/mp4' });
          await audioDb.put({ trackId: track.id, blob, mime: blob.type, size: blob.size, cachedAt: Date.now(), track });
          setEntry(track.id, { state: 'cached', progress: 1, size: blob.size });
          toast('Cached for offline', 'success');
        } catch (e) {
          const msg = e instanceof DOMException && e.name === 'AbortError' ? 'Timed out' : e instanceof Error ? e.message : 'Download failed';
          setEntry(track.id, { state: 'failed', error: msg });
          toast(`Cache failed (${msg})`, 'error');
        } finally {
          window.clearTimeout(timer);
        }
      },

      remove: async (trackId) => {
        await audioDb.remove(trackId).catch(() => undefined);
        set((s) => {
          const entries = { ...s.entries };
          delete entries[trackId];
          return { entries };
        });
      },

      clearAll: async () => {
        await audioDb.clear().catch(() => undefined);
        set({ entries: {} });
        toast('Offline cache cleared');
      },

      refresh: async () => {
        try {
          const list = await audioDb.list();
          const have = new Set(list.map((e) => e.trackId));
          set((s) => {
            const entries: Record<string, DownloadEntry> = {};
            for (const e of list) {
              entries[e.trackId] = { trackId: e.trackId, state: 'cached', progress: 1, size: e.size };
            }
            // Drop stale index rows whose blobs are gone.
            for (const [id, en] of Object.entries(s.entries)) {
              if (en.state === 'downloading') entries[id] = en;
              else if (have.has(id) && !entries[id]) entries[id] = en;
            }
            return { entries };
          });
        } catch {
          // IndexedDB unavailable (private mode) — downloads stay disabled.
        }
      },
    }),
    {
      name: 'zabify-downloads',
      partialize: (s) => ({
        entries: Object.fromEntries(
          Object.entries(s.entries)
            .filter(([, e]) => e.state === 'cached')
            .map(([id, e]) => [id, { ...e, progress: 1 }]),
        ),
      }),
    },
  ),
);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
