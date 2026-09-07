import { create } from 'zustand';

interface SleepState {
  /** Epoch ms when playback should pause, or null when off. */
  endsAt: number | null;
  /** When true, pause after the current track ends instead of at endsAt. */
  endOfTrack: boolean;
  startMinutes: (minutes: number) => void;
  startEndOfTrack: () => void;
  cancel: () => void;
}

export const SLEEP_PRESETS = [5, 10, 15, 30, 45, 60];

export const useSleep = create<SleepState>()((set) => ({
  endsAt: null,
  endOfTrack: false,
  startMinutes: (minutes) => set({ endsAt: Date.now() + minutes * 60_000, endOfTrack: false }),
  startEndOfTrack: () => set({ endsAt: null, endOfTrack: true }),
  cancel: () => set({ endsAt: null, endOfTrack: false }),
}));

export function sleepLabel(endsAt: number | null, endOfTrack: boolean): string {
  if (endOfTrack) return 'End of track';
  if (!endsAt) return 'Off';
  const ms = Math.max(0, endsAt - Date.now());
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (m <= 0) return `${s}s left`;
  return `${m}m ${String(s).padStart(2, '0')}s left`;
}
