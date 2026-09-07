// Zabify shared domain models — single source of truth for web + api.
// Keep this package dependency-free and browser-safe.

export type ID = string;

export interface Artwork {
  url: string;
  width?: number;
  height?: number;
}

export interface TrackArtistRef {
  id: string;
  name: string;
}

export interface Track {
  id: ID;
  title: string;
  artists: TrackArtistRef[];
  album?: { id: string; title: string; artwork?: Artwork[] };
  durationSec?: number;
  artwork?: Artwork[];
  videoId?: string;
  explicit?: boolean;
}

export interface Artist {
  id: ID;
  name: string;
  artwork?: Artwork[];
  followers?: number;
  description?: string;
  topTracks?: Track[];
  albums?: Album[];
  related?: Artist[];
}

export interface Album {
  id: ID;
  title: string;
  artist: TrackArtistRef;
  artists?: TrackArtistRef[];
  year?: number;
  trackCount?: number;
  durationSec?: number;
  artwork?: Artwork[];
  tracks?: Track[];
}

export interface Playlist {
  id: ID;
  title: string;
  description?: string;
  artwork?: Artwork[];
  trackCount?: number;
  tracks?: Track[];
  author?: string;
}

export interface VideoItem {
  id: ID;
  title: string;
  artists: TrackArtistRef[];
  durationSec?: number;
  artwork?: Artwork[];
}

export interface SearchFilters {
  type?: 'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'videos';
  limit?: number;
}

export interface SearchResult {
  query: string;
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
  videos: VideoItem[];
}

export interface LyricLine {
  startMs: number;
  endMs?: number;
  text: string;
}

export interface Lyrics {
  trackId: string;
  plain?: string;
  lines?: LyricLine[];
  synced: boolean;
  source?: string;
}

export type StreamQuality = 'low' | 'medium' | 'high' | 'auto';

export interface StreamOptions {
  quality?: StreamQuality;
}

export interface StreamInfo {
  trackId: string;
  url: string;
  mimeType?: string;
  bitrate?: number;
  /** Epoch ms when the URL expires. Never persist beyond this. */
  expiresAt?: number;
  /** Which resolver produced the URL (e.g. "innertube", "ytdlp-default"). Debug aid. */
  via?: string;
}

export interface HomeSection<T = Track | Album | Playlist | Artist> {
  id: string;
  title: string;
  subtitle?: string;
  items: T[];
}

export interface HomeFeed {
  continueListening: Track[];
  quickPicks: Track[];
  newReleases: Album[];
  charts: Track[];
  playlists: Playlist[];
  moods: { id: string; title: string; artwork?: Artwork[] }[];
}

export interface QueueItem {
  queueId: string;
  track: Track;
  addedAt: number;
  /** manual = user-added, auto = autoplay suggestion. Absent = manual (legacy). */
  origin?: 'manual' | 'auto';
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackState {
  track: Track | null;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;
}

export interface LibraryItem {
  id: string;
  kind: 'track' | 'album' | 'artist' | 'playlist';
  addedAt: number;
}

export type BackgroundMode = 'pure-black' | 'near-black' | 'dark-gray' | 'glass';

export interface UserSettings {
  accent: string;
  background: BackgroundMode;
  animations: boolean;
  compactMode: boolean;
  volume: number;
  quality: StreamQuality;
  crossfadeSec: number;
  gapless: boolean;
  normalization: boolean;
  visualizer: boolean;
  apiBaseUrl: string;
  fallbackApiBaseUrl?: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// Source-agnostic provider contract. Frontend MUST NOT import
// provider implementations — only this interface + DTOs above.
export interface MusicProvider {
  search(query: string, filters?: SearchFilters): Promise<SearchResult>;
  getArtist(id: string): Promise<Artist>;
  getAlbum(id: string): Promise<Album>;
  getPlaylist(id: string): Promise<Playlist>;
  getTrack(id: string): Promise<Track>;
  getRecommendations(seed?: string): Promise<Track[]>;
  getHomeFeed(): Promise<HomeFeed>;
  getLyrics(trackId: string): Promise<Lyrics | null>;
  getStream(trackId: string, options?: StreamOptions): Promise<StreamInfo>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  accent: '#2dd4bf',
  background: 'near-black',
  animations: true,
  compactMode: false,
  volume: 0.9,
  quality: 'auto',
  crossfadeSec: 0,
  gapless: true,
  normalization: false,
  visualizer: true,
  apiBaseUrl: '/api',
};

export function apiError(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}
