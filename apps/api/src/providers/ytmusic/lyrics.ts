import type { Lyrics, LyricLine, Track } from '@zabify/shared';
import { artistsLabelOf } from './artistLabel.js';

// Modular community lyrics aggregation. Providers are queried in priority
// order; synced results win over plain ones. Every provider normalizes to
// the shared Lyrics model, respects timeouts, and fails soft.

export interface LyricsProvider {
  name: string;
  search(track: Track): Promise<Lyrics | null>;
}

function linesOf(trackId: string, lines: LyricLine[], source: string): Lyrics | null {
  const clean = lines.filter((l) => l.text.trim().length > 0);
  if (clean.length === 0) return null;
  return { trackId, lines: clean, synced: true, source };
}

/** Parse LRC "[mm:ss.xx] lyric" into timestamped lines. */
export function parseLrc(trackId: string, lrc: string, source: string): Lyrics | null {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    let frac = m[3] ?? '0';
    if (frac.length === 2) frac += '0';
    const ms = min * 60_000 + sec * 1000 + Number(frac.slice(0, 3).padEnd(3, '0'));
    if (!Number.isFinite(ms)) continue;
    // Skip metadata tags like [ar:Artist], [ti:Title].
    if (/^\[(ar|ti|al|by|offset):/i.test(raw)) continue;
    lines.push({ startMs: ms, text: (m[4] ?? '').trim() });
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  return linesOf(trackId, lines, source);
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/**
 * lrclib.net — free community lyrics, no key, generous rate limits.
 * Attribution: source is recorded on every result.
 */
export class LrclibProvider implements LyricsProvider {
  readonly name = 'lrclib.net';

  async search(track: Track): Promise<Lyrics | null> {
    const artist = artistsLabelOf(track);
    const q = new URLSearchParams({ artist_name: artist, track_name: track.title });
    if (track.album?.title) q.set('album_name', track.album.title);
    if (track.durationSec) q.set('duration', String(track.durationSec));
    const { signal, done } = withTimeout(10000);
    try {
      const res = await fetch(`https://lrclib.net/api/get?${q.toString()}`, {
        headers: { accept: 'application/json', 'User-Agent': 'Zabify/1.0 (+https://zabify.music)' },
        signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const json = (await res.json()) as { syncedLyrics?: unknown; plainLyrics?: unknown };
      if (typeof json.syncedLyrics === 'string' && json.syncedLyrics.trim()) {
        const parsed = parseLrc(track.id, json.syncedLyrics, 'lrclib.net');
        if (parsed) return parsed;
      }
      if (typeof json.plainLyrics === 'string' && json.plainLyrics.trim()) {
        return { trackId: track.id, plain: json.plainLyrics.trim(), synced: false, source: 'lrclib.net' };
      }
      return null;
    } catch {
      return null;
    } finally {
      done();
    }
  }
}

/** Adapter wrapping the raw YouTube Music lyrics lookup (NOT the chain — that would recurse). */
export class YouTubeLyricsAdapter implements LyricsProvider {
  readonly name = 'YouTube Music';
  constructor(private readonly fetchRaw: (trackId: string) => Promise<Lyrics | null>) {}

  async search(track: Track): Promise<Lyrics | null> {
    try {
      return await this.fetchRaw(track.id);
    } catch {
      return null;
    }
  }
}

/** Priority chain: first synced win, else first plain win. */
export class LyricsChain {
  constructor(private readonly providers: LyricsProvider[]) {}

  async resolve(track: Track): Promise<Lyrics | null> {
    let plainFallback: Lyrics | null = null;
    for (const p of this.providers) {
      let res: Lyrics | null = null;
      try {
        res = await p.search(track);
      } catch {
        res = null;
      }
      if (!res) continue;
      const hasContent = (res.lines ?? []).length > 0 || (res.plain ?? '').trim().length > 0;
      if (!hasContent) continue;
      if (res.synced) return res;
      plainFallback ??= res;
    }
    return plainFallback;
  }
}
