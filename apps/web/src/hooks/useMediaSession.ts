import { useEffect } from 'react';
import { usePlayer } from '../stores/player';
import { artistsLabel } from '../lib/format';
import { next, prev } from '../player/playback';

export function useMediaSession(): void {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      if (track) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: artistsLabel(track.artists),
          album: track.album?.title ?? '',
          artwork: (track.artwork ?? []).slice(0, 3).map((a) => ({ src: a.url, sizes: `${a.width ?? 512}x${a.height ?? 512}` })),
        });
      }
      navigator.mediaSession.setActionHandler('play', () => usePlayer.getState().setPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => usePlayer.getState().setPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', () => prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => next());
    } catch {
      // Media Session is best-effort.
    }
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  }, [playing]);

}
