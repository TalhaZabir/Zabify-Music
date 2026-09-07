import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlaylists } from '../stores/playlists';
import { playAll } from '../lib/playAll';
import { toast } from '../stores/toast';
import { artistsLabel, formatTime } from '../lib/format';
import { openTrackMenu } from '../lib/trackMenu';
import { menuFromEvent } from '../components/ContextMenu';
import { EmptyState } from '../components/StateViews';

export function LocalPlaylist() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const pl = usePlaylists((s) => s.playlists.find((p) => p.id === id));
  const rename = usePlaylists((s) => s.rename);
  const remove = usePlaylists((s) => s.remove);
  const removeTrack = usePlaylists((s) => s.removeTrack);
  const moveTrack = usePlaylists((s) => s.moveTrack);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!pl) {
    return (
      <EmptyState
        title="Playlist not found"
        hint="It may have been deleted on another device. Your library is stored locally in this browser."
      />
    );
  }

  const playlistId = pl.id;
  function saveName(): void {
    if (draft.trim()) {
      rename(playlistId, draft);
      toast('Playlist renamed', 'success');
    }
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-ink-tertiary">Your playlist</p>
          {editing ? (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={saveName}
              autoFocus
              maxLength={80}
              aria-label="Playlist name"
              className="mt-1 w-full rounded-lg border border-accent bg-base-900 px-2.5 py-1.5 text-xl font-bold outline-none"
            />
          ) : (
            <h1 className="truncate text-2xl font-bold tracking-tight">{pl.name}</h1>
          )}
          <p className="mt-1 text-xs text-ink-tertiary">
            {pl.tracks.length} track{pl.tracks.length === 1 ? '' : 's'}
            {pl.tracks.some((t) => t.durationSec) ? ` · ${formatTime(pl.tracks.reduce((a, t) => a + (t.durationSec ?? 0), 0) * 1000)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(pl.name);
            setEditing(true);
          }}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10"
        >
          Rename
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pl.tracks.length === 0}
          onClick={() => playAll(pl.tracks)}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Play
        </button>
        <button
          type="button"
          disabled={pl.tracks.length === 0}
          onClick={() => playAll(pl.tracks, { shuffle: true })}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={() => {
            remove(pl.id);
            toast('Playlist deleted');
            navigate('/library');
          }}
          className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
        >
          Delete
        </button>
      </div>

      {pl.tracks.length === 0 ? (
        <EmptyState title="Empty playlist" hint="Add songs from any track menu (right-click or ⋯ → Add to playlist)." />
      ) : (
        <ul className="space-y-1">
          {pl.tracks.map((t, i) => (
            <PlaylistRow
              key={`${t.id}-${i}`}
              trackId={t.id}
              title={t.title}
              subtitle={`${artistsLabel(t.artists)}${t.durationSec ? ` · ${formatTime(t.durationSec * 1000)}` : ''}`}
              index={i}
              isFirst={i === 0}
              isLast={i === pl.tracks.length - 1}
              onPlay={() => {
                const full = usePlaylists.getState().get(pl.id)?.tracks ?? [];
                playAll(full, { startIndex: i });
              }}
              onRemove={() => {
                removeTrack(pl.id, t.id, i);
                toast('Removed from playlist');
              }}
              onMove={(dir) => moveTrack(pl.id, i, i + dir)}
              onMenu={(x, y) => {
                const full = t;
                openTrackMenu(x, y, full);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaylistRow(props: {
  trackId: string;
  title: string;
  subtitle: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onMenu: (x: number, y: number) => void;
}) {
  return (
    <li
      className="group flex items-center gap-1.5 rounded-lg p-2 hover:bg-white/5"
      onContextMenu={(e) => {
        const { x, y } = menuFromEvent(e);
        props.onMenu(x, y);
      }}
    >
      <span className="w-6 shrink-0 text-center text-xs text-ink-tertiary">{props.index + 1}</span>
      <button type="button" onClick={props.onPlay} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium">{props.title}</p>
        <p className="truncate text-xs text-ink-secondary">{props.subtitle}</p>
      </button>
      <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
        <button type="button" aria-label="Move up" disabled={props.isFirst} onClick={() => props.onMove(-1)} className="rounded px-1.5 py-1 text-xs hover:bg-white/10 disabled:opacity-30">
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={props.isLast} onClick={() => props.onMove(1)} className="rounded px-1.5 py-1 text-xs hover:bg-white/10 disabled:opacity-30">
          ↓
        </button>
        <button type="button" aria-label={`Remove ${props.title}`} onClick={props.onRemove} className="rounded px-1.5 py-1 text-xs text-ink-tertiary hover:bg-white/10 hover:text-red-400">
          ✕
        </button>
      </div>
    </li>
  );
}
