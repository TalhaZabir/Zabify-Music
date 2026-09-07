import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../stores/ui';
import { usePlayer } from '../stores/player';
import { useQueue } from '../stores/queue';
import { useSettings } from '../stores/settings';
import { useSleep } from '../stores/sleep';
import { next, prev, togglePlay } from '../player/playback';
import { toast } from '../stores/toast';

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

function fuzzy(hay: string, needle: string): boolean {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  let j = 0;
  for (const ch of h) {
    if (ch === n[j]) j++;
    if (j === n.length) return true;
  }
  return h.includes(n);
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setPalette = useUi((s) => s.setPalette);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      { id: 'search', title: 'Go to Search', run: () => navigate('/search') },
      { id: 'home', title: 'Go to Home', run: () => navigate('/') },
      { id: 'library', title: 'Go to Library', run: () => navigate('/library') },
      { id: 'settings', title: 'Go to Settings', run: () => navigate('/settings') },
      { id: 'playpause', title: 'Play / Pause', hint: 'Space', run: () => togglePlay() },
      { id: 'next', title: 'Next track', hint: 'N', run: () => next() },
      { id: 'prev', title: 'Previous track', hint: 'P', run: () => prev() },
      { id: 'shuffle', title: 'Toggle shuffle', hint: 'S', run: () => usePlayer.getState().toggleShuffle() },
      { id: 'repeat', title: 'Cycle repeat', hint: 'R', run: () => usePlayer.getState().cycleRepeat() },
      { id: 'mute', title: 'Mute / Unmute', hint: 'M', run: () => usePlayer.getState().toggleMute() },
      {
        id: 'queue', title: 'Open queue', run: () => useUi.getState().setQueue(true),
      },
      {
        id: 'clear-queue', title: 'Clear queue', run: () => { useQueue.getState().clear(); toast('Queue cleared'); },
      },
      {
        id: 'autoplay', title: 'Toggle autoplay', run: () => { const st = useSettings.getState(); st.setAutoplay(!st.autoplay); toast(st.autoplay ? 'Autoplay off' : 'Autoplay on'); },
      },
      {
        id: 'go-playlists', title: 'Go to my playlists', run: () => navigate('/library'),
      },
      {
        id: 'sidebar', title: 'Toggle sidebar', run: () => useSettings.getState().toggleSidebar(),
      },
      {
        id: 'fullplayer', title: 'Open full player', run: () => useUi.getState().setFullPlayer(true),
      },
      {
        id: 'speed', title: 'Cycle playback speed', run: () => usePlayer.getState().cycleRate(),
      },
      {
        id: 'sleep-15', title: 'Sleep timer: 15 min', run: () => { useSleep.getState().startMinutes(15); toast('Sleep timer: 15 min', 'success'); },
      },
      {
        id: 'sleep-30', title: 'Sleep timer: 30 min', run: () => { useSleep.getState().startMinutes(30); toast('Sleep timer: 30 min', 'success'); },
      },
      {
        id: 'sleep-track', title: 'Sleep timer: end of track', run: () => { useSleep.getState().startEndOfTrack(); toast('Music stops at end of track', 'success'); },
      },
      {
        id: 'sleep-off', title: 'Sleep timer: off', run: () => { useSleep.getState().cancel(); toast('Sleep timer off'); },
      },
    ],
    [navigate],
  );

  const filtered = useMemo(() => commands.filter((c) => fuzzy(c.title, q)), [commands, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function run(cmd: Command): void {
    setPalette(false);
    cmd.run();
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="z-modal fixed inset-0 bg-black/60 p-4 backdrop-blur-sm md:pt-28"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPalette(false)}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-base-900 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  const cmd = filtered[active];
                  if (cmd) run(cmd);
                } else if (e.key === 'Escape') {
                  setPalette(false);
                }
              }}
              placeholder="Type a command… (try “shuffle”, “queue”, “library”)"
              aria-label="Command palette"
              className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-ink-tertiary"
            />
            <ul className="max-h-72 overflow-y-auto p-1.5" role="listbox">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-ink-tertiary">No matching commands</li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(c)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                        i === active ? 'bg-white/10 text-ink' : 'text-ink-secondary'
                      }`}
                    >
                      <span>{c.title}</span>
                      {c.hint ? <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-ink-tertiary">{c.hint}</kbd> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
