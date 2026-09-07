import { AnimatePresence, motion } from 'framer-motion';
import { isAuto, useQueue } from '../stores/queue';
import { useUi } from '../stores/ui';
import { usePlaylists } from '../stores/playlists';
import { useSettings } from '../stores/settings';
import { artistsLabel, formatTime } from '../lib/format';
import { usePlayer } from '../stores/player';
import { toast } from '../stores/toast';

function AutoplayToggle() {
  const autoplay = useSettings((s) => s.autoplay);
  const setAutoplay = useSettings((s) => s.setAutoplay);
  return (
    <button
      type="button"
      onClick={() => {
        setAutoplay(!autoplay);
        toast(autoplay ? 'Autoplay off' : 'Autoplay on — queue extends itself');
      }}
      aria-pressed={autoplay}
      title="Autoplay: keep the music going with suggestions"
      className={`rounded-full border px-2 py-0.5 text-[11px] ${autoplay ? 'border-accent text-accent' : 'border-white/10 text-ink-tertiary hover:text-ink'}`}
    >
      {autoplay ? 'AUTO ✓' : 'AUTO'}
    </button>
  );
}



export function QueuePanel() {
  const open = useUi((s) => s.queueOpen);
  const setQueue = useUi((s) => s.setQueue);
  const items = useQueue((s) => s.items);
  const index = useQueue((s) => s.index);
  const setIndex = useQueue((s) => s.setIndex);
  const remove = useQueue((s) => s.remove);
  const clear = useQueue((s) => s.clear);
  const setTrack = usePlayer((s) => s.setTrack);
  const setPlaying = usePlayer((s) => s.setPlaying);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="z-modal fixed inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQueue(false)}
            role="presentation"
          />
          <motion.aside
            role="dialog"
            aria-label="Queue"
            initial={{ x: 360, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="z-modal fixed bottom-0 right-0 top-0 flex w-[min(92vw,380px)] flex-col border-l border-white/10 bg-base-900"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Queue ({items.length})</h2>
                <AutoplayToggle />
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => {
                    const tracks = useQueue.getState().items.map((i) => i.track);
                    const pl = usePlaylists.getState().create(`Queue ${new Date().toLocaleDateString()}`);
                    usePlaylists.getState().addTracks(pl.id, tracks);
                    toast(`Saved as “${pl.name}”`, 'success');
                  }}
                  className="rounded-md px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-white/10 hover:text-ink disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    toast('Queue cleared');
                  }}
                  className="rounded-md px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-white/10 hover:text-ink"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setQueue(false)}
                  aria-label="Close queue"
                  className="rounded-md px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-white/10 hover:text-ink"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-ink-tertiary">
                  Queue is empty. Search for music and press Play.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {items.map((item, i) => (
                    <li
                      key={item.queueId}
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${i === index ? 'bg-accent-soft' : 'hover:bg-white/5'}`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setIndex(i);
                          setTrack(item.track);
                          setPlaying(true);
                        }}
                      >
                        <p className="truncate text-sm font-medium">{item.track.title}</p>
                        <p className="truncate text-xs text-ink-secondary">
                          {artistsLabel(item.track.artists)}
                          {item.track.durationSec ? ` · ${formatTime(item.track.durationSec * 1000)}` : ''}
                        </p>
                      </button>
                      {i === index ? <span className="text-[11px] text-accent">PLAYING</span> : isAuto(item) ? (
                        <span title="Suggested by autoplay" className="rounded border border-white/10 px-1 py-0.5 text-[10px] text-ink-tertiary">AUTO</span>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${item.track.title}`}
                        onClick={() => remove(item.queueId)}
                        className="rounded px-1.5 py-1 text-xs text-ink-tertiary opacity-0 hover:bg-white/10 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
