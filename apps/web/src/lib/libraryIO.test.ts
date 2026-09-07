import { describe, expect, it } from 'vitest';
import { parseLibraryImport } from './libraryIO';

describe('library import validation', () => {
  it('rejects wrong versions and garbage', () => {
    expect(() => parseLibraryImport(null)).toThrow();
    expect(() => parseLibraryImport({ version: 99 })).toThrow();
  });

  it('cleans tracks and drops invalid entries', () => {
    const data = parseLibraryImport({
      version: 1,
      likedTracks: [
        { id: 'a', title: 'A', artists: [{ id: '', name: 'X' }], durationSec: 200 },
        { id: '', title: '' },
        'junk',
      ],
      playlists: [{ name: ' Mix ', tracks: [{ id: 'b', title: 'B' }] }, { name: '   ' }],
      albums: [{ id: 'x', name: 'Y' }, { id: 5 }],
      artists: [],
      settings: { accent: '#ff0000', quality: 'high' },
    });
    expect(data.likedTracks).toHaveLength(1);
    expect(data.likedTracks[0]?.artists[0]?.name).toBe('X');
    expect(data.playlists).toHaveLength(1);
    expect(data.playlists[0]?.name).toBe('Mix');
    expect(data.albums).toHaveLength(1);
    expect(data.settings).toEqual({ accent: '#ff0000', quality: 'high' });
  });

  it('rejects bad accent and quality', () => {
    const data = parseLibraryImport({ version: 1, settings: { accent: 'red', quality: 'ultra' } });
    expect(data.settings).toEqual({});
  });
});
