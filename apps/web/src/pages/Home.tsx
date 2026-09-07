import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { HomeFeed, Track } from '@zabify/shared';
import { api } from '../lib/api';
import { useHistory } from '../stores/history';
import { EmptyState, ErrorState } from '../components/StateViews';
import { RowSkeleton } from '../components/Skeleton';
import { Carousel, EntityCard } from '../components/Cards';
import { TrackRow } from '../components/TrackRow';

const MOOD_GRADIENTS = [
  'from-teal-500/30 to-cyan-500/10',
  'from-violet-500/30 to-fuchsia-500/10',
  'from-amber-500/30 to-orange-500/10',
  'from-sky-500/30 to-blue-500/10',
  'from-rose-500/30 to-pink-500/10',
];

export function Home() {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const history = useHistory((s) => s.entries);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setFeed(await api.home());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Home feed failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded bg-white/10" />
        {Array.from({ length: 6 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const continueListening: Track[] = [];
  {
    const seen = new Set<string>();
    for (const e of history) {
      if (seen.has(e.track.id)) continue;
      seen.add(e.track.id);
      continueListening.push(e.track);
      if (continueListening.length >= 10) break;
    }
  }
  const picks = feed?.quickPicks ?? [];
  const charts = feed?.charts ?? [];
  const releases = feed?.newReleases ?? [];
  const playlists = feed?.playlists ?? [];
  const moods = feed?.moods ?? [];
  const empty = picks.length === 0 && charts.length === 0 && releases.length === 0 && playlists.length === 0 && continueListening.length === 0;

  if (empty) {
    return (
      <div className="space-y-5">
        <EmptyState title="Welcome to Zabify" hint="Search for your favorite songs to get started. Your home feed will appear here." />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black"
          >
            Search music
          </button>
        </div>
        {moods.length > 0 ? <Moods moods={moods} /> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {continueListening.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h1 className="text-xl font-semibold tracking-tight">Continue listening</h1>
            <Link to="/history" className="text-xs text-ink-tertiary hover:text-accent">Full history →</Link>
          </div>
          <ul className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {continueListening.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {picks.length > 0 ? (
        <section>
          <h1 className="mb-3 text-xl font-semibold tracking-tight">Quick picks</h1>
          <ul className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
            {picks.slice(0, 10).map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {charts.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight">Charts</h2>
          <ul className="space-y-1">
            {charts.slice(0, 10).map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} />
            ))}
          </ul>
        </section>
      ) : null}

      {releases.length > 0 ? (
        <Carousel title="New releases">
          {releases.map((a) => (
            <EntityCard
              key={a.id}
              to={`/album/${a.id}`}
              title={a.title}
              subtitle={[a.artist.name !== 'Unknown' ? a.artist.name : '', a.year ? String(a.year) : ''].filter(Boolean).join(' · ') || undefined}
              art={a.artwork}
            />
          ))}
        </Carousel>
      ) : null}

      {playlists.length > 0 ? (
        <Carousel title="Featured playlists">
          {playlists.map((p) => (
            <EntityCard key={p.id} to={`/playlist/${p.id}`} title={p.title} subtitle="Playlist" art={p.artwork} />
          ))}
        </Carousel>
      ) : null}

      {moods.length > 0 ? <Moods moods={moods} /> : null}
    </div>
  );
}

function Moods({ moods }: { moods: { id: string; title: string }[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold tracking-tight">Moods & genres</h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {moods.map((m, i) => (
          <Link
            key={m.id}
            to={`/search?q=${encodeURIComponent(m.title + ' music')}`}
            className={`rounded-xl bg-gradient-to-br p-3 text-left hover:brightness-125 ${MOOD_GRADIENTS[i % MOOD_GRADIENTS.length]}`}
          >
            <span className="text-sm font-semibold">{m.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
