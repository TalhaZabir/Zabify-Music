import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from './lru';

describe('TtlCache', () => {
  it('returns misses for unknown keys', () => {
    const c = new TtlCache<string>();
    expect(c.get('nope')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    try {
      const c = new TtlCache<string>(10, 1000);
      c.set('k', 'v');
      expect(c.get('k')).toBe('v');
      vi.advanceTimersByTime(1001);
      expect(c.get('k')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest when full', () => {
    const c = new TtlCache<string>(2, 60_000);
    c.set('a', '1');
    c.set('b', '2');
    c.set('c', '3');
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe('2');
    expect(c.get('c')).toBe('3');
  });
});
