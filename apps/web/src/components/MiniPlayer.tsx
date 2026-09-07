import { usePlayer } from '../stores/player';
import { useUi } from '../stores/ui';
import { artistsLabel } from '../lib/format';
import { next, seek, togglePlay } from '../player/playback';

export function MiniPlayer() {
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.positionMs);
  const duration = usePlayer((s) => s.durationMs);
  const setFull = useUi((s) => s.setFullPlayer);
  const setQueue = useUi((s) => s.setQueue);

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="z-player fixed inset-x-0 bottom-0 border-t border-white/10 bg-base-900/95 backdrop-blur" role="region" aria-label="Mini player">
      <div
        className="h-0.5 w-full cursor-pointer bg-white/10"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, duration)}
        aria-valuenow={Math.min(position, Math.max(1, duration))}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
          seek(Math.floor(ratio * duration));
        }}
      >
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2.5 md:gap-3 md:px-5">
        <button
          type="button"
          onClick={() => setFull(true)}
          aria-label="Open full player"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/10 text-sm font-bold"
        >
          {(track?.title ?? 'Z').slice(0, 1)}
        </button>
        <button type="button" onClick={() => setFull(true)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium">{track?.title ?? 'Nothing playing yet'}</p>
          <p className="truncate text-xs text-ink-secondary">
            {track ? artistsLabel(track.artists) : 'Search and press play'}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setQueue(true)}
          aria-label="Open queue"
          className="hidden rounded-md px-2.5 py-2 text-xs text-ink-secondary hover:bg-white/10 hover:text-ink sm:block"
        >
          Queue
        </button>
        <button
          type="button"
          onClick={() => next()}
          aria-label="Next track"
          className="grid h-10 w-10 place-items-center rounded-full text-base hover:bg-white/10"
        >
          ⏭
        </button>
        <button
          type="button"
          onClick={() => togglePlay()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-bold text-black"
        >
          {playing ? 'II' : '▶'}
        </button>
      </div>
    </div>
  );
}
