// Defensive normalizers for youtubei.js nodes.
//
// Unfiltered YouTube Music search returns flat `ItemSection` lists whose
// `MusicResponsiveListItem` entries keep their real data in
// `flex_columns[0].title` (item title + endpoint) and `flex_columns[1].title`
// (runs like "Song • Adele" where artist runs carry browse endpoints).
// Top-level `title` on those items is NOT a Text object — ignore it.
// Carousel (`MusicTwoRowItem`) nodes DO expose real `title`/`endpoint`.
//
// Everything here probes fields defensively so Innertube shape drift
// degrades to fewer results instead of 500s.

import type { Album, Artist, Artwork, Playlist, Track, VideoItem } from '@zabify/shared';
import { isVideoId } from '@zabify/shared';

type Rec = Record<string, unknown>;

function asRec(v: unknown): Rec {
  return (typeof v === 'object' && v !== null ? v : {}) as Rec;
}

export function txt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v !== 'object' || v === null) return '';
  const r = v as Rec;
  if (typeof r['text'] === 'string') return r['text'] as string;
  const runs = r['runs'];
  if (Array.isArray(runs)) {
    return runs
      .map((x) => {
        const o = asRec(x);
        return typeof o['text'] === 'string' ? (o['text'] as string) : '';
      })
      .join('');
  }
  return '';
}

function runList(v: unknown): Rec[] {
  const r = asRec(v);
  return Array.isArray(r['runs']) ? (r['runs'] as unknown[]).map(asRec) : [];
}

export function thumbs(v: unknown): Artwork[] {
  const pick = (o: Rec): Artwork | null => {
    const url = typeof o['url'] === 'string' ? (o['url'] as string) : '';
    if (!url) return null;
    const w = Number(o['width']);
    const h = Number(o['height']);
    return {
      url: url.startsWith('http') ? url : `https:${url}`,
      width: Number.isFinite(w) ? w : undefined,
      height: Number.isFinite(h) ? h : undefined,
    };
  };
  if (Array.isArray(v)) {
    const out: Artwork[] = [];
    for (const x of v) {
      const a = pick(asRec(x));
      if (a) out.push(a);
    }
    return out.slice(0, 4);
  }
  const r = asRec(v);
  for (const key of ['thumbnails', 'contents']) {
    const inner = r[key];
    if (Array.isArray(inner)) {
      const flat: unknown[] = [];
      for (const x of inner) {
        const o = asRec(x);
        if (Array.isArray(o['thumbnails'])) flat.push(...(o['thumbnails'] as unknown[]));
        else flat.push(x);
      }
      const arts = thumbs(flat);
      if (arts.length > 0) return arts;
    }
  }
  return [];
}

export function endpointId(endpoint: unknown): { videoId?: string; browseId?: string; playlistId?: string } {
  const e = asRec(endpoint);
  const p = asRec(e['payload']);
  const g = (o: Rec, ...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === 'string' && v) return v;
    }
    return undefined;
  };
  const videoId = g(p, 'videoId', 'video_id') ?? g(e, 'videoId', 'video_id');
  const browseId = g(p, 'browseId', 'browse_id') ?? g(e, 'browseId', 'browse_id');
  let playlistId = g(p, 'playlistId', 'playlist_id') ?? g(e, 'playlistId', 'playlist_id');
  if (!playlistId && browseId && browseId.startsWith('VL')) playlistId = browseId.slice(2);
  return { videoId, browseId, playlistId };
}

/** flex_columns titles — the real payload carrier for list items. */
function flexes(node: Rec): Rec[] {
  const cols = node['flex_columns'];
  if (!Array.isArray(cols)) return [];
  return cols.map((c) => asRec(asRec(c)['title']));
}

function directId(node: Rec): string {
  for (const k of ['id', 'videoId', 'video_id', 'browseId', 'browse_id', 'playlistId', 'playlist_id']) {
    const v = node[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

/** Artist refs from a "Song • Adele • ..." runs structure. */
function artistsFromRuns(titleLike: unknown, fullText: string): { id: string; name: string }[] {
  const runs = runList(titleLike);
  const out: { id: string; name: string }[] = [];
  for (const r of runs) {
    const name = typeof r['text'] === 'string' ? (r['text'] as string).trim() : '';
    if (!name || name === '•' || name === '·' || name === ',' || name === ' & ') continue;
    const ep = endpointId(r['endpoint']);
    if (ep.browseId) {
      out.push({ id: ep.browseId, name });
      continue;
    }
    // Runs without endpoints: keep if they look like names (decided below).
    out.push({ id: '', name });
  }
  const filtered = out.filter((a) => isProbablyArtist(a.name));
  if (filtered.length > 0) return dedupeArtists(filtered);
  // Fallback: split "Song • Adele • 2015" style text.
  const parts = fullText
    .split(/[•·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(1) // drop leading type label
    .filter(isProbablyArtist);
  if (parts.length > 0) return dedupeArtists(parts.map((name) => ({ id: '', name })));
  return [{ id: '', name: 'Unknown' }];
}

function isProbablyArtist(seg: string): boolean {
  if (!seg || seg === '•' || seg === '·') return false;
  const low = seg.toLowerCase();
  if (/^(song|video|album|single|ep|eps|playlist|artist|podcast|episode|show|profile)s?$/.test(low)) return false;
  if (/^\d{4}$/.test(seg)) return false; // year
  if (/\d:\d\d/.test(seg)) return false; // duration
  if (/subscriber|listener|monthly|views?|plays?|followers?|songs?|videos?|tracks?/.test(low)) return false;
  if (/^\d[\d,.\sKMB]*$/.test(seg)) return false; // bare counts
  return true;
}

function dedupeArtists(list: { id: string; name: string }[]): { id: string; name: string }[] {
  const seen = new Set<string>();
  return list.filter((a) => {
    const k = a.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function durationSecOf(node: Rec): number | undefined {
  const d = node['duration'];
  if (typeof d === 'object' && d !== null) {
    const secs = Number((d as Rec)['seconds']);
    if (Number.isFinite(secs) && secs > 0) return Math.floor(secs);
  }
  const t = typeof d === 'string' ? d : txt(d);
  const m = t.match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
  if (m) {
    const parts = m.slice(1).filter((x) => x !== undefined).map(Number);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  return undefined;
}

/** Song/video list item → Track. Handles flex_columns rows AND carousel items. */
export function normalizeSongItem(raw: unknown): Track | null {
  const node = asRec(raw);
  // Never fabricate tracks from album/artist/playlist/podcast rows
  // (home carousels mix them together).
  const itemType = str(node['item_type']);
  if (itemType && itemType !== 'song' && itemType !== 'video' && itemType !== 'non_music_track' && itemType !== 'endpoint') {
    return null;
  }
  const flex = flexes(node);
  const title = txt(flex[0]) || txt(node['title']);
  if (!title) return null;
  const ep0 = flex.length > 0 ? endpointId((flex[0] as Rec)['endpoint']) : endpointId(node['endpoint']);
  const did = directId(node);
  // Only real video IDs are playable. Never fall back to playlist / browse /
  // radio IDs (RDCLAK…/VL…/UC…/MPRE…): Up-Next and search `endpoint` rows can
  // carry those, and queueing one poisons playback with a guaranteed 404
  // (see audio resolve). When in doubt, drop the row instead of guessing.
  const id = ep0.videoId && isVideoId(ep0.videoId) ? ep0.videoId : isVideoId(did) ? did : '';
  if (!id) return null;
  const sub = flex[1] ?? asRec(node['subtitle']);
  const artists = artistsFromRuns(sub, txt(sub));
  const albumName = albumFromRuns(sub);
  return {
    id,
    title,
    artists,
    album: albumName ? { id: '', title: albumName } : undefined,
    durationSec: durationSecOf(node),
    artwork: thumbs(node['thumbnail'] ?? node['thumbnails']),
    videoId: id,
  };
}

function albumFromRuns(sub: unknown): string | undefined {
  // Heuristic: "Song • Artist • Album" — third segment that isn't year/count.
  const parts = txt(sub).split(/[•·]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const candidate = parts[2] ?? '';
    if (candidate && !/^\d{4}$/.test(candidate) && !/\d:\d\d/.test(candidate)) return candidate;
  }
  return undefined;
}

export function normalizeVideoItem(raw: unknown): VideoItem | null {
  const t = normalizeSongItem(raw);
  if (!t) return null;
  return { id: t.id, title: t.title, artists: t.artists, durationSec: t.durationSec, artwork: t.artwork };
}

function carouselTitle(node: Rec): { title: string; videoId?: string; browseId?: string; playlistId?: string } {
  // MusicTwoRowItem: real title Text + endpoint. Fall back to flex for safety.
  const flex = flexes(node);
  let title = txt(node['title']);
  let ids = endpointId(node['endpoint']);
  if (!title && flex.length > 0) {
    title = txt(flex[0]);
    ids = endpointId((flex[0] as Rec)['endpoint']);
  }
  return { title, ...ids };
}

export function normalizeArtistRow(raw: unknown): Artist | null {
  const node = asRec(raw);
  const it = str(node['item_type']);
  if (it && it !== 'artist' && it !== 'library_artist' && it !== 'endpoint') return null;
  const flex = flexes(node);
  const name = txt(flex[0]) || txt(node['title']) || txt(node['name']);
  if (!name) return null;
  const ids = flex.length > 0 ? endpointId((flex[0] as Rec)['endpoint']) : endpointId(node['endpoint']);
  const did = directId(node);
  const id = ids.browseId || (did.startsWith('UC') ? did : '') || did;
  if (!id) return null;
  return { id, name, artwork: thumbs(node['thumbnail'] ?? node['thumbnails']) };
}

export function normalizeAlbumRow(raw: unknown): Album | null {
  const node = asRec(raw);
  const it = str(node['item_type']);
  if (it && it !== 'album' && it !== 'endpoint') return null;
  const c = carouselTitle(node);
  if (!c.title) return null;
  const did = directId(node);
  const id = c.browseId || c.playlistId || did;
  if (!id) return null;
  const sub = flexes(node)[1] ?? asRec(node['subtitle']);
  const artists = artistsFromRuns(sub, txt(sub));
  return {
    id,
    title: c.title,
    artist: artists[0] ?? { id: '', name: 'Unknown' },
    artists,
    year: parseYear(txt(sub)),
    artwork: thumbs(node['thumbnail'] ?? node['thumbnails']),
  };
}

export function normalizePlaylistRow(raw: unknown): Playlist | null {
  const node = asRec(raw);
  const it = str(node['item_type']);
  if (it && it !== 'playlist' && it !== 'endpoint') return null;
  const c = carouselTitle(node);
  if (!c.title) return null;
  const did = directId(node);
  const id = c.playlistId || c.browseId || did;
  if (!id || c.browseId?.startsWith('UC')) return null;
  return { id, title: c.title, artwork: thumbs(node['thumbnail'] ?? node['thumbnails']) };
}

export function normalizeCardShelf(raw: unknown): Artist | null {
  const node = asRec(raw);
  const name = txt(node['title']);
  if (!name) return null;
  const sub = txt(node['subtitle']).toLowerCase();
  if (!/artist|band|singer|musician|group/.test(sub)) return null;
  const ids = endpointId(node['on_tap']);
  const id = ids.browseId || '';
  if (!id) return null;
  return { id, name, artwork: thumbs(node['thumbnail']) };
}

/** Artist refs from TrackInfo basic_info (author may be string or object). */
export function artistsOf(node: Rec): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const author = node['author'];
  if (typeof author === 'string' && author.trim()) out.push({ id: str(asRec(node)['channel_id']), name: author.trim() });
  else if (author && typeof author === 'object') {
    const o = asRec(author);
    const name = txt(o['name']) || str(author);
    if (name) out.push({ id: str(o['id']) || str(o['channel_id']), name });
  }
  for (const key of ['artists', 'authors']) {
    const arr = node[key];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        const o = asRec(a);
        const name = txt(o['name']) || (typeof a === 'string' ? a : '');
        if (name && isProbablyArtist(name)) out.push({ id: str(o['channel_id']) || str(o['id']), name });
      }
    }
  }
  return dedupeArtists(out).length > 0 ? dedupeArtists(out) : [{ id: '', name: 'Unknown' }];
}

export function parseYear(s: string): number | undefined {
  const m = s.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : undefined;
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
