import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Artist as ArtistT } from '@zabify/shared';
import { api } from '../lib/api';
import { playAll } from '../lib/playAll';
import { useLibrary } from '../stores/library';
import { toast } from '../stores/toast';
import { Artwork, Carousel, EntityCard } from '../components/Cards';
import { TrackRow } from '../components/TrackRow';
import { RowSkeleton, Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/StateViews';

export function Artist() {
  const { id = '' } = useParams();
  const [artist, setArtist] = useState<ArtistT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSaved = useLibrary((s) => s.isSaved('artist', id));
  const toggleSave = useLibrary((s) => s.toggleSave);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .artist(id)
      .then((a) => {
        if (!cancelled) setArtist(a);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Artist failed to load.');
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
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-36 w-36 !rounded-2xl" />
          <div className="flex-1 space-y-2 pt-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (error || !artist) return <ErrorState message={error ?? 'Artist unavailable.'} onRetry={() => window.location.reload()} />;

  const top = artist.topTracks ?? [];
  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Artwork art={artist.artwork} title={artist.name} className="h-36 w-36 text-5xl" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-ink-tertiary">Artist</p>
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{artist.name}</h1>
          {artist.description ? <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">{artist.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={top.length === 0}
              onClick={() => playAll(top)}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              Play
            </button>
            <button
              type="button"
              disabled={top.length === 0}
              onClick={() => playAll(top, { shuffle: true })}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => {
                toggleSave('artist', artist.id, artist.name);
                toast(isSaved ? 'Removed from library' : 'Artist saved', 'success');
              }}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              {isSaved ? 'Saved ✓' : 'Follow'}
            </button>
          </div>
        </div>
      </header>

      {top.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-semibold">Top songs</h2>
          <ul className="space-y-1">
            {top.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {(artist.albums ?? []).length > 0 ? (
        <Carousel title="Albums & singles">
          {(artist.albums ?? []).map((al) => (
            <EntityCard key={al.id} to={`/album/${al.id}`} title={al.title} subtitle={al.year ? String(al.year) : undefined} art={al.artwork} />
          ))}
        </Carousel>
      ) : null}

      {(artist.related ?? []).length > 0 ? (
        <Carousel title="Fans also like">
          {(artist.related ?? []).map((r) => (
            <EntityCard key={r.id} to={`/artist/${r.id}`} title={r.name} art={r.artwork} />
          ))}
        </Carousel>
      ) : null}

      <p className="text-xs text-ink-tertiary">
        <Link to="/search" className="underline">Search</Link> for more from {artist.name}.
      </p>
    </div>
  );
}
