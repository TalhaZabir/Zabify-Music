import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TtlCache } from '../cache/lru.js';
import { YouTubeMusicProvider } from '../providers/ytmusic/provider.js';
import { sendError, toSafeMessage } from '../utils/errors.js';
import type { Env } from '../env.js';

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['all', 'songs', 'artists', 'albums', 'playlists', 'videos']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

const idParam = z.object({ id: z.string().min(1).max(128).regex(/^[^<>"]+$/) });

export async function musicRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const provider = new YouTubeMusicProvider();
  const searchCache = new TtlCache(env.cacheTtlSearchSec * 1000);
  const metaCache = new TtlCache(env.cacheTtlMetadataSec * 1000);

  app.get('/api/search', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_QUERY', 'Invalid search query.');
    const { q, type, limit } = parsed.data;
    const key = `search:${type}:${limit}:${q.toLowerCase()}`;
    const hit = searchCache.get(key);
    if (hit) return reply.header('x-cache', 'HIT').send(hit);
    try {
      const res = await provider.search(q, { type, limit });
      searchCache.set(key, res);
      return reply.header('x-cache', 'MISS').send(res);
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'search failed');
      return sendError(reply, 502, 'SEARCH_FAILED', 'Search is temporarily unavailable.');
    }
  });

  app.get('/api/tracks/:id', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    const key = `track:${p.data.id}`;
    const hit = metaCache.get(key);
    if (hit) return reply.header('x-cache', 'HIT').send(hit);
    try {
      const t = await provider.getTrack(p.data.id);
      metaCache.set(key, t);
      return reply.header('x-cache', 'MISS').send(t);
    } catch {
      return sendError(reply, 404, 'TRACK_UNAVAILABLE', 'The requested track is currently unavailable.');
    }
  });

  app.get('/api/tracks/:id/stream', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    const qs = z.object({ quality: z.enum(['low', 'medium', 'high', 'auto']).default('auto') }).safeParse(req.query);
    if (!qs.success) return sendError(reply, 400, 'INVALID_QUERY', 'Invalid quality.');
    try {
      // Intentionally never cached — stream URLs are short-lived.
      const s = await provider.getStream(p.data.id, { quality: qs.data.quality });
      return reply.send(s);
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'stream failed');
      return sendError(reply, 404, 'TRACK_UNAVAILABLE', 'The requested track is currently unavailable.');
    }
  });

  app.get('/api/tracks/:id/related', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    try {
      return reply.send(await provider.getRecommendations(p.data.id));
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'related failed');
      return sendError(reply, 502, 'RELATED_FAILED', 'Recommendations are temporarily unavailable.');
    }
  });

  for (const kind of ['artists', 'albums', 'playlists'] as const) {
    app.get(`/api/${kind}/:id`, async (req, reply) => {
      const p = idParam.safeParse(req.params);
      if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid id.');
      const key = `${kind}:${p.data.id}`;
      const hit = metaCache.get(key);
      if (hit) return reply.header('x-cache', 'HIT').send(hit);
      try {
        const fn =
          kind === 'artists' ? provider.getArtist.bind(provider)
          : kind === 'albums' ? provider.getAlbum.bind(provider)
          : provider.getPlaylist.bind(provider);
        const data = await (fn as (id: string) => Promise<unknown>)(p.data.id);
        metaCache.set(key, data);
        return reply.header('x-cache', 'MISS').send(data);
      } catch {
        return sendError(reply, 404, 'NOT_FOUND', 'The requested item is currently unavailable.');
      }
    });
  }

  app.get('/api/home', async (_req, reply) => {
    try {
      return reply.send(await provider.getHomeFeed());
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'home failed');
      return sendError(reply, 502, 'HOME_FAILED', 'Home feed is temporarily unavailable.');
    }
  });

  const lyricsCache = new TtlCache(env.cacheTtlLyricsSec * 1000);

  app.get('/api/tracks/:id/lyrics', async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    const key = `lyrics:${p.data.id}`;
    const hit = lyricsCache.get(key);
    if (hit) return reply.header('x-cache', 'HIT').send(hit);
    try {
      const l = await provider.getLyrics(p.data.id);
      if (!l) return sendError(reply, 404, 'LYRICS_UNAVAILABLE', 'Lyrics are not available for this track.');
      // Cache only real lyrics, not empty placeholders.
      if (l.plain || (l.lines ?? []).length > 0) lyricsCache.set(key, l);
      return reply.header('x-cache', 'MISS').send(l);
    } catch {
      return sendError(reply, 502, 'LYRICS_FAILED', 'Lyrics are temporarily unavailable.');
    }
  });
}
