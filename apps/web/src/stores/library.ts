import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@zabify/shared';

export type SaveKind = 'album' | 'artist' | 'playlist';

interface LibraryState {
  likedTrackIds: string[];
  likedTracks: Record<string, Track>;
  savedAlbums: string[];
  savedArtists: string[];
  savedPlaylists: string[];
  /** Display names for saved ids (populated when saving from detail pages). */
  savedMeta: Record<string, { name: string }>;
  toggleLike: (id: string, track?: Track) => void;
  isLiked: (id: string) => boolean;
  toggleSave: (kind: SaveKind, id: string, name?: string) => void;
  isSaved: (kind: SaveKind, id: string) => boolean;
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      likedTrackIds: [],
      likedTracks: {},
      savedAlbums: [],
      savedArtists: [],
      savedPlaylists: [],
      savedMeta: {},
      toggleLike: (id, track) =>
        set((s) => {
          if (s.likedTrackIds.includes(id)) {
            const next = { ...s.likedTracks };
            delete next[id];
            return { likedTrackIds: s.likedTrackIds.filter((x) => x !== id), likedTracks: next };
          }
          return {
            likedTrackIds: [...s.likedTrackIds, id],
            likedTracks: track ? { ...s.likedTracks, [id]: track } : s.likedTracks,
          };
        }),
      isLiked: (id) => get().likedTrackIds.includes(id),
      toggleSave: (kind, id, name) =>
        set((s) => {
          const list = kind === 'album' ? s.savedAlbums : kind === 'artist' ? s.savedArtists : s.savedPlaylists;
          const removing = list.includes(id);
          const meta = { ...s.savedMeta };
          if (removing) delete meta[id];
          else if (name) meta[id] = { name };
          const patch =
            kind === 'album'
              ? { savedAlbums: toggleId(list, id) }
              : kind === 'artist'
                ? { savedArtists: toggleId(list, id) }
                : { savedPlaylists: toggleId(list, id) };
          return { ...patch, savedMeta: meta };
        }),
      isSaved: (kind, id) => {
        const s = get();
        return kind === 'album' ? s.savedAlbums.includes(id) : kind === 'artist' ? s.savedArtists.includes(id) : s.savedPlaylists.includes(id);
      },
    }),
    { name: 'zabify-library' },
  ),
);
