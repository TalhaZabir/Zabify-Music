import { useState } from 'react';
import { Modal } from './Modal';
import { useUi } from '../stores/ui';
import { usePlaylists } from '../stores/playlists';
import { toast } from '../stores/toast';

export function AddToPlaylistModal() {
  const track = useUi((s) => s.addToPlaylistTrack);
  const close = useUi((s) => s.setAddToPlaylistTrack);
  const playlists = usePlaylists((s) => s.playlists);
  const create = usePlaylists((s) => s.create);
  const addTracks = usePlaylists((s) => s.addTracks);
  const [name, setName] = useState('');

  function add(id: string, playlistName: string): void {
    if (!track) return;
    const added = addTracks(id, [track]);
    toast(added > 0 ? `Added to “${playlistName}”` : 'Already in that playlist', added > 0 ? 'success' : 'info');
    close(null);
    setName('');
  }

  return (
    <Modal open={track !== null} title={track ? `Add “${track.title}” to…` : 'Add to playlist'} onClose={() => { close(null); setName(''); }}>
      {playlists.length === 0 ? <p className="mb-3 text-sm text-ink-secondary">You have no playlists yet — create one below.</p> : null}
      <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto">
        {playlists.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => add(p.id, p.name)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <span className="truncate font-medium">{p.name}</span>
              <span className="ml-2 shrink-0 text-xs text-ink-tertiary">{p.tracks.length}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              const pl = create(name);
              setName('');
              add(pl.id, pl.name);
            }
          }}
          placeholder="New playlist name"
          aria-label="New playlist name"
          maxLength={80}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-base-950 px-3 py-2 text-sm outline-none placeholder:text-ink-tertiary focus:border-accent"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => {
            const pl = create(name);
            setName('');
            add(pl.id, pl.name);
          }}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Create
        </button>
      </div>
    </Modal>
  );
}
