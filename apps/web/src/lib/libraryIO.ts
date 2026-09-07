import type { Track } from '@zabify/shared';
import type { SaveKind } from '../stores/library';
import type { UserPlaylist } from '../stores/playlists';
import type { StreamQuality } from '@zabify/shared';

// Portable Zabify library format (spec §36). Versioned, validated on import,
// never trusted blindly.
export interface LibraryExport {
  version: 1;
  exportedAt: string;
  likedTracks: Track[];
  playlists: { name: string; description?: string; tracks: Track[]; createdAt: number; updatedAt: number }[];
  albums: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  settings: { accent?: string; quality?: StreamQuality };
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function cleanTrack(v: unknown): Track | null {
  if (!isRec(v)) return null;
  const id = v['id'];
  const title = v['title'];
  if (typeof id !== 'string' || !id || typeof title !== 'string' || !title) return null;
  const artists = Array.isArray(v['artists'])
    ? (v['artists'] as unknown[])
        .filter(isRec)
        .map((a) => ({ id: typeof a['id'] === 'string' ? (a['id'] as string) : '', name: typeof a['name'] === 'string' ? (a['name'] as string) : '' }))
        .filter((a) => a.name)
    : [];
  const dur = Number(v['durationSec']);
  return {
    id: id.slice(0, 64),
    title: title.slice(0, 200),
    artists: artists.length > 0 ? artists : [{ id: '', name: 'Unknown' }],
    durationSec: Number.isFinite(dur) && dur > 0 ? Math.floor(dur) : undefined,
  };
}

function cleanIdName(v: unknown): { id: string; name: string } | null {
  if (!isRec(v)) return null;
  if (typeof v['id'] !== 'string' || !v['id'] || typeof v['name'] !== 'string' || !v['name']) return null;
  return { id: (v['id'] as string).slice(0, 128), name: (v['name'] as string).slice(0, 200) };
}

export function parseLibraryImport(raw: unknown): {
  likedTracks: Track[];
  playlists: LibraryExport['playlists'];
  albums: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  settings: LibraryExport['settings'];
} {
  if (!isRec(raw) || raw['version'] !== 1) throw new Error('Unsupported file version.');
  const out = {
    likedTracks: [] as Track[],
    playlists: [] as LibraryExport['playlists'],
    albums: [] as { id: string; name: string }[],
    artists: [] as { id: string; name: string }[],
    settings: {} as LibraryExport['settings'],
  };
  if (Array.isArray(raw['likedTracks'])) {
    for (const t of (raw['likedTracks'] as unknown[]).slice(0, 5000)) {
      const c = cleanTrack(t);
      if (c) out.likedTracks.push(c);
    }
  }
  if (Array.isArray(raw['playlists'])) {
    for (const p of (raw['playlists'] as unknown[]).slice(0, 500)) {
      if (!isRec(p) || typeof p['name'] !== 'string' || !p['name'].trim()) continue;
      const tracks: Track[] = [];
      if (Array.isArray(p['tracks'])) {
        for (const t of (p['tracks'] as unknown[]).slice(0, 2000)) {
          const c = cleanTrack(t);
          if (c) tracks.push(c);
        }
      }
      out.playlists.push({
        name: (p['name'] as string).trim().slice(0, 80),
        description: typeof p['description'] === 'string' ? (p['description'] as string).slice(0, 300) : undefined,
        tracks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  for (const key of ['albums', 'artists'] as const) {
    if (Array.isArray(raw[key])) {
      for (const e of (raw[key] as unknown[]).slice(0, 2000)) {
        const c = cleanIdName(e);
        if (c) out[key].push(c);
      }
    }
  }
  if (isRec(raw['settings'])) {
    const s = raw['settings'] as Record<string, unknown>;
    if (typeof s['accent'] === 'string' && /^#[0-9a-fA-F]{6}$/.test(s['accent'] as string)) out.settings.accent = s['accent'] as string;
    if (['auto', 'high', 'medium', 'low'].includes(s['quality'] as string)) out.settings.quality = s['quality'] as StreamQuality;
  }
  return out;
}

export interface LibrarySnapshot {
  likedTracks: Track[];
  playlists: UserPlaylist[];
  albums: { id: string; name: string }[];
  artists: { id: string; name: string }[];
  settings: { accent: string; quality: StreamQuality };
}

export function buildExport(snap: LibrarySnapshot): LibraryExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    likedTracks: snap.likedTracks,
    playlists: snap.playlists.map((p) => ({
      name: p.name,
      description: p.description,
      tracks: p.tracks,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    albums: snap.albums,
    artists: snap.artists,
    settings: snap.settings,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export type { SaveKind };
