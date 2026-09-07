import { describe, expect, it } from 'vitest';
import { LyricsChain, parseLrc } from './lyrics';

describe('parseLrc', () => {
  it('parses timestamps and skips metadata', () => {
    const l = parseLrc('t', '[00:12.00]Hello\n[ar:Someone]\n[01:02.5]World\n\nnope', 's');
    expect(l?.lines).toHaveLength(2);
    expect(l?.lines?.[0]).toMatchObject({ startMs: 12000, text: 'Hello' });
    expect(l?.lines?.[1]).toMatchObject({ startMs: 62500, text: 'World' });
    expect(l?.synced).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(parseLrc('t', 'just some text\nno tags', 's')).toBeNull();
  });
});

describe('LyricsChain', () => {
  const track = { id: 't', title: 'T', artists: [{ id: '', name: 'A' }] };

  it('prefers synced over earlier plain results', async () => {
    const chain = new LyricsChain([
      { name: 'plain', search: async () => ({ trackId: 't', plain: 'hi', synced: false }) },
      {
        name: 'sync',
        search: async () => ({ trackId: 't', lines: [{ startMs: 0, text: 'hi' }], synced: true }),
      },
    ]);
    const r = await chain.resolve(track);
    expect(r?.synced).toBe(true);
  });

  it('falls back across failing providers', async () => {
    const chain = new LyricsChain([
      { name: 'boom', search: async () => { throw new Error('down'); } },
      { name: 'empty', search: async () => null },
      { name: 'plain', search: async () => ({ trackId: 't', plain: 'hi', synced: false }) },
    ]);
    expect((await chain.resolve(track))?.plain).toBe('hi');
  });
});
