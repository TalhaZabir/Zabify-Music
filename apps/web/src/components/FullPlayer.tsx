import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '../stores/player';
import { useDownloads } from '../stores/downloads';
import { useLibrary } from '../stores/library';
import { useUi } from '../stores/ui';
import { sleepLabel, useSleep } from '../stores/sleep';
import { toast } from '../stores/toast';
import { artistsLabel, formatTime } from '../lib/format';
import { next, prev, seek, togglePlay } from '../player/playback';
import { Artwork } from './Cards';
import { LyricsPane } from './LyricsPane';
import { SleepModal } from './SleepModal';

async function shareTrack(): Promise<void> {
  const track = usePlayer.getState().track;
  if (!track) return;
  const url = `${window.location.origin}/search?q=${encodeURIComponent(track.title)}`;
  const data = { title: track.title, text: `${track.title} — ${artistsLabel(track.artists)}`, url };
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return;
    } catch {
      return; // user dismissed — not an error
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied', 'success');
  } catch {
    toast('Could not share', 'error');
  }
}

function DownloadButton() {
  const track = usePlayer((s) => s.track);
  const state = useDownloads((s) => (track ? (s.entries[track.id]?.state ?? 'idle') : 'idle'));
  const progress = useDownloads((s) => (track ? (s.entries[track.id]?.progress ?? 0) : 0));
  if (!track) return null;
  const label = state === 'cached' ? 'Cached ✓' : state === 'downloading' ? `${Math.round(progress * 100)}%` : state === 'failed' ? 'Retry' : 'Cache';
  return (
    <button
      type="button"
      onClick={() => {
        const dl = useDownloads.getState();
        if (dl.stateOf(track.id) === 'cached') void dl.remove(track.id);
        else void dl.download(track);
      }}
      disabled={state === 'downloading'}
      aria-label={state === 'cached' ? 'Remove offline cache' : 'Cache offline'}
      className={`rounded-full border px-3.5 py-2 text-sm disabled:opacity-60 ${state === 'cached' ? 'border-accent text-accent' : 'border-white/10 text-ink-secondary hover:bg-white/10 hover:text-ink'}`}
    >
      {label}
    </button>
  );
}

function LikeButton() {
  const track = usePlayer((s) => s.track);
  const isLiked = useLibrary((s) => (track ? s.isLiked(track.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  if (!track) return null;
  return (
    <button
      type="button"
      onClick={() => {
        toggleLike(track.id, track);
        toast(isLiked ? 'Removed from Liked' : 'Liked ♥', 'success');
      }}
      aria-label={isLiked ? 'Unlike' : 'Like'}
      aria-pressed={isLiked}
      className={`rounded-full border px-3.5 py-2 text-sm ${isLiked ? 'border-accent text-accent' : 'border-white/10 text-ink-secondary hover:bg-white/10 hover:text-ink'}`}
    >
      ♥
    </button>
  );
}

export function FullPlayer() {
  const open = useUi((s) => s.fullPlayerOpen);
  const setFull = useUi((s) => s.setFullPlayer);
  const setQueue = useUi((s) => s.setQueue);
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.positionMs);
  const duration = usePlayer((s) => s.durationMs);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const rate = usePlayer((s) => s.rate);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const cycleRate = usePlayer((s) => s.cycleRate);
  const sleepEndsAt = useSleep((s) => s.endsAt);
  const sleepEndOfTrack = useSleep((s) => s.endOfTrack);
  const [tab, setTab] = useState<'player' | 'lyrics'>('player');
  const [sleepOpen, setSleepOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [open ]);

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const sleepActive = sleepEndsAt !== null || sleepEndOfTrack;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Now playing"
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 48 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          className="z-player fixed inset-0 flex flex-col bg-base-950/97 backdrop-blur-xl"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{ background: 'radial-gradient(60% 50% at 50% 20%, var(--accent-soft), transparent 70%)' }}
          />
          <div className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-5 pb-8 pt-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFull(false)}
                aria-label="Close full player"
                className="rounded-full border border-white/10 px-3.5 py-2 text-sm text-ink-secondary hover:bg-white/10 hover:text-ink"
              >
                ↓ Close
              </button>
              <div className="flex rounded-full border border-white/10 p-0.5 text-xs" role="tablist" aria-label="Player views">
                {(['player', 'lyrics'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3.5 py-1.5 capitalize ${tab === t ? 'bg-white/15 text-ink' : 'text-ink-secondary hover:text-ink'}`}
                  >
                    {t === 'player' ? 'Now playing' : 'Lyrics'}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <LikeButton />
                <DownloadButton />
                <button
                  type="button"
                  onClick={() => void shareTrack()}
                  disabled={!track}
                  aria-label="Share track"
                  className="rounded-full border border-white/10 px-3.5 py-2 text-sm text-ink-secondary hover:bg-white/10 hover:text-ink disabled:opacity-40"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() => setQueue(true)}
                  className="rounded-full border border-white/10 px-3.5 py-2 text-sm text-ink-secondary hover:bg-white/10 hover:text-ink"
                >
                  Queue
                </button>
              </div>
            </div>

            {tab === 'lyrics' ? (
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-base-900/60 px-5 py-4">
                <LyricsPane trackId={track?.id ?? null} trackTitle={track?.title ?? ''} positionMs={position} />
              </div>
            ) : (
              <>
                <div className="mt-6 grid place-items-center">
                  <Artwork art={track?.artwork} title={track?.title ?? 'Z'} className="h-64 w-64 text-6xl" rounded="rounded-2xl" />
                </div>

                <div className="mt-6 text-center">
                  <h2 className="truncate text-xl font-semibold tracking-tight">{track?.title ?? 'Nothing playing'}</h2>
                  <p className="mt-1 truncate text-sm text-ink-secondary">
                    {track ? artistsLabel(track.artists) : 'Pick something from search'}
                  </p>
                </div>

                <div className="mt-6">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    value={Math.min(position, Math.max(1, duration))}
                    onChange={(e) => seek(Number(e.target.value))}
                    aria-label="Seek"
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="mt-1 flex justify-between text-xs text-ink-tertiary">
                    <span>{formatTime(position)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={toggleShuffle}
                    aria-label="Toggle shuffle"
                    aria-pressed={shuffle}
                    className={`grid h-11 w-11 place-items-center rounded-full text-sm ${shuffle ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:bg-white/10'}`}
                  >
                    SH
                  </button>
                  <button
                    type="button"
                    onClick={() => prev()}
                    aria-label="Previous"
                    className="grid h-12 w-12 place-items-center rounded-full text-lg hover:bg-white/10"
                  >
                    ⏮
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlay()}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="grid h-16 w-16 place-items-center rounded-full bg-accent text-xl font-bold text-black"
                  >
                    {playing ? 'II' : '▶'}
                  </button>
                  <button
                    type="button"
                    onClick={() => next()}
                    aria-label="Next"
                    className="grid h-12 w-12 place-items-center rounded-full text-lg hover:bg-white/10"
                  >
                    ⏭
                  </button>
                  <button
                    type="button"
                    onClick={cycleRepeat}
                    aria-label={`Repeat ${repeat}`}
                    className={`grid h-11 w-11 place-items-center rounded-full text-sm ${repeat !== 'off' ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:bg-white/10'}`}
                  >
                    {repeat === 'one' ? 'R1' : 'RP'}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={cycleRate}
                    aria-label={`Playback speed ${rate}x`}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-ink-secondary hover:bg-white/10 hover:text-ink"
                  >
                    {rate}× speed
                  </button>
                  <button
                    type="button"
                    onClick={() => setSleepOpen(true)}
                    aria-label="Sleep timer"
                    className={`rounded-full border px-3 py-1.5 hover:bg-white/10 hover:text-ink ${sleepActive ? 'border-accent text-accent' : 'border-white/10 text-ink-secondary'}`}
                  >
                    {sleepActive ? `Sleep: ${sleepLabel(sleepEndsAt, sleepEndOfTrack)}` : 'Sleep timer'}
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    className="text-sm text-ink-secondary hover:text-ink"
                  >
                    {muted || volume === 0 ? '🔇' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    aria-label="Volume"
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </>
            )}
          </div>
          <SleepModal open={sleepOpen} onClose={() => setSleepOpen(false)} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
