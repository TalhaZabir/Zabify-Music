import { api } from '../lib/api';
import { usePlayer } from '../stores/player';
import { useQueue } from '../stores/queue';
import { useHistory } from '../stores/history';
import { useSettings } from '../stores/settings';

const LOW_WATERMARK = 3;
const BATCH = 10;
const MAX_AUTO = 40;
const COOLDOWN_MS = 60_000;

let fetching = false;
let cooldownUntil = 0;
let lastCheck = 0;

/**
 * Smart Queue: when the upcoming queue runs low, fetch recommendations
 * seeded by the current track, dedupe against queue + history, and append
 * as autoplay items — without ever blocking playback.
 */
export async function maybeExtendQueue(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastCheck < 5000) return;
  lastCheck = now;
  if (fetching || now < cooldownUntil) return;

  const settings = useSettings.getState();
  const player = usePlayer.getState();
  const queue = useQueue.getState();
  if (!settings.autoplay || !player.playing || queue.items.length === 0) return;

  const remaining = queue.items.length - 1 - queue.index;
  if (remaining >= LOW_WATERMARK && !force) return;
  if (queue.upcomingAuto() >= MAX_AUTO) return;

  const seed = queue.current()?.track ?? player.track;
  if (!seed) return;

  fetching = true;
  try {
    const related = await api.related(seed.id);
    const excluded = new Set<string>();
    for (const i of useQueue.getState().items) excluded.add(i.track.id);
    for (const e of useHistory.getState().entries.slice(0, 100)) excluded.add(e.track.id);
    const fresh = related.filter((t) => !excluded.has(t.id)).slice(0, BATCH);
    if (fresh.length > 0) {
      useQueue.getState().appendAuto(fresh);
    } else {
      cooldownUntil = now + COOLDOWN_MS;
    }
  } catch {
    cooldownUntil = now + COOLDOWN_MS; // back off silently; retry later
  } finally {
    fetching = false;
  }
}
