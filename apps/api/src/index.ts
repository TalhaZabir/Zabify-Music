import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from './env.js';
import { healthRoutes } from './routes/health.js';
import { musicRoutes } from './routes/music.js';
import { audioRoutes } from './routes/audio.js';
import { integrationRoutes } from './routes/integrations.js';

const env = loadEnv();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

await app.register(cors, { origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') });
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
