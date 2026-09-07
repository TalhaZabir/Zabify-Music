import { useMemo, useState } from 'react';
import { useLibrary } from '../stores/library';
import { toast } from '../stores/toast';
import { playAll } from '../lib/playAll';
import { artistsLabel } from '../lib/format';
import { EmptyState } from '../components/StateViews';
import { TrackRow } from '../components/TrackRow';
import { Modal } from '../components/Modal';
import type { Track } from '@zabify/shared';

type Sort = 'recent' | 'title' | 'artist' | 'duration';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recently liked' },
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
  { id: 'duration', label: 'Duration' },
];

export function LikedSongs() {
  const ids = useLibrary((s) => s.likedTrackIds);
  const tracks = useLibrary((s) => s.likedTracks);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const [sort, setSort] = useState<Sort>('recent');
  const [filter, setFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const list: Track[] = useMemo(() => {
    const all = ids.flatMap((id) => {
      const t = tracks[id];
      return t ? [{ t, at: ids.indexOf(id) }] : [];
    });
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? all.filter(({ t }) => t.title.toLowerCase().includes(q) || artistsLabel(t.artists).toLowerCase().includes(q))
      : all;
    const sorted = [...filtered];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.t.title.localeCompare(b.t.title));
        break;
      case 'artist':
        sorted.sort((a, b) => artistsLabel(a.t.artists).localeCompare(artistsLabel(b.t.artists)));
        break;
      case 'duration':
        sorted.sort((a, b) => (b.t.durationSec ?? 0) - (a.t.durationSec ?? 0));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => b.at - a.at);
        break;
    }
    return sorted.map(({ t }) => t);
  }, [ids, tracks, sort, filter]);

  if (ids.length === 0) {
    return <EmptyState title="No liked songs yet" hint="Tap the heart on any song and it will appear here." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Liked songs ({ids.length})</h1>
        <button
          type="button"
          onClick={() => playAll(list)}
          disabled={list.length === 0}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40"
        >
          Play all
        </button>
        <button
          type="button"
          onClick={() => playAll(list, { shuffle: true })}
          disabled={list.length === 0}
          className="rounded-lg border border-white/15 px-4 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter liked songs…"
          aria-label="Filter liked songs"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-base-900 px-3.5 py-2 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort liked songs"
          className="rounded-lg border border-white/10 bg-base-900 px-3 py-2 text-sm outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No matches" hint={`Nothing liked matches “${filter}”.`} />
      ) : (
        <ul className="space-y-1">
          {list.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} />
          ))}
        </ul>
      )}
      <Modal open={confirmClear} title="Unlike all songs?" onClose={() => setConfirmClear(false)}>
        <p className="text-sm text-ink-secondary">This removes all {ids.length} liked songs. Playlists are unaffected.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
            Keep
          </button>
          <button
            type="button"
            onClick={() => {
              for (const id of [...ids]) toggleLike(id);
              setConfirmClear(false);
              toast('Liked songs cleared');
            }}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-white"
          >
            Unlike all
          </button>
        </div>
      </Modal>
    </div>
  );
}
