import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { YouTubeMusicProvider, resolveDetail } from '../providers/ytmusic/provider.js';
import { ytDlpEnabled, ytDlpVersion } from '../providers/ytmusic/ytdlp.js';

/**
 * Bump when stream-resolution behavior changes. Lets anyone confirm a remote
 * host actually runs the latest code: if /api/health reports an older
 * version, Render is still serving a stale deploy (the #1 cause of
 * "still 404 after the fix").
 */
export const API_VERSION = 3;

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    // Cheap liveness probe (Render healthCheckPath). yt-dlp version is
    // cached for 5 min and never blocks longer than ~15s — but to keep
    // cold-start health checks instant, only include it when explicitly
    // requested (?diag=1) or via the dedicated /api/diag endpoint below.
    return {
      ok: true,
      service: 'zabify-api',
      version: API_VERSION,
      time: new Date().toISOString(),
    };
  });

  // Diagnostics for playback debugging (no secrets — version/flags only).
  // Visit https://<api>/api/diag after deploy: if ytdlp.installed is false,
  // stream resolution can only use Innertube (often blocked) and playback
  // will fail while search/metadata still works.
  app.get('/api/diag', async () => {
    const ytdlp = await ytDlpVersion().catch(() => ({ installed: false as const }));
    return {
      ok: true,
      service: 'zabify-api',
      version: API_VERSION,
      time: new Date().toISOString(),
      node: process.version,
      ytdlp: {
        enabled: ytDlpEnabled(),
        pythonBin: process.env.PYTHON_BIN ?? 'python',
        timeoutMs: Number(process.env.YTDLP_TIMEOUT_MS ?? 25000),
        hasCookies: Boolean((process.env.YTDLP_COOKIES ?? '').trim()),
        hasExtraArgs: Boolean((process.env.YTDLP_EXTRA_ARGS ?? '').trim()),
        ...ytdlp,
      },
      innertube: {
        lang: process.env.YTMUSIC_LANG ?? 'en',
        country: process.env.YTMUSIC_COUNTRY ?? 'US',
        hasPoToken: Boolean((process.env.YT_PO_TOKEN ?? '').trim()),
        hasCookie: Boolean((process.env.YT_COOKIE ?? '').trim()),
        hasVisitorData: Boolean((process.env.YT_VISITOR_DATA ?? '').trim()),
      },
      corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5174').split(',').map((s) => s.trim()),
    };
  });

  // Live end-to-end stream test: resolves metadata + audio for one track and
  // reports each stage. Open in a browser, e.g.
  //   https://<api>/api/diag/selftest?trackId=dQw4w9WgXcQ
  // Interpretation:
  //   track.ok=false  -> bad/region-locked id (try the default id).
  //   stream.ok=false + resolveError containing "bot-challenge" -> set YTDLP_COOKIES.
  //   stream.ok=false + "ytdlp-missing" -> redeploy API from the Dockerfile.
  //   stream.ok=true  -> backend resolves; a player-side 404 then means a
  //                      stale web build, wrong VITE_API_BASE_URL, or CORS.
  const selftestQuery = z.object({
    trackId: z.string().min(5).max(32).regex(/^[A-Za-z0-9_-]+$/).default('dQw4w9WgXcQ'),
  });
  app.get('/api/diag/selftest', async (req, reply) => {
    const q = selftestQuery.safeParse(req.query);
    if (!q.success) return reply.status(400).send({ error: { code: 'INVALID_ID', message: 'Invalid trackId.' } });
    const trackId = q.data.trackId;
    const provider = new YouTubeMusicProvider();
    const withDeadline = <T>(ms: number, run: () => Promise<T>): Promise<T> =>
      Promise.race([run(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))]);
    let track: { ok: boolean; title?: string; error?: string } = { ok: false };
    try {
      const t = await withDeadline(20000, () => provider.getTrack(trackId));
      track = { ok: true, title: t.title };
    } catch (e) {
      track = { ok: false, error: e instanceof Error ? e.message : 'TRACK_FAILED' };
    }
    let stream: { ok: boolean; via?: string; resolveError?: string; error?: string } = { ok: false };
    try {
      // Low quality = fastest resolve; success here proves the chain works.
      const s = await withDeadline(60000, () => provider.getStream(trackId, { quality: 'low' }));
      stream = { ok: true, via: s.via ?? 'unknown' };
    } catch (e) {
      stream = { ok: false, resolveError: resolveDetail(e), error: e instanceof Error ? e.message.split('\n')[0]?.slice(0, 160) : 'STREAM_FAILED' };
    }
    const ytdlp = await ytDlpVersion().catch(() => ({ installed: false as const }));
    return {
      ok: track.ok && stream.ok,
      service: 'zabify-api',
      version: API_VERSION,
      trackId,
      track,
      stream,
      ytdlp: { enabled: ytDlpEnabled(), ...ytdlp, hasCookies: Boolean((process.env.YTDLP_COOKIES ?? '').trim()) },
      hint:
        !track.ok ? 'Track metadata failed — try the default trackId.'
        : !stream.ok && /bot-challenge/i.test(stream.resolveError ?? '') ? 'Set YTDLP_COOKIES on the API and redeploy.'
        : !stream.ok && /missing/i.test(stream.resolveError ?? '') ? 'Redeploy the API from the Dockerfile (yt-dlp missing).'
        : stream.ok ? 'Backend resolves. If the web player still 404s, the web build is stale or VITE_API_BASE_URL is wrong.'
        : 'Check API logs for "audio resolve failed".',
    };
  });
}
