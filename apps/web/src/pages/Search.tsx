import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SearchResult } from '@zabify/shared';
import { api } from '../lib/api';
import { artistsLabel } from '../lib/format';
import { EmptyState, ErrorState } from '../components/StateViews';
import { RowSkeleton } from '../components/Skeleton';
import { Artwork, Carousel, EntityCard } from '../components/Cards';
import { TrackRow } from '../components/TrackRow';

export function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState((params.get('q') ?? '').trim());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = q.trim();
      setDebounced(v);
      setParams(v ? { q: v } : {}, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [q, setParams]);

  useEffect(() => {
    if (!debounced) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .search(debounced)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const hasAny =
    result &&
    (result.tracks.length > 0 ||
      result.artists.length > 0 ||
      result.albums.length > 0 ||
      result.playlists.length > 0 ||
      result.videos.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search songs, artists, albums…"
        aria-label="Search music"
        autoFocus
        className="w-full rounded-lg border border-white/10 bg-base-900 px-4 py-2.5 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
      />
      {loading ? (
        <div className="space-y-1" aria-label="Loading results">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && debounced && result && !hasAny ? (
        <EmptyState title="No results" hint={`Nothing found for “${debounced}”. Try a different spelling.`} />
      ) : null}
      {!loading && !error && !debounced ? (
        <EmptyState title="Search Zabify" hint="Results appear as you type. Right-click any song for play-next, queue, like and share actions." />
      ) : null}

      {!loading && result && result.tracks.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">Songs</h2>
          <ul className="space-y-1">
            {result.tracks.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && result && result.artists.length > 0 ? (
        <Carousel title="Artists">
          {result.artists.map((a) => (
            <EntityCard key={a.id} to={`/artist/${a.id}`} title={a.name} subtitle="Artist" art={a.artwork} />
          ))}
        </Carousel>
      ) : null}

      {!loading && result && result.albums.length > 0 ? (
        <Carousel title="Albums">
          {result.albums.map((a) => (
            <EntityCard
              key={a.id}
              to={`/album/${a.id}`}
              title={a.title}
              subtitle={[a.artist.name !== 'Unknown' ? a.artist.name : '', a.year ? String(a.year) : ''].filter(Boolean).join(' · ') || 'Album'}
              art={a.artwork}
            />
          ))}
        </Carousel>
      ) : null}

      {!loading && result && result.playlists.length > 0 ? (
        <Carousel title="Playlists">
          {result.playlists.map((p) => (
            <EntityCard key={p.id} to={`/playlist/${p.id}`} title={p.title} subtitle="Playlist" art={p.artwork} />
          ))}
        </Carousel>
      ) : null}

      {!loading && result && result.videos.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">Videos</h2>
          <ul className="space-y-1">
            {result.videos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
                <Artwork art={v.artwork} title={v.title} className="h-11 w-16 text-lg" rounded="rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="truncate text-xs text-ink-secondary">{artistsLabel(v.artists)}</p>
                </div>
                <Link to={`/search?q=${encodeURIComponent(v.title)}`} className="rounded-md border border-white/10 px-3 py-1 text-xs hover:bg-white/10">
                  Find song
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
