import type {
  Album,
  Artist,
  HomeFeed,
  Lyrics,
  Playlist,
  SearchResult,
  StreamInfo,
  StreamQuality,
  Track,
} from '@zabify/shared';
import { apiFetch, throwForResponse } from './apiClient';

async function req<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) await throwForResponse(res);
  return (await res.json()) as T;
}

export const api = {
  health: () => req<{ ok: boolean }>('/health'),
  search: (q: string) => req<SearchResult>(`/search?q=${encodeURIComponent(q)}&limit=25`),
  track: (id: string) => req<Track>(`/tracks/${encodeURIComponent(id)}`),
  stream: (id: string, quality: StreamQuality = 'auto') =>
    req<StreamInfo>(`/tracks/${encodeURIComponent(id)}/stream?quality=${quality}`),
  related: (id: string) => req<Track[]>(`/tracks/${encodeURIComponent(id)}/related`),
  lyrics: (id: string) => req<Lyrics>(`/tracks/${encodeURIComponent(id)}/lyrics`),
  artist: (id: string) => req<Artist>(`/artists/${encodeURIComponent(id)}`),
  album: (id: string) => req<Album>(`/albums/${encodeURIComponent(id)}`),
  playlist: (id: string) => req<Playlist>(`/playlists/${encodeURIComponent(id)}`),
  home: () => req<HomeFeed>('/home'),
};

export { getActiveBase, testBase } from './apiClient';
