import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from './env.js';
import { healthRoutes } from './routes/health.js';
import { musicRoutes } from './routes/music.js';
import { audioRoutes } from './routes/audio.js';
import { integrationRoutes } from './routes/integrations.js';
import { maybeRefreshYtDlp, ytDlpEnabled, ytDlpVersion } from './providers/ytmusic/ytdlp.js';

const env = loadEnv();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

// CORS must allow Range (audio probes stream with `Range: bytes=0-0`,
// which triggers a preflight) and expose the resolve-debug headers so the
// browser Network tab can diagnose remote playback failures.
await app.register(cors, {
  origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
  allowedHeaders: ['Content-Type', 'Accept', 'Accept-Language', 'Range', 'Origin'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges', 'X-Resolve-Via', 'x-resolve-error'],
  maxAge: 86400,
});
await app.register(rateLimit, { max: env.rateLimitMax, timeWindow: env.rateLimitWindowMs });

app.setErrorHandler((err, _req, reply) => {
  const status = typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : 500;
  if (status >= 500) app.log.error({ err }, 'unhandled error');
  void reply.status(status >= 500 ? 500 : status).send({
    error: {
      code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED',
      message: status >= 500 ? 'Something went wrong.' : 'Request failed.',
    },
  });
});

await app.register(healthRoutes);
await app.register(async (i) => musicRoutes(i, env));
await app.register(audioRoutes);
await app.register(integrationRoutes);

const port = env.port;
const host = env.host;
await app.listen({ port, host });
console.log(`zabify-api listening on http://${host}:${port}`);

// Startup stream-backend report (one line in Render logs — the first thing
// to check when playback 404s in production but works on localhost).
if (ytDlpEnabled()) {
  ytDlpVersion()
    .then((v) => {
      console.log(
        v.installed
          ? `stream backend: yt-dlp ${v.version} (python: ${process.env.PYTHON_BIN ?? 'python'})`
          : `stream backend: yt-dlp NOT FOUND (python: ${process.env.PYTHON_BIN ?? 'python'}) — playback will fail, metadata still works`,
      );
    })
    .catch(() => undefined);
  // Non-blocking self-update, DELAYED 60s so it never contends with the
  // first cold-start resolve on 0.5-CPU free-tier hosts (pip install steals
  // CPU/network and was a direct cause of first-play timeouts on Render).
  setTimeout(() => maybeRefreshYtDlp((msg) => console.log(msg)), 60_000);
} else {
  console.log('stream backend: yt-dlp disabled (YTDLP_ENABLED=false) — Innertube only');
}
