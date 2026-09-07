export interface Env {
  port: number;
  host: string;
  corsOrigin: string;
  cacheTtlSearchSec: number;
  cacheTtlMetadataSec: number;
  cacheTtlLyricsSec: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadEnv(): Env {
  return {
    port: num(process.env.PORT, 8788),
    host: process.env.HOST ?? '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
    cacheTtlSearchSec: num(process.env.CACHE_TTL_SEARCH_SEC, 300),
    cacheTtlMetadataSec: num(process.env.CACHE_TTL_METADATA_SEC, 3600),
    cacheTtlLyricsSec: num(process.env.CACHE_TTL_LYRICS_SEC, 3600),
    rateLimitMax: num(process.env.RATE_LIMIT_MAX, 120),
    rateLimitWindowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  };
}
