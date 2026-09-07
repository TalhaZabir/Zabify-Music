import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@zabify/shared';

vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
});

const { useQueue } = await import('./queue');

const t = (id: string): Track => ({ id, title: id, artists: [{ id: '', name: 'A' }] });

describe('queue', () => {
  beforeEach(() => {
    useQueue.setState({ items: [], index: 0 });
  });

  it('enqueues and reports current', () => {
    useQueue.getState().enqueue(t('a'));
    useQueue.getState().enqueue(t('b'));
    expect(useQueue.getState().current()?.track.id).toBe('a');
  });

  it('playNext inserts after current index', () => {
    useQueue.getState().enqueue(t('a'));
    useQueue.getState().enqueue(t('b'));
    useQueue.getState().playNext(t('x'));
    expect(useQueue.getState().items.map((i) => i.track.id)).toEqual(['a', 'x', 'b']);
  });

  it('replace sets items and clamps index', () => {
    useQueue.getState().replace([t('a'), t('b'), t('c')], 5);
    expect(useQueue.getState().index).toBe(2);
    expect(useQueue.getState().current()?.track.id).toBe('c');
  });

  it('appendAuto dedupes and marks origin', async () => {
    const { isAuto } = await import('./queue');
    useQueue.getState().enqueue(t('a'));
    expect(useQueue.getState().appendAuto([t('a'), t('b')])).toBe(1);
    const items = useQueue.getState().items;
    expect(items).toHaveLength(2);
    expect(isAuto(items[0]!)).toBe(false);
    expect(isAuto(items[1]!)).toBe(true);
    expect(useQueue.getState().upcomingAuto()).toBe(1);
  });
});
