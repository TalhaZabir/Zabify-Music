import { useHistory } from '../stores/history';
import { toast } from '../stores/toast';
import { EmptyState } from '../components/StateViews';
import { TrackRow } from '../components/TrackRow';

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function History() {
  const entries = useHistory((s) => s.entries);
  const clear = useHistory((s) => s.clear);

  if (entries.length === 0) {
    return <EmptyState title="No history yet" hint="Songs you play will appear here. History stays on this device." />;
  }

  // Group by calendar day for scannability.
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const day = new Date(e.playedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const g = groups.get(day) ?? [];
    g.push(e);
    groups.set(day, g);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">History</h1>
        <button
          type="button"
          onClick={() => {
            clear();
            toast('History cleared');
          }}
          className="rounded-lg border border-white/15 px-3.5 py-1.5 text-xs text-ink-secondary hover:bg-white/10 hover:text-ink"
        >
          Clear history
        </button>
      </div>
      {Array.from(groups.entries()).map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-tertiary">{day}</h2>
          <ul className="space-y-1">
            {list.map((e) => (
              <li key={`${e.playedAt}-${e.track.id}`}>
                <TrackRow track={e.track} />
                <p className="-mt-1 pb-1 pl-11 text-[11px] text-ink-tertiary">{timeAgo(e.playedAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
