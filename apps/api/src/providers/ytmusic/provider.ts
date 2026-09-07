import { Innertube } from 'youtubei.js';
import type {
  Album,
  Artist,
  HomeFeed,
  Lyrics,
  MusicProvider,
  Playlist,
  SearchFilters,
  SearchResult,
  StreamInfo,
  StreamOptions,
  Track,
  VideoItem,
} from '@zabify/shared';
import {
  LrclibProvider,
  LyricsChain,
  YouTubeLyricsAdapter,
} from './lyrics.js';
import {
  artistsOf,
  endpointId,
  normalizeAlbumRow,
  normalizeArtistRow,
  normalizeCardShelf,
  normalizePlaylistRow,
  normalizeSongItem,
  normalizeVideoItem,
  str,
  thumbs,
  txt,
} from './normalize.js';
import { resolveWithYtDlp, ytDlpEnabled } from './ytdlp.js';

type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec => ((typeof v === 'object' && v !== null ? v : {}) as Rec);

// Server-only YouTube Music provider (Innertube). Frontend must never
// import this file — it talks to the backend REST API instead.
export class YouTubeMusicProvider implements MusicProvider {
  private yt: Innertube | null = null;
  private initPromise: Promise<Innertube> | null = null;

  private async client(): Promise<Innertube> {
    if (this.yt) return this.yt;
    if (!this.initPromise) {
      const sessionOpts: Record<string, string | undefined> = {
        lang: process.env.YTMUSIC_LANG ?? 'en',
        location: process.env.YTMUSIC_COUNTRY ?? 'US',
      };
      // Optional hardening for datacenter IPs. All are best-effort: when
      // unset, youtubei.js generates a fresh anonymous session as before.
      // YT_PO_TOKEN: session-bound proof-of-origin token (bypasses SABR).
      // YT_VISITOR_DATA: persistent visitor id for tailored content.
      // YT_COOKIE: full "SAPISID=...; ..." login cookie (highest reliability).
      // YT_USER_AGENT: override the InnerTube UA (must match PO token issuer).
      const poToken = (process.env.YT_PO_TOKEN ?? '').trim();
      const visitorData = (process.env.YT_VISITOR_DATA ?? '').trim();
      const cookie = (process.env.YT_COOKIE ?? '').trim();
      const userAgent = (process.env.YT_USER_AGENT ?? '').trim();
      if (poToken) sessionOpts['po_token'] = poToken;
      if (visitorData) sessionOpts['visitor_data'] = visitorData;
      if (cookie) sessionOpts['cookie'] = cookie;
      if (userAgent) sessionOpts['user_agent'] = userAgent;
      this.initPromise = Innertube.create(sessionOpts).then((c) => (this.yt = c));
    }
    return this.initPromise;
  }

  async search(query: string, filters?: SearchFilters): Promise<SearchResult> {
    const yt = await this.client();
    const q = query.trim().slice(0, 200);
    const empty: SearchResult = { query: q, tracks: [], artists: [], albums: [], playlists: [], videos: [] };
    if (!q) return empty;
    const limit = Math.min(Math.max(filters?.limit ?? 25, 1), 50);
    let res;
    try {
      res = await withTimeout(30000, () => yt.music.search(q));
    } catch {
      throw new Error('SEARCH_FAILED');
    }
    // Unfiltered search returns flat ItemSections with mixed item_types.
    const shelves = ((res as unknown as { contents?: unknown[] }).contents ?? []) as Rec[];
    const tracks: Track[] = [];
    const videos: VideoItem[] = [];
    const artists: Artist[] = [];
    const albums: Album[] = [];
    const playlists: Playlist[] = [];
    const seen = { track: new Set<string>(), artist: new Set<string>(), album: new Set<string>(), playlist: new Set<string>(), video: new Set<string>() };
    const boost = filters?.type ?? 'all';
    const cap = (base: number, kind: string): number => (boost === kind ? limit : base);

    for (const shelf of shelves) {
      const s = asRec(shelf);
      if (s['type'] === 'MusicCardShelf') {
        const card = normalizeCardShelf(shelf);
        if (card && !seen.artist.has(card.id) && artists.length < cap(10, 'artists')) {
          seen.artist.add(card.id);
          artists.unshift(card);
        }
        continue;
      }
      const items = (s['contents'] ?? []) as unknown[];
      for (const item of items) {
        const kind = asRec(item)['item_type'];
        if (kind === 'song' || kind === 'non_music_track') {
          if (tracks.length >= cap(limit, 'songs')) continue;
          const t = normalizeSongItem(item);
          if (t && !seen.track.has(t.id)) {
            seen.track.add(t.id);
            tracks.push(t);
          }
        } else if (kind === 'video') {
          if (videos.length >= cap(10, 'videos')) continue;
          const v = normalizeVideoItem(item);
          if (v && !seen.video.has(v.id)) {
            seen.video.add(v.id);
            videos.push(v);
          }
        } else if (kind === 'artist' || kind === 'library_artist') {
          if (artists.length >= cap(10, 'artists')) continue;
          const ar = normalizeArtistRow(item);
          if (ar && !seen.artist.has(ar.id)) {
            seen.artist.add(ar.id);
            artists.push(ar);
          }
        } else if (kind === 'album') {
          if (albums.length >= cap(10, 'albums')) continue;
          const al = normalizeAlbumRow(item);
          if (al && !seen.album.has(al.id)) {
            seen.album.add(al.id);
            albums.push(al);
          }
        } else if (kind === 'playlist') {
          if (playlists.length >= cap(10, 'playlists')) continue;
          const pl = normalizePlaylistRow(item);
          if (pl && !seen.playlist.has(pl.id)) {
            seen.playlist.add(pl.id);
            playlists.push(pl);
          }
        }
        // podcast_show / endpoint / unknown intentionally skipped
      }
    }
    return { query: q, tracks, artists, albums, playlists, videos };
  }

  async getTrack(id: string): Promise<Track> {
    assertId(id);
    const yt = await this.client();
    try {
      const info = await withTimeout(20000, () => yt.music.getInfo(id));
      const md = asRec(info.basic_info);
      const title = txt(md['title']) || 'Unknown title';
      const arts = thumbs(md['thumbnail'] ?? md['thumbnails']);
      return {
        id,
        title,
        artists: artistsOf(md),
        durationSec: toNum(md['duration']),
        artwork: arts.length > 0 ? arts : undefined,
        videoId: id,
      };
    } catch {
      throw new Error('TRACK_UNAVAILABLE');
    }
  }

  async getArtist(id: string): Promise<Artist> {
    assertId(id);
    const yt = await this.client();
    let a;
    try {
      a = await yt.music.getArtist(id);
    } catch {
      throw new Error('NOT_FOUND');
    }
    const header = asRec(a.header);
    const name = txt(header['title']) || txt(header['name']) || 'Unknown artist';
    const artwork = thumbs(header['thumbnail'] ?? header['thumbnails']);
    const description = txt(header['description']);
    const topTracks: Track[] = [];
    const albums: Album[] = [];
    const related: Artist[] = [];
    for (const section of ((a as unknown as { sections?: unknown[] }).sections ?? []) as Rec[]) {
      const title = txt(asRec(asRec(section)['header'])['title']).toLowerCase();
      const contents = (asRec(section)['contents'] ?? []) as unknown[];
      const firstType = str(asRec(contents[0])['item_type']);
      const isSongShelf = firstType === 'song' || firstType === 'video' || firstType === 'non_music_track';
      if (topTracks.length === 0 && (isSongShelf || /top songs|top tracks/.test(title))) {
        for (const item of contents.slice(0, 10)) {
          const t = normalizeSongItem(item);
          if (t) topTracks.push(t);
        }
      } else if (/album|single|\bep\b|eps|releases/.test(title)) {
        for (const item of contents.slice(0, 12)) {
          const al = normalizeAlbumRow(item);
          if (al) albums.push(al);
        }
      } else if (/related|fans|similar|also like|for you/.test(title)) {
        for (const item of contents.slice(0, 10)) {
          const ar = normalizeArtistRow(item);
          if (ar) related.push(ar);
        }
      }
    }
    // getAllSongs fallback when sections lack a top-songs shelf.
    if (topTracks.length === 0) {
      try {
        const all = await (a as unknown as { getAllSongs?: () => Promise<{ contents?: unknown[] }> }).getAllSongs?.();
        for (const item of (all?.contents ?? []).slice(0, 10)) {
          const t = normalizeSongItem(item);
          if (t) topTracks.push(t);
        }
      } catch {
        // best-effort
      }
    }
    return {
      id, name,
      artwork: artwork.length > 0 ? artwork : undefined,
      description: description || undefined,
      topTracks: topTracks.length > 0 ? topTracks : undefined,
      albums: albums.length > 0 ? albums : undefined,
      related: related.length > 0 ? related : undefined,
    };
  }

  async getAlbum(id: string): Promise<Album> {
    assertId(id);
    const yt = await this.client();
    let a;
    try {
      a = await yt.music.getAlbum(id);
    } catch {
      throw new Error('NOT_FOUND');
    }
    const header = asRec(a.header);
    const title = txt(header['title']) || 'Unknown album';
    // MusicDetailHeader exposes author; MusicResponsiveHeader puts the
    // artist in strapline_text_one (Text + browse endpoint).
    const author = asRec(header['author']);
    const strapline = asRec(header['strapline_text_one']);
    const artistName = txt(author['name']) || txt(strapline) || txt(header['subtitle']) || 'Unknown';
    const artistIds = endpointId(author['endpoint'] ?? (strapline as Rec)['endpoint']);
    const year = parseYear(txt(header['subtitle']) + ' ' + txt(header['second_subtitle']));
    const artwork = thumbs(header['thumbnails']);
    const tracks: Track[] = [];
    for (const item of ((a as unknown as { contents?: unknown[] }).contents ?? [])) {
      const t = normalizeSongItem(item);
      if (t) tracks.push({ ...t, album: { id, title } });
    }
    return {
      id, title,
      artist: { id: artistIds.browseId ?? '', name: artistName },
      year,
      trackCount: tracks.length || undefined,
      durationSec: tracks.reduce((acc, t) => acc + (t.durationSec ?? 0), 0) || undefined,
      artwork: artwork.length > 0 ? artwork : undefined,
      tracks,
    };
  }

  async getPlaylist(id: string): Promise<Playlist> {
    assertId(id);
    const yt = await this.client();
    let p;
    try {
      p = await yt.music.getPlaylist(id);
    } catch {
      // VL* browse ids sometimes fail where the raw playlist id works.
      if (id.startsWith('VL')) {
        try {
          p = await yt.music.getPlaylist(id.slice(2));
        } catch {
          throw new Error('NOT_FOUND');
        }
      } else {
        throw new Error('NOT_FOUND');
      }
    }
    const header = asRec(p.header);
    const title = txt(header['title']) || txt(header['subtitle']) || 'Playlist';
    const description = txt(header['description']) || txt(header['subtitle']);
    const artwork = thumbs(header['thumbnails']);
    const tracks: Track[] = [];
    for (const item of ((p as unknown as { items?: unknown[]; contents?: unknown[] }).items ?? (p as unknown as { contents?: unknown[] }).contents ?? [])) {
      const t = normalizeSongItem(item);
      if (t) tracks.push(t);
    }
    return {
      id, title,
      description: description || undefined,
      artwork: artwork.length > 0 ? artwork : undefined,
      trackCount: tracks.length || undefined,
      tracks,
      author: txt(header['subtitle']),
    };
  }

  async getRecommendations(seed?: string): Promise<Track[]> {
    if (!seed) return [];
    assertId(seed);
    const yt = await this.client();
    try {
      const panel = await yt.music.getUpNext(seed);
      const out: Track[] = [];
      for (const item of ((panel as unknown as { contents?: unknown[] }).contents ?? []).slice(0, 25)) {
        const t = normalizeSongItem(asRec(item)['playlist_item'] ?? asRec(item)['playlist_panel_item'] ?? item);
        if (t && t.id !== seed) out.push(t);
      }
      return out;
    } catch {
      return [];
    }
  }

  async getHomeFeed(): Promise<HomeFeed> {
    const yt = await this.client();
    let home;
    try {
      home = await yt.music.getHomeFeed();
    } catch {
      throw new Error('HOME_FAILED');
    }
    const quickPicks: Track[] = [];
    const charts: Track[] = [];
    const newReleases: Album[] = [];
    const playlists: Playlist[] = [];
    const sections = ((home as unknown as { sections?: Rec[] }).sections ?? []) as Rec[];
    for (const section of sections) {
      const title = txt(asRec(section['header'])['title']);
      const low = title.toLowerCase();
      const contents = (section['contents'] ?? []) as unknown[];
      const songs: Track[] = [];
      const albums: Album[] = [];
      for (const item of contents) {
        const t = normalizeSongItem(item);
        if (t) {
          songs.push(t);
          continue;
        }
        const al = normalizeAlbumRow(item);
        if (al) {
          albums.push(al);
          continue;
        }
        const pl = normalizePlaylistRow(item);
        if (pl && playlists.length < 12) playlists.push(pl);
      }
      // First song shelf feeds Quick picks; later chart-titled shelves feed Charts.
      if (songs.length >= 3 && quickPicks.length === 0 && !/chart|trend|top|hits|today/.test(low)) {
        quickPicks.push(...songs.slice(0, 15));
      } else if (songs.length >= 3 && charts.length === 0 && /chart|trend|top|hits|today|quick|for you|recent/.test(low)) {
        charts.push(...songs.slice(0, 15));
      } else if (newReleases.length === 0 && albums.length >= 2 && /new|release|album/.test(low)) {
        newReleases.push(...albums.slice(0, 12));
      } else {
        if (quickPicks.length === 0 && songs.length >= 5) quickPicks.push(...songs.slice(0, 15));
        else if (newReleases.length === 0 && albums.length >= 2) newReleases.push(...albums.slice(0, 12));
      }
    }
    return {
      continueListening: [],
      quickPicks,
      newReleases,
      charts,
      playlists,
      moods: STATIC_MOODS,
    };
  }

  async getLyrics(trackId: string): Promise<Lyrics | null> {
    assertId(trackId);
    // Aggregate: community providers (often synced) first, YouTube Music
    // plain lyrics as fallback. Needs track metadata for text search.
    let track: Track;
    try {
      track = await this.getTrack(trackId);
    } catch {
      return { trackId, synced: false };
    }
    const chain = new LyricsChain([new LrclibProvider(), new YouTubeLyricsAdapter((id) => this.getYouTubeLyrics(id))]);
    try {
      return (await chain.resolve(track)) ?? { trackId, synced: false };
    } catch {
      return { trackId, synced: false };
    }
  }

  /** Raw YouTube Music lyrics (used as one provider in the chain). */
  async getYouTubeLyrics(trackId: string): Promise<Lyrics | null> {
    const yt = await this.client();
    try {
      const shelf = await withTimeout(15000, () => yt.music.getLyrics(trackId));
      if (!shelf) return null;
      const text = txt(asRec(shelf)['description']) || txt(asRec(shelf)['title']);
      if (!text.trim()) return null;
      return { trackId, plain: text, synced: false, source: 'YouTube Music' };
    } catch {
      return null;
    }
  }

  async getStream(trackId: string, options?: StreamOptions): Promise<StreamInfo> {
    assertId(trackId);
    if (!/^[A-Za-z0-9_-]{5,32}$/u.test(trackId)) throw new Error('TRACK_UNAVAILABLE');
    // Fast path: Innertube decipher (no subprocess).
    let innertubeErr: unknown = null;
    try {
      const fast = await this.getStreamViaInnertube(trackId, options);
      if (fast) return fast;
      innertubeErr = new Error('INNERTUBE_NO_URL');
    } catch (e) {
      innertubeErr = e;
      // fall through to yt-dlp
    }
    if (ytDlpEnabled()) {
      try {
        const { url, expiresAt } = await resolveWithYtDlp(trackId, options);
        return { trackId, url, mimeType: 'audio/mp4', expiresAt };
      } catch (e) {
        // Preserve both stages for route-level logging. The public error
        // stays generic (TRACK_UNAVAILABLE) to avoid leaking internals.
        const detail = [toStage(innertubeErr), toStage(e)].filter(Boolean).join(' | ');
        throw new Error(detail ? `TRACK_UNAVAILABLE (${detail})` : 'TRACK_UNAVAILABLE');
      }
    }
    throw new Error(`TRACK_UNAVAILABLE (${toStage(innertubeErr) || 'yt-dlp disabled'})`);
  }

  private async getStreamViaInnertube(trackId: string, options?: StreamOptions): Promise<StreamInfo | null> {
    const yt = await this.client();
    const poToken = (process.env.YT_PO_TOKEN ?? '').trim() || undefined;
    // Try the default client first, then explicit fallbacks. ANDROID-class
    // clients historically return non-SABR URLs that decipher without a
    // PO token; WEB needs one. Order matters for quality + reliability.
    const clients = [undefined, 'ANDROID', 'YTMUSIC_ANDROID', 'WEB'] as const;
    let lastErr: unknown = null;
    for (const client of clients) {
      let info;
      try {
         
        info = await withTimeout(20000, () =>
          yt.getBasicInfo(trackId, { ...(client ? { client } : {}), ...(poToken ? { po_token: poToken } : {}) }),
        );
      } catch (e) {
        lastErr = e;
        continue;
      }
      const quality = options?.quality ?? 'auto';
      let fmt;
      try {
        // youtubei.js v18+: quality is 'best' | 'bestefficiency' | itag label.
        // Audio itags: 139 ≈ 48k, 140 ≈ 128k m4a, 251 ≈ opus high.
        fmt =
          quality === 'low'
            ? info.chooseFormat({ type: 'audio', itag: 139 })
            : quality === 'medium'
              ? info.chooseFormat({ type: 'audio', itag: 140 })
              : info.chooseFormat({ type: 'audio', quality: 'best' });
      } catch (e) {
        try {
          fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
        } catch (e2) {
          lastErr = e2 ?? e;
          continue;
        }
      }
      try {
         
        const url: string = await withTimeout(15000, () => fmt.decipher(yt.session.player));
        if (!url) {
          lastErr = new Error('INNERTUBE_EMPTY_URL');
          continue;
        }
        // Never cache beyond expiry — caller must treat as short-lived.
        return { trackId, url, mimeType: fmt.mime_type, bitrate: fmt.bitrate, expiresAt: Date.now() + 5 * 60_000 };
      } catch (e) {
        lastErr = e;
        continue;
      }
    }
    if (lastErr) throw lastErr;
    return null;
  }
}

const STATIC_MOODS = [
  { id: 'focus', title: 'Focus' },
  { id: 'chill', title: 'Chill' },
  { id: 'workout', title: 'Workout' },
  { id: 'sleep', title: 'Sleep' },
  { id: 'party', title: 'Party' },
  { id: 'pop', title: 'Pop' },
  { id: 'rock', title: 'Rock' },
  { id: 'hip-hop', title: 'Hip-Hop' },
  { id: 'electronic', title: 'Electronic' },
];

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Innertube calls can hang indefinitely under throttling — bound them. */
async function withTimeout<T>(ms: number, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('UPSTREAM_TIMEOUT')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseYear(s: string): number | undefined {
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : undefined;
}

function assertId(id: string): void {
  if (!id || /[<>"]/u.test(id) || id.length > 128) throw new Error('INVALID_ID');
}

/** Collapse stage errors to a short, log-safe token (no URLs/cookies). */
function toStage(e: unknown): string {
  if (!e) return '';
  const msg = e instanceof Error ? e.message : String(e);
  const head = msg.split('\n')[0]?.slice(0, 160) ?? '';
  if (/UPSTREAM_TIMEOUT/.test(head)) return 'innertube-timeout';
  if (/No valid URL to decipher|INNERTUBE_NO_URL|INNERTUBE_EMPTY_URL/.test(head)) return 'innertube-no-url';
  if (/YTDLP_FAILED/.test(head)) {
    if (/bot/i.test(head)) return 'ytdlp-bot-challenge';
    if (/timed out|ETIMEDOUT|timeout/i.test(head)) return 'ytdlp-timeout';
    if (/No module named|not found|ENOENT/i.test(head)) return 'ytdlp-missing';
    return 'ytdlp-failed';
  }
  if (/YTDLP_NO_URL/.test(head)) return 'ytdlp-no-url';
  if (/400/.test(head)) return 'innertube-400';
  if (/403/.test(head)) return 'upstream-403';
  if (/429/.test(head)) return 'rate-limited';
  return head.replace(/[^A-Za-z0-9-_:. ]/g, '').slice(0, 80) || 'failed';
}

