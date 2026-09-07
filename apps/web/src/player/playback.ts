import type { Track } from '@zabify/shared';
import { audioUrl, probeAudio, qualityChain } from '../lib/api';
import { usePlayer } from '../stores/player';
import { useQueue } from '../stores/queue';
import { useSettings } from '../stores/settings';
import { useSleep } from '../stores/sleep';
import { useHistory } from '../stores/history';
import { scrobbleNowPlaying, scrobbleProgress, scrobbleReset } from '../integrations/scrobbler';
import { maybeExtendQueue } from './autoplay';
import { audioDb } from '../lib/audioDb';
import { toast } from '../stores/toast';

let audio: HTMLAudioElement | null = null;
let streamToken = 0;
let bound = false;

/** Consecutive auto-skip failures. Reset on every successful 'playing' event. */
let consecutiveFailures = 0;
const MAX_AUTO_SKIP = 3;

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const el = document.createElement('audio');
  el.id = 'zabify-audio';
  el.preload = 'auto';
  // NOTE: no crossOrigin attribute on purpose. Stream hosts (googlevideo)
  // serve bytes fine but omit Access-Control-Allow-Origin, so CORS-mode
  // media loading fails every track. Plain (no-CORS) loading is the
  // standard approach for this kind of playback. A future visualizer that
  // needs Web Audio sample access will require a CORS-capable path and
  // must handle failure gracefully.
  el.removeAttribute('crossorigin');
  document.body.appendChild(el);
  audio = el;
  return el;
}

function pickNextIndex(length: number, index: number, shuffle: boolean): number {
  if (length === 0) return 0;
  if (shuffle && length > 1) {
    let n = index;
    while (n === index) n = Math.floor(Math.random() * length);
    return n;
  }
  return (index + 1) % length;
}

export async function playTrack(track: Track): Promise<void> {
  const queue = useQueue.getState();
  const player = usePlayer.getState();
  let idx = queue.items.findIndex((i) => i.track.id === track.id);
  if (idx < 0) {
    queue.enqueue(track);
    idx = useQueue.getState().items.length - 1;
  }
  queue.setIndex(idx);
  player.setTrack(track);
  player.setPlaying(true);
}

export function togglePlay(): void {
  const { track } = usePlayer.getState();
  if (!track) {
    const current = useQueue.getState().current();
    if (current) void playTrack(current.track);
    else toast('Search for something to play first');
    return;
  }
  usePlayer.getState().toggle();
}

export function next(auto = false): void {
  const queue = useQueue.getState();
  const player = usePlayer.getState();
  if (queue.items.length === 0) return;
  if (player.repeat === 'one' && auto) {
    const t = player.track ?? queue.current()?.track;
    if (t) void playTrack(t);
    return;
  }
  const idx = pickNextIndex(queue.items.length, queue.index, player.shuffle);
  if (!auto && player.repeat === 'off' && idx === 0 && queue.index === queue.items.length - 1) {
    player.setPlaying(false);
    return;
  }
  queue.setIndex(idx);
  const item = useQueue.getState().current();
  if (item) {
    player.setTrack(item.track);
    player.setPlaying(true);
  }
}

export function prev(): void {
  const queue = useQueue.getState();
  const player = usePlayer.getState();
  if (usePlayer.getState().positionMs > 3000) {
    seek(0);
    return;
  }
  const idx = (queue.index - 1 + queue.items.length) % Math.max(1, queue.items.length);
  queue.setIndex(idx);
  const item = useQueue.getState().current();
  if (item) {
    player.setTrack(item.track);
    player.setPlaying(true);
  }
}

export function seek(ms: number): void {
  const el = ensureAudio();
  usePlayer.getState().setPosition(ms);
  if (Number.isFinite(el.duration) && el.duration > 0) {
    el.currentTime = Math.min(Math.max(0, ms / 1000), el.duration);
  }
}

/** A failure the engine can recover from by skipping. Returns false when the circuit breaker trips. */
function noteFailure(kind: 'resolve' | 'media', trackId: string, detail?: string): boolean {
  consecutiveFailures += 1;
  console.warn(`[zabify] playback ${kind} failure #${consecutiveFailures} for ${trackId}${detail ? ` (${detail})` : ''}`);
  if (consecutiveFailures > MAX_AUTO_SKIP) {
    consecutiveFailures = 0;
    usePlayer.getState().setPlaying(false);
    toast('Playback keeps failing — check your connection, then press play', 'error');
    return false;
  }
  return true;
}

/** Next-track preloaded URL for gapless transitions (cleared on use). */
let gaplessPreload: { id: string; url: string } | null = null;
/** Active blob: URL for offline playback (revoked on track change). */
let activeBlobUrl: string | null = null;

function revokeBlobUrl(): void {
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

/** Offline cache first — works with no network and never expires. */
async function cachedUrl(trackId: string): Promise<string | null> {
  try {
    const entry = await audioDb.get(trackId);
    if (!entry) return null;
    revokeBlobUrl();
    activeBlobUrl = URL.createObjectURL(entry.blob);
    return activeBlobUrl;
  } catch {
    return null;
  }
}

function targetVolume(): number {
  const s = usePlayer.getState();
  return s.muted ? 0 : s.volume;
}

async function resolveAndLoad(track: Track, token: number): Promise<void> {
  const el = ensureAudio();
  let url: string;
  const offlineHit = gaplessPreload?.id === track.id ? null : await cachedUrl(track.id);
  if (gaplessPreload?.id === track.id) {
    url = gaplessPreload.url;
    gaplessPreload = null;
  } else if (offlineHit) {
    url = offlineHit; // offline cache hit — no network needed
  } else {
    // Probe the audio endpoint across the quality chain before handing a
    // URL to <audio>. Backend JSON errors would otherwise surface as opaque
    // MEDIA_ERR_SRC_NOT_SUPPORTED and trigger blind auto-skips.
    const chain = qualityChain(useSettings.getState().quality);
    let resolved: string | null = null;
    let lastMessage = 'That track is unavailable right now';
    let lastCode: string | undefined;
    let lastTimedOut = false;
    for (const q of chain) {
      if (token !== streamToken) return; // superseded while probing
      const probe = await probeAudio(track.id, q);
      if (probe.ok) {
        resolved = probe.url;
        break;
      }
      lastMessage = probe.message;
      lastCode = probe.code;
      lastTimedOut = probe.timedOut ?? false;
      // CORS-unknown: <audio> (no-CORS) may still play — try direct.
      if (probe.corsUnknown) {
        resolved = audioUrl(track.id, q);
        break;
      }
      // Permanent per-track failures: don't burn time on lower qualities.
      if (probe.code === 'TRACK_UNAVAILABLE' || probe.status === 404 || probe.code === 'HTML_RESPONSE') break;
      // Server-wide blocks/config/timeouts: lower qualities won't help either —
      // one probe already told us everything (and each can take ~90s).
      if (probe.code === 'AUDIO_BLOCKED' || probe.code === 'AUDIO_CONFIG' || probe.timedOut) break;
    }
    if (!resolved) {
      if (token !== streamToken) return;
      usePlayer.getState().setPlaying(false);
      // AUDIO_BLOCKED / AUDIO_CONFIG / warming-up / timeout errors are
      // server-wide: stop the auto-skip cascade so every track doesn't burn
      // one skip each.
      if (
        lastCode === 'AUDIO_BLOCKED' ||
        lastCode === 'AUDIO_CONFIG' ||
        lastTimedOut ||
        /warming up or busy|taking too long|misconfigured/.test(lastMessage)
      ) {
        consecutiveFailures = MAX_AUTO_SKIP;
      }
      toast(lastMessage, 'error');
      return;
    }
    url = resolved;
  }
  if (token !== streamToken) return; // superseded while resolving
  el.src = url;
  el.playbackRate = usePlayer.getState().rate;
  const fadeMs = useSettings.getState().fadeSec * 1000;
  el.volume = fadeMs > 0 ? 0 : targetVolume();
  try {
    await el.play();
    if (fadeMs > 0 && token === streamToken) fadeIn(el, targetVolume(), fadeMs);
  } catch (e) {
    if (token !== streamToken) return;
    if (e instanceof DOMException && e.name === 'NotAllowedError') {
      // Autoplay policy: stream is loaded, user just needs to press play.
      usePlayer.getState().setPlaying(false);
      toast('Tap play to start audio');
      return;
    }
    usePlayer.getState().setPlaying(false);
    toast('That track is unavailable right now', 'error');
  }
}

/** Linear element-volume ramp (no Web Audio needed). Cancelled by token change. */
function fadeIn(el: HTMLAudioElement, to: number, ms: number): void {
  const token = streamToken;
  const t0 = performance.now();
  const step = (): void => {
    if (token !== streamToken) return;
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = to * k;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Silent preload: validate the stream URL and buffer without playing or toasting. */
async function prefetch(track: Track, token: number): Promise<void> {
  const el = ensureAudio();
  // Probe first so a backend JSON error never touches el.src — otherwise the
  // global 'error' handler would auto-skip a track the user hasn't played.
  const probe = await probeAudio(track.id, useSettings.getState().quality);
  if (token !== streamToken) return;
  if (!probe.ok) {
    if (probe.corsUnknown) {
      el.src = audioUrl(track.id, useSettings.getState().quality);
      el.playbackRate = usePlayer.getState().rate;
      el.load();
    }
    return;
  }
  try {
    el.src = probe.url;
    el.playbackRate = usePlayer.getState().rate;
    el.load();
  } catch {
    // Silent — failure surfaces when the user actually presses play.
  }
}

export function bindAudioEngine(): () => void {
  if (bound) return () => undefined;
  bound = true;
  const el = ensureAudio();
  let lastTrackId: string | null = null;
  let recordedId: string | null = null;

  const onTime = (): void => {
    const pos = Math.floor(el.currentTime * 1000);
    usePlayer.getState().setPosition(pos);
    const st = usePlayer.getState();
    if (st.track && !el.paused) scrobbleProgress(st.track, pos, st.durationMs);
    if (!el.paused) void maybeExtendQueue();
    // Fade-out at track end + gapless preload of the upcoming track.
    if (Number.isFinite(el.duration) && el.duration > 0 && !el.paused) {
      const remainingMs = (el.duration - el.currentTime) * 1000;
      const fadeMs = useSettings.getState().fadeSec * 1000;
      if (fadeMs > 0 && remainingMs < fadeMs) {
        el.volume = targetVolume() * Math.max(0, remainingMs / fadeMs);
      }
      if (useSettings.getState().gapless && remainingMs < 30_000 && remainingMs > 0) {
        void preloadNext();
      }
    }
  };

  let preloading = false;
  async function preloadNext(): Promise<void> {
    if (preloading || gaplessPreload) return;
    const q = useQueue.getState();
    const item = q.items[q.index + 1] ?? (usePlayer.getState().repeat === 'all' ? q.items[0] : undefined);
    if (!item || item.track.id === usePlayer.getState().track?.id) return;
    preloading = true;
    try {
      // Probe-validate so a broken preload never poisons gapless playback.
      const probe = await probeAudio(item.track.id, useSettings.getState().quality);
      if (!gaplessPreload && probe.ok) gaplessPreload = { id: item.track.id, url: probe.url };
    } catch {
      // Silent — normal resolve path retries on advance.
    } finally {
      preloading = false;
    }
  }
  const onMeta = (): void => {
    if (Number.isFinite(el.duration)) usePlayer.getState().setDuration(Math.floor(el.duration * 1000));
  };
  const onPlaying = (): void => {
    consecutiveFailures = 0;
    const track = usePlayer.getState().track;
    if (track && recordedId !== track.id) {
      recordedId = track.id;
      useHistory.getState().push(track);
    }
    if (track) scrobbleNowPlaying(track);
  };
  const onEnded = (): void => {
    consecutiveFailures = 0;
    const sleep = useSleep.getState();
    if (sleep.endOfTrack) {
      sleep.cancel();
      usePlayer.getState().setPlaying(false);
      toast('Sleep timer ended');
      return;
    }
    next(true);
  };
  const onError = (): void => {
    if (!el.src) return;
    const mediaCode = el.error?.code;
    const code = mediaCode ? `MEDIA_ERR_${mediaCode}` : 'unknown';
    const trackId = usePlayer.getState().track?.id ?? '?';
    usePlayer.getState().setPlaying(false);
    if (!noteFailure('media', trackId, code)) return;
    // MEDIA_ERR_SRC_NOT_SUPPORTED (4) with a probed-OK URL usually means the
    // stream died between probe and play (expiry) — retry once directly
    // instead of skipping: the next resolveAndLoad re-probes fresh.
    if (mediaCode === 4 && consecutiveFailures === 1) {
      const track = usePlayer.getState().track;
      if (track) {
        toast('Stream expired — retrying', 'error');
        const token = ++streamToken;
        el.removeAttribute('src');
        el.load();
        void resolveAndLoad(track, token);
        return;
      }
    }
    toast(mediaCode === 2 ? 'Network error — trying next track' : 'Playback error — trying next track', 'error');
    next(true);
  };
  el.addEventListener('timeupdate', onTime);
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('playing', onPlaying);
  el.addEventListener('ended', onEnded);
  el.addEventListener('error', onError);

  // Sleep timer: pause when the deadline passes.
  const sleepCheck = window.setInterval(() => {
    const { endsAt, cancel } = useSleep.getState();
    if (endsAt && Date.now() >= endsAt) {
      cancel();
      usePlayer.getState().setPlaying(false);
      toast('Sleep timer ended');
    }
  }, 1000);

  const unsubTrack = usePlayer.subscribe((s, prevS) => {
    if (s.track?.id !== prevS.track?.id) {
      lastTrackId = s.track?.id ?? null;
      recordedId = null;
      scrobbleReset();
      if (gaplessPreload && gaplessPreload.id !== s.track?.id) gaplessPreload = null;
      if (s.track) {
        const token = ++streamToken;
        el.pause();
        revokeBlobUrl();
        el.removeAttribute('src');
        el.load();
        if (s.playing) void resolveAndLoad(s.track, token);
        else void prefetch(s.track, token);
      } else {
        streamToken++;
        el.pause();
        el.removeAttribute('src');
      }
    } else if (s.playing !== prevS.playing) {
      if (s.playing) {
        if (!el.src && s.track) {
          const token = ++streamToken;
          void resolveAndLoad(s.track, token);
        } else {
          el.volume = s.muted ? 0 : s.volume;
          void el.play().catch((e: unknown) => {
            if (e instanceof DOMException && e.name === 'NotAllowedError') {
              usePlayer.getState().setPlaying(false);
              toast('Tap play to start audio');
            } else {
              usePlayer.getState().setPlaying(false);
            }
          });
        }
      } else {
        el.pause();
      }
    }
    if (s.volume !== prevS.volume || s.muted !== prevS.muted) {
      el.volume = s.muted ? 0 : s.volume;
    }
    if (s.rate !== prevS.rate) {
      el.playbackRate = s.rate;
    }
  });

  // Reload resume: a persisted track restores paused — prefetch its stream
  // silently so pressing play is instant.
  const restored = usePlayer.getState().track;
  if (restored && !el.src) {
    void prefetch(restored, ++streamToken);
  }

  // Keep queue + player in sync: if queue index changes externally, reflect track.
  const unsubQueue = useQueue.subscribe((s, prevS) => {
    if (s.index !== prevS.index) {
      const item = s.items[s.index];
      if (item && item.track.id !== lastTrackId) void playTrack(item.track);
    }
  });

  return () => {
    window.clearInterval(sleepCheck);
    el.removeEventListener('timeupdate', onTime);
    el.removeEventListener('loadedmetadata', onMeta);
    el.removeEventListener('playing', onPlaying);
    el.removeEventListener('ended', onEnded);
    el.removeEventListener('error', onError);
    unsubTrack();
    unsubQueue();
    bound = false;
  };
}
