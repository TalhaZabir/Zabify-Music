import { describe, expect, it } from 'vitest';
import { sleepLabel } from './sleep';

describe('sleepLabel', () => {
  it('reports off state', () => {
    expect(sleepLabel(null, false)).toBe('Off');
  });

  it('reports end-of-track mode', () => {
    expect(sleepLabel(null, true)).toBe('End of track');
  });

  it('formats remaining time', () => {
    const now = Date.now();
    expect(sleepLabel(now + 15 * 60_000, false)).toMatch(/^15m/);
    expect(sleepLabel(now + 5_000, false)).toMatch(/s left$/);
  });
});
