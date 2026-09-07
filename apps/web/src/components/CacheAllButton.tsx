import { useState } from 'react';
import type { Track } from '@zabify/shared';
import { useDownloads } from '../stores/downloads';
import { toast } from '../stores/toast';

export function CacheAllButton({ tracks }: { tracks: Track[] }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  if (tracks.length === 0) return null;

  async function run(): Promise<void> {
    const dl = useDownloads.getState();
    const pending = tracks.filter((t) => dl.stateOf(t.id) !== 'cached');
    if (pending.length === 0) {
      toast('Everything is already cached', 'success');
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: pending.length });
    let ok = 0;
    for (const t of pending) {
      await useDownloads.getState().download(t);
      if (useDownloads.getState().stateOf(t.id) === 'cached') ok++;
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setRunning(false);
    toast(`Cached ${ok}/${pending.length} tracks`, ok === pending.length ? 'success' : 'error');
  }

  return (
    <button
      type="button"
      disabled={running}
      onClick={() => void run()}
      className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-60"
    >
      {running ? `Caching ${progress.done}/${progress.total}` : 'Cache all'}
    </button>
  );
}
