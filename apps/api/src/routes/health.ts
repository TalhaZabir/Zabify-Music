import type { FastifyInstance } from 'fastify';
import { ytDlpEnabled, ytDlpVersion } from '../providers/ytmusic/ytdlp.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    // Cheap liveness probe (Render healthCheckPath). yt-dlp version is
    // cached for 5 min and never blocks longer than ~15s — but to keep
    // cold-start health checks instant, only include it when explicitly
    // requested (?diag=1) or via the dedicated /api/diag endpoint below.
    return {
      ok: true,
      service: 'zabify-api',
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
}
