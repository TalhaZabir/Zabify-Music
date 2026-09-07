import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@zabify/shared';

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
});

const { usePlaylists } = await import('./playlists');

const t = (id: string, title: string): Track => ({ id, title, artists: [{ id: '', name: 'A' }] });

describe('user playlists', () => {
  beforeEach(() => {
    usePlaylists.setState({ playlists: [] });
  });

  it('creates playlists with trimmed names', () => {
    const pl = usePlaylists.getState().create('  Mix  ');
    expect(pl.name).toBe('Mix');
    expect(usePlaylists.getState().playlists).toHaveLength(1);
  });

  it('adds tracks without duplicates', () => {
    const pl = usePlaylists.getState().create('Mix');
    expect(usePlaylists.getState().addTracks(pl.id, [t('a', 'A'), t('b', 'B')])).toBe(2);
    expect(usePlaylists.getState().addTracks(pl.id, [t('a', 'A'), t('c', 'C')])).toBe(1);
    expect(usePlaylists.getState().get(pl.id)?.tracks).toHaveLength(3);
  });

  it('reorders tracks with moveTrack', () => {
    const pl = usePlaylists.getState().create('Mix');
    usePlaylists.getState().addTracks(pl.id, [t('a', 'A'), t('b', 'B'), t('c', 'C')]);
    usePlaylists.getState().moveTrack(pl.id, 0, 2);
    expect(usePlaylists.getState().get(pl.id)?.tracks.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    // out-of-range moves are no-ops
    usePlaylists.getState().moveTrack(pl.id, 0, 9);
    expect(usePlaylists.getState().get(pl.id)?.tracks.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('removes tracks and playlists', () => {
    const pl = usePlaylists.getState().create('Mix');
    usePlaylists.getState().addTracks(pl.id, [t('a', 'A'), t('b', 'B')]);
    usePlaylists.getState().removeTrack(pl.id, 'a');
    expect(usePlaylists.getState().get(pl.id)?.tracks.map((x) => x.id)).toEqual(['b']);
    usePlaylists.getState().remove(pl.id);
    expect(usePlaylists.getState().playlists).toHaveLength(0);
  });
});
