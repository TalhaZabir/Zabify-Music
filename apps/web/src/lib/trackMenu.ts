import type { Track } from '@zabify/shared';
import { useMenu } from '../stores/menu';
import { useQueue } from '../stores/queue';
import { useLibrary } from '../stores/library';
import { useUi } from '../stores/ui';
import { useDownloads } from '../stores/downloads';
import { toast } from '../stores/toast';
import { playTrack } from '../player/playback';

function downloadLabel(trackId: string): string {
  const s = useDownloads.getState().stateOf(trackId);
  if (s === 'cached') return 'Cached ✓ (remove)';
  if (s === 'downloading') return 'Caching…';
  if (s === 'failed') return 'Retry cache';
  return 'Cache offline';
}

function downloadFor(track: Track): Promise<void> {
  const dl = useDownloads.getState();
  if (dl.stateOf(track.id) === 'cached') return dl.remove(track.id);
  return dl.download(track);
}

export function trackMenuItems(track: Track) {
  const queue = useQueue.getState();
  const library = useLibrary.getState();
  const liked = library.isLiked(track.id);
  return [
    { label: 'Play', run: () => void playTrack(track) },
    { label: 'Play next', run: () => { queue.playNext(track); toast('Will play next', 'success'); } },
    { label: 'Add to queue', run: () => { queue.enqueue(track); toast('Added to queue', 'success'); } },
    { label: liked ? 'Remove from Liked' : 'Like', run: () => { library.toggleLike(track.id, track); toast(liked ? 'Removed from library' : 'Liked', 'success'); } },
    { label: 'Add to playlist…', run: () => useUi.getState().setAddToPlaylistTrack(track) },
    {
      label: downloadLabel(track.id),
      run: () => void downloadFor(track),
    },
    {
      label: 'Copy link',
      run: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}/track/${track.id}`).then(
          () => toast('Link copied', 'success'),
          () => toast('Could not copy link', 'error'),
        );
      },
    },
  ];
}

export function openTrackMenu(x: number, y: number, track: Track): void {
  useMenu.getState().openMenu(x, y, trackMenuItems(track));
}
