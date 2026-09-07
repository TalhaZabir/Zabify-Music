// Tiny TTL LRU — no extra dependency for Phase 1.
export class TtlCache<T> {
  private map = new Map<string, { value: T; expires: number }>();
  constructor(
    private maxEntries = 500,
    private defaultTtlMs = 300_000,
  ) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }
}
