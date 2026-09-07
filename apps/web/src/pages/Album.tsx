import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Album as AlbumT } from '@zabify/shared';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import { playAll } from '../lib/playAll';
import { useLibrary } from '../stores/library';
import { toast } from '../stores/toast';
import { Artwork } from '../components/Cards';
import { CacheAllButton } from '../components/CacheAllButton';
import { TrackRow } from '../components/TrackRow';
import { RowSkeleton, Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/StateViews';

export function Album() {
  const { id = '' } = useParams();
  const [album, setAlbum] = useState<AlbumT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSaved = useLibrary((s) => s.isSaved('album', id));
  const toggleSave = useLibrary((s) => s.toggleSave);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .album(id)
      .then((a) => {
        if (!cancelled) setAlbum(a);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Album failed to load.');
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
  if (error || !album) return <ErrorState message={error ?? 'Album unavailable.'} onRetry={() => window.location.reload()} />;

  const tracks = album.tracks ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Artwork art={album.artwork} title={album.title} className="h-40 w-40 text-5xl" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-ink-tertiary">Album</p>
          <h1 className="text-2xl font-bold tracking-tight">{album.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            {album.artist.id ? <Link to={`/artist/${album.artist.id}`} className="text-ink hover:text-accent">{album.artist.name}</Link> : album.artist.name}
            {album.year ? ` · ${album.year}` : ''}
            {tracks.length > 0 ? ` · ${tracks.length} tracks` : ''}
            {album.durationSec ? ` · ${formatTime(album.durationSec * 1000)}` : ''}
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
                toggleSave('album', album.id, album.title);
                toast(isSaved ? 'Removed from library' : 'Album saved', 'success');
              }}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              {isSaved ? 'Saved ✓' : 'Save'}
            </button>
            <CacheAllButton tracks={tracks} />
          </div>
        </div>
      </header>
      <ul className="space-y-1">
        {tracks.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} track={t} index={i} />
        ))}
      </ul>
    </div>
  );
}
