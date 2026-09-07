import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Playlist as PlaylistT } from '@zabify/shared';
import { api } from '../lib/api';
import { playAll } from '../lib/playAll';
import { useLibrary } from '../stores/library';
import { toast } from '../stores/toast';
import { Artwork } from '../components/Cards';
import { CacheAllButton } from '../components/CacheAllButton';
import { TrackRow } from '../components/TrackRow';
import { RowSkeleton, Skeleton } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';

export function Playlist() {
  const { id = '' } = useParams();
  const [playlist, setPlaylist] = useState<PlaylistT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSaved = useLibrary((s) => s.isSaved('playlist', id));
  const toggleSave = useLibrary((s) => s.toggleSave);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .playlist(id)
      .then((p) => {
        if (!cancelled) setPlaylist(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Playlist failed to load.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-4">
          <Skeleton className="h-40 w-40 !rounded-2xl" />
          <div className="flex-1 space-y-2 pt-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (error || !playlist) return <ErrorState message={error ?? 'Playlist unavailable.'} onRetry={() => window.location.reload()} />;

  const tracks = playlist.tracks ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Artwork art={playlist.artwork} title={playlist.title} className="h-40 w-40 text-5xl" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-ink-tertiary">Playlist</p>
          <h1 className="text-2xl font-bold tracking-tight">{playlist.title}</h1>
          {playlist.description ? <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">{playlist.description}</p> : null}
          <p className="mt-1 text-xs text-ink-tertiary">
            {[playlist.author, tracks.length > 0 ? `${tracks.length} tracks` : ''].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={tracks.length === 0}
              onClick={() => playAll(tracks)}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              Play
            </button>
            <button
              type="button"
              disabled={tracks.length === 0}
              onClick={() => playAll(tracks, { shuffle: true })}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => {
                toggleSave('playlist', playlist.id, playlist.title);
                toast(isSaved ? 'Removed from library' : 'Playlist saved', 'success');
              }}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              {isSaved ? 'Saved ✓' : 'Save'}
            </button>
            <CacheAllButton tracks={tracks} />
          </div>
        </div>
      </header>
      {tracks.length === 0 ? (
        <EmptyState title="No tracks listed" hint="This playlist didn't expose its items. Try opening it from search again." />
      ) : (
        <ul className="space-y-1">
          {tracks.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
