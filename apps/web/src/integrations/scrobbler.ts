import type { Track } from '@zabify/shared';
import { apiPost } from '../lib/apiClient';
import { useIntegrations } from '../stores/integrations';
import { artistsLabel } from '../lib/format';

// Modular scrobbling: Last.fm via our backend proxy (keeps the shared API
// secret server-side), ListenBrainz direct with the user's own token.
// Standard rule: scrobble after min(50% of duration, 4 minutes), min 30s.

let scrobbledId: string | null = null;
let nowPlayingId: string | null = null;

export function scrobbleReset(): void {
  scrobbledId = null;
  nowPlayingId = null;
}

async function lastfm(method: 'track.updateNowPlaying' | 'track.scrobble', track: Track, timestamp?: number): Promise<void> {
  const { lastfmSk } = useIntegrations.getState();
  if (!lastfmSk) return;
  const body: Record<string, string | number> = {
    sk: lastfmSk,
    method,
    artist: artistsLabel(track.artists),
    track: track.title,
  };
  if (track.album?.title) body['album'] = track.album.title;
  if (track.durationSec) body['duration'] = track.durationSec;
  if (timestamp) body['timestamp'] = timestamp;
  const r = await apiPost('/integrations/lastfm/scrobble', body);
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(j?.error?.message ?? 'rejected');
  }
}

async function listenbrainz(listenType: 'playing_now' | 'single', track: Track, listenedAt?: number): Promise<void> {
  const { listenbrainzToken } = useIntegrations.getState();
  if (!listenbrainzToken) return;
  const payload: Record<string, unknown> = {
    track_metadata: {
      artist_name: artistsLabel(track.artists),
      track_name: track.title,
      release_name: track.album?.title,
      additional_info: {
        duration: track.durationSec,
        media_player: 'Zabify',
        submission_client: 'Zabify',
      },
    },
  };
  if (listenedAt) payload['listened_at'] = listenedAt;
  const res = await fetch('https://api.listenbrainz.org/1/submit-listens', {
    method: 'POST',
    headers: { Authorization: `Token ${listenbrainzToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ listen_type: listenType, payload: [payload] }),
  });
  if (!res.ok) throw new Error(`ListenBrainz ${res.status}`);
}

export function scrobbleNowPlaying(track: Track): void {
  if (nowPlayingId === track.id) return;
  nowPlayingId = track.id;
  void lastfm('track.updateNowPlaying', track).catch(() => undefined);
  void listenbrainz('playing_now', track).catch(() => undefined);
}

export function scrobbleProgress(track: Track, positionMs: number, durationMs: number): void {
  if (scrobbledId === track.id) return;
  const durSec = Math.floor((durationMs > 0 ? durationMs : (track.durationSec ?? 0) * 1000) / 1000);
  if (durSec < 30) return;
  const thresholdMs = Math.min(durSec * 500, 240_000);
  if (positionMs < thresholdMs) return;
  scrobbledId = track.id;
  const listenedAt = Math.floor(Date.now() / 1000);
  void lastfm('track.scrobble', track, listenedAt).catch(() => {
    scrobbledId = null; // retry on next progress tick
  });
  void listenbrainz('single', track, listenedAt).catch(() => undefined);
}
