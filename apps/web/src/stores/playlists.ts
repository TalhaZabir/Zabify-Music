import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@zabify/shared';

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistsState {
  playlists: UserPlaylist[];
  create: (name: string) => UserPlaylist;
  rename: (id: string, name: string) => void;
  setDescription: (id: string, description: string) => void;
  addTracks: (id: string, tracks: Track[]) => number;
  removeTrack: (id: string, trackId: string, index?: number) => void;
  moveTrack: (id: string, from: number, to: number) => void;
  remove: (id: string) => void;
  get: (id: string) => UserPlaylist | undefined;
}

function uid(): string {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(name: string): string {
  return name.trim().slice(0, 80);
}

export const usePlaylists = create<PlaylistsState>()(
  persist(
    (set, get) => ({
      playlists: [],
      create: (name) => {
        const pl: UserPlaylist = {
          id: uid(),
          name: cleanName(name) || 'Untitled playlist',
          tracks: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ playlists: [pl, ...s.playlists] }));
        return pl;
      },
      rename: (id, name) => {
        const n = cleanName(name);
        if (!n) return;
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: n, updatedAt: Date.now() } : p)),
        }));
      },
      setDescription: (id, description) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, description: description.slice(0, 300), updatedAt: Date.now() } : p,
          ),
        })),
      addTracks: (id, tracks) => {
        let added = 0;
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const have = new Set(p.tracks.map((t) => t.id));
            const fresh = tracks.filter((t) => {
              if (have.has(t.id)) return false;
              have.add(t.id);
              return true;
            });
            added = fresh.length;
            return fresh.length > 0 ? { ...p, tracks: [...p.tracks, ...fresh], updatedAt: Date.now() } : p;
          }),
        }));
        return added;
      },
      removeTrack: (id, trackId, index) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            const tracks =
              index !== undefined
                ? p.tracks.filter((_, i) => i !== index)
                : p.tracks.filter((t) => t.id !== trackId);
            return { ...p, tracks, updatedAt: Date.now() };
          }),
        })),
      moveTrack: (id, from, to) =>
        set((s) => ({
          playlists: s.playlists.map((p) => {
            if (p.id !== id) return p;
            if (from < 0 || from >= p.tracks.length || to < 0 || to >= p.tracks.length || from === to) return p;
            const tracks = [...p.tracks];
            const [t] = tracks.splice(from, 1);
            if (!t) return p;
            tracks.splice(to, 0, t);
            return { ...p, tracks, updatedAt: Date.now() };
          }),
        })),
      remove: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
      get: (id) => get().playlists.find((p) => p.id === id),
    }),
    { name: 'zabify-playlists' },
  ),
);
