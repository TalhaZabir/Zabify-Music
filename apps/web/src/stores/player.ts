import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepeatMode, Track } from '@zabify/shared';

interface PlayerState {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;
  setTrack: (t: Track | null) => void;
  setPlaying: (v: boolean) => void;
  toggle: () => void;
  setPosition: (ms: number) => void;
  setDuration: (ms: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRate: (v: number) => void;
  cycleRate: () => void;
}

const RATES = [1, 1.25, 1.5, 2, 0.75];

export const usePlayer = create<PlayerState>()(
  persist(
    (set) => ({
  track: null,
  // Always resume paused — browsers block autoplay without a gesture.
  playing: false,
  positionMs: 0,
  durationMs: 0,
  volume: 0.9,
  muted: false,
  shuffle: false,
  repeat: 'off',
  rate: 1,
  setTrack: (track) => set({ track, positionMs: 0, durationMs: 0 }),
  setPlaying: (playing) => set({ playing }),
  toggle: () => set((s) => ({ playing: !s.playing })),
  setPosition: (positionMs) => set({ positionMs }),
  setDuration: (durationMs) => set({ durationMs }),
  setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  cycleRepeat: () =>
    set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
  setRate: (rate) => set({ rate: Math.min(2, Math.max(0.5, rate)) }),
  cycleRate: () =>
    set((s) => {
      const i = RATES.indexOf(s.rate);
      return { rate: RATES[(i + 1) % RATES.length] ?? 1 };
    }),
    }),
    {
      name: 'zabify-player',
      // Only the current track survives reloads. Playback always resumes
      // paused (autoplay policy) with position reset; queue persists separately.
      partialize: (s) => ({ track: s.track }),
    },
  ),
);
