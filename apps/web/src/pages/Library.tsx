import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibrary } from '../stores/library';
import { usePlaylists } from '../stores/playlists';
import { toast } from '../stores/toast';
import { EmptyState } from '../components/StateViews';
import { TrackRow } from '../components/TrackRow';
import { DownloadsTab } from '../components/DownloadsTab';
import { Modal } from '../components/Modal';

type Tab = 'songs' | 'playlists' | 'albums' | 'artists' | 'downloads';

export function Library() {
  const [tab, setTab] = useState<Tab>('songs');
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Your library</h1>
      <div className="flex gap-1.5" role="tablist" aria-label="Library sections">
        {(
          [
            ['songs', 'Liked songs'],
            ['playlists', 'Playlists'],
            ['albums', 'Albums'],
            ['artists', 'Artists'],
            ['downloads', 'Offline'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.5 py-1.5 text-sm ${tab === t ? 'bg-white/15 text-ink' : 'text-ink-secondary hover:bg-white/5 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'songs' ? <LikedSongs /> : tab === 'playlists' ? <UserPlaylists onOpen={(id) => navigate(`/library/playlists/${id}`)} /> : tab === 'albums' ? <SavedList kind="album" /> : tab === 'artists' ? <SavedList kind="artists" /> : <DownloadsTab />}
    </div>
  );
}

function LikedSongs() {
  const ids = useLibrary((s) => s.likedTrackIds);
  const tracks = useLibrary((s) => s.likedTracks);
  if (ids.length === 0) {
    return <EmptyState title="No liked songs yet" hint="Tap the heart on any song and it will appear here." />;
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Link to="/library/liked" className="text-xs text-ink-tertiary hover:text-accent">Sort, filter & manage →</Link>
      </div>
    <ul className="space-y-1">
      {ids.map((id, i) => {
        const t = tracks[id];
        if (!t) {
          return (
            <li key={id} className="rounded-lg p-2 text-sm text-ink-tertiary">
              {id} <span className="text-xs">(metadata unavailable offline)</span>
            </li>
          );
        }
        return <TrackRow key={id} track={t} index={i} />;
      })}
    </ul>
    </div>
  );
}

function UserPlaylists({ onOpen }: { onOpen: (id: string) => void }) {
  const playlists = usePlaylists((s) => s.playlists);
  const create = usePlaylists((s) => s.create);
  const remove = usePlaylists((s) => s.remove);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function submit(): void {
    if (!name.trim()) return;
    const pl = create(name);
    setName('');
    setCreating(false);
    toast(`Playlist “${pl.name}” created`, 'success');
    onOpen(pl.id);
  }

  if (playlists.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState title="No playlists yet" hint="Create playlists and add songs from any track menu." />
        <div className="flex justify-center">
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-black">
            New playlist
          </button>
        </div>
        <CreateModal open={creating} name={name} setName={setName} onClose={() => setCreating(false)} onSubmit={submit} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setCreating(true)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
          + New playlist
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {playlists.map((p) => (
          <li key={p.id} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-base-900 p-3 hover:border-white/20">
            <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-ink-tertiary">{p.tracks.length} track{p.tracks.length === 1 ? '' : 's'}</p>
            </button>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={() => setConfirmDelete(p.id)}
              className="rounded-md px-2 py-1 text-xs text-ink-tertiary opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <CreateModal open={creating} name={name} setName={setName} onClose={() => setCreating(false)} onSubmit={submit} />
      <Modal open={confirmDelete !== null} title="Delete playlist?" onClose={() => setConfirmDelete(null)}>
        <p className="text-sm text-ink-secondary">This removes the playlist from your library. Liked songs are unaffected.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
            Keep
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmDelete) remove(confirmDelete);
              setConfirmDelete(null);
              toast('Playlist deleted');
            }}
            className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-white"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function CreateModal({
  open, name, setName, onClose, onSubmit,
}: {
  open: boolean; name: string; setName: (v: string) => void; onClose: () => void; onSubmit: () => void;
}) {
  return (
    <Modal open={open} title="New playlist" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder="Playlist name"
        aria-label="Playlist name"
        maxLength={80}
        className="w-full rounded-lg border border-white/10 bg-base-950 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
      />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">
          Cancel
        </button>
        <button type="button" onClick={onSubmit} disabled={!name.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
          Create
        </button>
      </div>
    </Modal>
  );
}

function SavedList({ kind }: { kind: 'album' | 'artists' }) {
  const ids = useLibrary((s) => (kind === 'album' ? s.savedAlbums : s.savedArtists));
  const meta = useLibrary((s) => s.savedMeta);
  const toggleSave = useLibrary((s) => s.toggleSave);
  const singular = kind === 'album' ? 'albums' : 'artists';
  if (ids.length === 0) {
    return <EmptyState title={`No saved ${singular}`} hint={`Open any ${kind} and press ${kind === 'album' ? 'Save' : 'Follow'} to pin it here.`} />;
  }
  return (
    <ul className="space-y-1">
      {ids.map((id) => (
        <li key={id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
          <Link to={`/${kind === 'album' ? 'album' : 'artist'}/${id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">
            {meta[id]?.name ?? id}
          </Link>
          <button
            type="button"
            onClick={() => {
              toggleSave(kind === 'album' ? 'album' : 'artist', id);
              toast('Removed from library');
            }}
            className="rounded-md px-2 py-1 text-xs text-ink-tertiary hover:bg-white/10 hover:text-ink"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
