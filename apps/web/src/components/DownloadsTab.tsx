import { useEffect, useState } from 'react';
import type { Track } from '@zabify/shared';
import { audioDb } from '../lib/audioDb';
import { formatBytes, useDownloads } from '../stores/downloads';
import { artistsLabel, formatTime } from '../lib/format';
import { playTrack } from '../player/playback';
import { EmptyState } from './StateViews';
import { Artwork } from './Cards';

interface Row {
  trackId: string;
  size: number;
  cachedAt: number;
  track: Track;
}

export function DownloadsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const entries = useDownloads((s) => s.entries);
  const remove = useDownloads((s) => s.remove);
  const clearAll = useDownloads((s) => s.clearAll);
  const refresh = useDownloads((s) => s.refresh);

  async function load(): Promise<void> {
    try {
      const list = await audioDb.list();
      setRows(list.slice().sort((a, b) => b.cachedAt - a.cachedAt));
    } catch {
      setRows([]);
    }
    try {
      const est = await navigator.storage.estimate();
      setQuota({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch {
      setQuota(null);
    }
  }

  useEffect(() => {
    void refresh().then(() => void load());
  }, [refresh]);

  const downloading = Object.values(entries).filter((e) => e.state === 'downloading' || e.state === 'failed');
  const totalBytes = rows.reduce((a, r) => a + r.size, 0);

  if (rows.length === 0 && downloading.length === 0) {
    return <EmptyState title="Nothing cached yet" hint="Use Cache on any song, album, or playlist. Cached audio plays even when you're offline." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-base-900 p-3">
        <p className="text-sm">
          <span className="font-semibold">{rows.length}</span> <span className="text-ink-secondary">cached · {formatBytes(totalBytes)}</span>
        </p>
        {quota && quota.quota > 0 ? (
          <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (quota.usage / quota.quota) * 100)}%` }} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void clearAll().then(() => void load())}
          className="ml-auto rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
        >
          Clear all
        </button>
      </div>

      {downloading.length > 0 ? (
        <ul className="space-y-1">
          {downloading.map((e) => (
            <li key={e.trackId} className="rounded-lg border border-white/10 p-2.5">
              <p className="text-sm">{e.state === 'failed' ? `Failed: ${e.error ?? 'unknown'}` : `Caching… ${Math.round(e.progress * 100)}%`}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <div className={`h-full rounded-full ${e.state === 'failed' ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.round(e.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.trackId} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
            <Artwork art={r.track.artwork} title={r.track.title} className="h-11 w-11 text-lg" />
            <button type="button" onClick={() => void playTrack(r.track)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium">{r.track.title}</p>
              <p className="truncate text-xs text-ink-secondary">
                {artistsLabel(r.track.artists)} · {formatBytes(r.size)}
                {r.track.durationSec ? ` · ${formatTime(r.track.durationSec * 1000)}` : ''} · <span className="text-accent">Offline ✓</span>
              </p>
            </button>
            <button
              type="button"
              onClick={() => void remove(r.trackId).then(() => void load())}
              aria-label={`Remove ${r.track.title} from cache`}
              className="rounded px-2 py-1 text-xs text-ink-tertiary hover:bg-white/10 hover:text-red-400"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
