import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QueueItem, Track } from '@zabify/shared';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function item(track: Track, origin: 'manual' | 'auto'): QueueItem {
  return { queueId: uid(), track, addedAt: Date.now(), origin };
}

export function isAuto(i: QueueItem): boolean {
  return i.origin === 'auto';
}

interface QueueState {
  items: QueueItem[];
  index: number;
  enqueue: (t: Track) => void;
  playNext: (t: Track) => void;
  appendAuto: (tracks: Track[]) => number;
  remove: (queueId: string) => void;
  clear: () => void;
  setIndex: (i: number) => void;
  replace: (tracks: Track[], startIndex?: number) => void;
  current: () => QueueItem | null;
  upcomingAuto: () => number;
}

export const useQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      index: 0,
      enqueue: (track) => set((s) => ({ items: [...s.items, item(track, 'manual')] })),
      playNext: (track) =>
        set((s) => {
          const next = [...s.items];
          next.splice(s.index + 1, 0, item(track, 'manual'));
          return { items: next };
        }),
      appendAuto: (tracks) => {
        const have = new Set(get().items.map((i) => i.track.id));
        const fresh = tracks.filter((t) => !have.has(t.id));
        if (fresh.length === 0) return 0;
        set((s) => ({ items: [...s.items, ...fresh.map((t) => item(t, 'auto'))] }));
        return fresh.length;
      },
      remove: (queueId) => set((s) => ({ items: s.items.filter((i) => i.queueId !== queueId) })),
      clear: () => set({ items: [], index: 0 }),
      setIndex: (index) => set({ index: Math.max(0, index) }),
      replace: (tracks, startIndex = 0) =>
        set({
          items: tracks.map((track) => item(track, 'manual')),
          index: Math.min(Math.max(0, startIndex), Math.max(0, tracks.length - 1)),
        }),
      current: () => get().items[get().index] ?? null,
      upcomingAuto: () => get().items.slice(get().index + 1).filter(isAuto).length,
    }),
    { name: 'zabify-queue' },
  ),
);
