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
import { apiFetch, throwForResponse, getActiveBase } from './apiClient';

async function req<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) await throwForResponse(res);
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error('API returned a page instead of data — check VITE_API_BASE_URL points at the backend /api.');
  }
  return (await res.json()) as T;
}

export type AudioProbe =
  | { ok: true; url: string; quality: StreamQuality }
  | { ok: false; url: string; status?: number; code?: string; message: string; corsUnknown?: boolean; timedOut?: boolean };

/** Quality fallback chain: requested first, then progressively cheaper. */
export function qualityChain(requested: StreamQuality): StreamQuality[] {
  switch (requested) {
    case 'low':
      return ['low'];
    case 'medium':
      return ['medium', 'low'];
    case 'high':
      return ['high', 'medium', 'low'];
    default:
      return ['auto', 'high', 'medium', 'low'];
  }
}

export function audioUrl(id: string, quality: StreamQuality = 'auto'): string {
  return `${getActiveBase()}/tracks/${encodeURIComponent(id)}/audio?quality=${quality}`;
}

/**
 * Validate the audio endpoint BEFORE handing the URL to <audio>.
 * Without this, backend JSON errors (404/502) surface as opaque
 * MEDIA_ERR_SRC_NOT_SUPPORTED and the player blindly skips tracks.
 * A CORS TypeError is reported as corsUnknown — the <audio> element
 * (no-CORS mode) may still play, so callers fall back to direct play.
 *
 * Free-tier servers sleep and yt-dlp resolves are slow: the probe waits up
 * to 90s. An abort surfaces as timedOut ("server may be waking up").
 */
const PROBE_TIMEOUT_MS = 90000;

export async function probeAudio(id: string, quality: StreamQuality): Promise<AudioProbe> {
  const url = audioUrl(id, quality);
  const fail = (p: { status?: number; code?: string; message: string; corsUnknown?: boolean; timedOut?: boolean }): AudioProbe => {
    const out: AudioProbe = { ok: false, url, ...p };
    console.warn('[zabify] audio probe failed', { url, status: p.status, code: p.code });
    return out;
  };
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: ctrl.signal });
  } catch (e) {
    window.clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') {
      return fail({
        timedOut: true,
        message: 'The audio server is taking too long (it may be waking up) — press play to retry',
      });
    }
    return fail({ message: 'Network error reaching the audio server.', corsUnknown: true });
  }
  window.clearTimeout(timer);
  if (res.ok || res.status === 206 || res.status === 200) {
    const ct = res.headers.get('content-type') ?? '';
    // Drain the 2-byte probe body so sockets close cleanly.
    await res.arrayBuffer().catch(() => undefined);
    if (/^(audio\/|video\/mp4)/.test(ct)) return { ok: true, url, quality };
    if (ct.includes('text/html')) {
      return fail({
        status: res.status,
        code: 'HTML_RESPONSE',
        message: 'API returned a page instead of audio — check VITE_API_BASE_URL points at the backend /api.',
      });
    }
    // Unexpected content type — still let <audio> try; it reports the truth.
    return { ok: true, url, quality };
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) {
    return fail({
      status: res.status,
      code: 'HTML_RESPONSE',
      message: 'API returned a page instead of audio — check VITE_API_BASE_URL points at the backend /api.',
    });
  }
  let code: string | undefined;
  let serverMessage: string | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body?.error?.code;
    serverMessage = body?.error?.message;
  } catch {
    // non-JSON error body — fall through to status-based message
  }
  // Surface the server's resolve token (x-resolve-error) in the console so a
  // remote 404/502 can be diagnosed without server log access.
  const resolveErr = res.headers.get('x-resolve-error');
  if (resolveErr) console.warn('[zabify] server resolve detail', { url, resolveErr });
  return fail({ status: res.status, code, message: messageForAudioError(res.status, code, serverMessage) });
}

function messageForAudioError(status: number, code?: string, serverMessage?: string): string {
  if (code === 'TRACK_UNAVAILABLE' || status === 404) return 'That track is unavailable right now';
  if (code === 'AUDIO_BLOCKED') {
    return 'YouTube is blocking or rate-limiting this server. Try a lower quality, wait a minute, or ask the host to set YTDLP_COOKIES.';
  }
  if (code === 'AUDIO_CONFIG') {
    return 'Audio backend is misconfigured (yt-dlp missing) — the API must be deployed from the Dockerfile. Check /api/diag.';
  }
  if (code === 'AUDIO_TOO_LARGE') return 'That track is too large to stream through this server';
  if (code === 'INVALID_RANGE') return 'Seek failed — retrying';
  if (status === 416) return 'Seek failed — retrying';
  if (status === 429) return 'Server is rate-limited — wait a moment and press play';
  if (status === 502 || status === 503 || status === 504 || code === 'AUDIO_FAILED') {
    return serverMessage && serverMessage !== 'Audio is temporarily unavailable.'
      ? serverMessage
      : 'Audio server is warming up or busy — press play to retry';
  }
  return serverMessage || `Audio failed (HTTP ${status})`;
}

export const api = {
  health: () => req<{ ok: boolean }>('/health'),
  search: (q: string) => req<SearchResult>(`/search?q=${encodeURIComponent(q)}&limit=25`),
  track: (id: string) => req<Track>(`/tracks/${encodeURIComponent(id)}`),
  stream: async (id: string, quality: StreamQuality = 'auto'): Promise<StreamInfo> => ({
    url: audioUrl(id, quality),
    trackId: id,
    expiresAt: Date.now() + 6 * 3600_000,
  }),
  related: (id: string) => req<Track[]>(`/tracks/${encodeURIComponent(id)}/related`),
  lyrics: (id: string) => req<Lyrics>(`/tracks/${encodeURIComponent(id)}/lyrics`),
  artist: (id: string) => req<Artist>(`/artists/${encodeURIComponent(id)}`),
  album: (id: string) => req<Album>(`/albums/${encodeURIComponent(id)}`),
  playlist: (id: string) => req<Playlist>(`/playlists/${encodeURIComponent(id)}`),
  home: () => req<HomeFeed>('/home'),
};

export { getActiveBase, testBase } from './apiClient';
