import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    service: 'zabify-api',
    time: new Date().toISOString(),
  }));
}
