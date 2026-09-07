import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lyrics } from '@zabify/shared';
import { api } from '../lib/api';
import { Skeleton } from './Skeleton';

type Status = { kind: 'loading' } | { kind: 'ready'; lyrics: Lyrics } | { kind: 'empty' } | { kind: 'error'; message: string };

export function LyricsPane({
  trackId,
  trackTitle,
  positionMs,
}: {
  trackId: string | null;
  trackTitle: string;
  positionMs?: number;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const cache = useRef(new Map<string, Lyrics | null>());

  useEffect(() => {
    if (!trackId) {
      setStatus({ kind: 'empty' });
      return;
    }
    const cached = cache.current.get(trackId);
    if (cached !== undefined) {
      setStatus(cached && (cached.plain || (cached.lines ?? []).length > 0) ? { kind: 'ready', lyrics: cached } : { kind: 'empty' });
      return;
    }
    let cancelled = false;
    setStatus({ kind: 'loading' });
    api
      .lyrics(trackId)
      .then((l) => {
        if (cancelled) return;
        cache.current.set(trackId, l);
        if (l.plain || (l.lines ?? []).length > 0) setStatus({ kind: 'ready', lyrics: l });
        else setStatus({ kind: 'empty' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        cache.current.set(trackId, null);
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Lyrics failed to load.' });
      });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const lines = useMemo(() => (status.kind === 'ready' ? (status.lyrics.lines ?? []) : []), [status]);
  const active = useMemo(() => {
    if (lines.length === 0 || positionMs === undefined) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if ((lines[i]?.startMs ?? 0) <= positionMs) idx = i;
      else break;
    }
    return idx;
  }, [lines, positionMs]);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, trackId]);

  if (!trackId) {
    return <p className="py-10 text-center text-sm text-ink-tertiary">Play something to see its lyrics.</p>;
  }
  if (status.kind === 'loading') {
    return (
      <div className="space-y-2.5 pt-2" aria-label="Loading lyrics">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-4" />
        ))}
      </div>
    );
  }
  if (status.kind === 'empty') {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium">No lyrics for “{trackTitle}”</p>
        <p className="mt-1 text-xs text-ink-tertiary">Lyrics aren&apos;t available for every track.</p>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium">Couldn&apos;t load lyrics.</p>
        <p className="mt-1 text-xs text-ink-tertiary">{status.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1 pb-6">
      {status.lyrics.synced ? (
        <p className="pb-2 text-[11px] uppercase tracking-widest text-accent">Synced</p>
      ) : null}
      {lines.length > 0 ? (
        lines.map((l, i) => (
          <p
            key={i}
            ref={i === active ? activeRef : undefined}
            className={`whitespace-pre-wrap rounded px-1 text-[15px] leading-7 transition-colors ${
              i === active ? 'bg-accent-soft font-semibold text-ink' : 'text-ink-secondary'
            }`}
          >
            {l.text}
          </p>
        ))
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-7">{status.lyrics.plain}</p>
      )}
      {status.lyrics.source ? <p className="pt-3 text-[11px] text-ink-tertiary">Source: {status.lyrics.source}</p> : null}
    </div>
  );
}
