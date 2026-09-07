import type { Track } from '@zabify/shared';
import { usePlayer } from '../stores/player';
import { useQueue } from '../stores/queue';

export function playAll(tracks: Track[], opts?: { shuffle?: boolean; startIndex?: number }): void {
  if (tracks.length === 0) return;
  let list = tracks;
  let index = opts?.startIndex ?? 0;
  if (opts?.shuffle) {
    list = [...tracks].sort(() => Math.random() - 0.5);
    index = 0;
  }
  useQueue.getState().replace(list, index);
  const item = useQueue.getState().current();
  if (item) {
    usePlayer.getState().setTrack(item.track);
    usePlayer.getState().setPlaying(true);
  }
}
