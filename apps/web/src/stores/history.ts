import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@zabify/shared';

export interface HistoryEntry {
  track: Track;
  playedAt: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  /** Record a play. Dedupes consecutive repeats of the same track. */
  push: (track: Track) => void;
  clear: () => void;
}

const MAX = 200;

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      push: (track) =>
        set((s) => {
          if (s.entries[0]?.track.id === track.id) return s;
          return { entries: [{ track, playedAt: Date.now() }, ...s.entries].slice(0, MAX) };
        }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'zabify-history' },
  ),
);
