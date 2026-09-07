import { useRef } from 'react';
import type { Track } from '@zabify/shared';
import { artistsLabel, formatTime } from '../lib/format';
import { openTrackMenu } from '../lib/trackMenu';
import { menuFromEvent } from './ContextMenu';
import { playTrack } from '../player/playback';
import { useLibrary } from '../stores/library';
import { usePlayer } from '../stores/player';

export function TrackRow({ track, index }: { track: Track; index?: number }) {
  const isLiked = useLibrary((s) => s.isLiked(track.id));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const currentId = usePlayer((s) => s.track?.id);
  const playing = usePlayer((s) => s.playing);
  const longPress = useRef<number | undefined>(undefined);

  const isCurrent = currentId === track.id;

  return (
    <li
      className={`group flex items-center gap-3 rounded-lg p-2 ${isCurrent ? 'bg-accent-soft' : 'hover:bg-white/5'}`}
      onContextMenu={(e) => {
        const { x, y } = menuFromEvent(e);
        openTrackMenu(x, y, track);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        window.clearTimeout(longPress.current);
        longPress.current = window.setTimeout(() => openTrackMenu(t.clientX, t.clientY, track), 500);
      }}
      onTouchEnd={() => window.clearTimeout(longPress.current)}
    >
      <span className="w-6 shrink-0 text-center text-xs text-ink-tertiary">
        {isCurrent && playing ? '♪' : index !== undefined ? index + 1 : '♪'}
      </span>
      <button type="button" onClick={() => void playTrack(track)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{track.title}</p>
        <p className="truncate text-xs text-ink-secondary">
          {artistsLabel(track.artists)}
          {track.durationSec ? ` · ${formatTime(track.durationSec * 1000)}` : ''}
        </p>
      </button>
      <button
        type="button"
        aria-label={isLiked ? 'Unlike' : 'Like'}
        aria-pressed={isLiked}
        onClick={() => toggleLike(track.id, track)}
        className={`rounded-md px-2 py-1 text-sm ${isLiked ? 'text-accent' : 'text-ink-tertiary opacity-0 hover:text-ink group-hover:opacity-100'}`}
      >
        ♥
      </button>
      <button
        type="button"
        aria-label={`More actions for ${track.title}`}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          openTrackMenu(Math.min(r.left, window.innerWidth - 220), r.bottom + 6, track);
        }}
        className="rounded-md px-2 py-1 text-sm text-ink-tertiary hover:bg-white/10 hover:text-ink"
      >
        ⋯
      </button>
    </li>
  );
}
