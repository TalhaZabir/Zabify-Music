import { create } from 'zustand';
import type { Track } from '@zabify/shared';

interface UiState {
  paletteOpen: boolean;
  fullPlayerOpen: boolean;
  queueOpen: boolean;
  addToPlaylistTrack: Track | null;
  setPalette: (v: boolean) => void;
  setFullPlayer: (v: boolean) => void;
  setQueue: (v: boolean) => void;
  setAddToPlaylistTrack: (t: Track | null) => void;
}

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  fullPlayerOpen: false,
  queueOpen: false,
  addToPlaylistTrack: null,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setFullPlayer: (fullPlayerOpen) => set({ fullPlayerOpen }),
  setQueue: (queueOpen) => set({ queueOpen }),
  setAddToPlaylistTrack: (addToPlaylistTrack) => set({ addToPlaylistTrack }),
}));
