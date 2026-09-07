import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sendError } from '../utils/errors.js';

// Last.fm proxy: keeps the shared API secret server-side. The frontend
// only ever sends its own session key + public track metadata.
function lastfmConf(): { key: string; secret: string } | null {
  const key = process.env.LASTFM_API_KEY;
  const secret = process.env.LASTFM_API_SECRET;
  return key && secret ? { key, secret } : null;
}

function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHash('md5').update(`${base}${secret}`, 'utf8').digest('hex');
}

async function lastfmCall(method: string, params: Record<string, string>): Promise<unknown> {
  const conf = lastfmConf();
  if (!conf) throw new Error('NOT_CONFIGURED');
  const body = new URLSearchParams({ ...params, method, api_key: conf.key, format: 'json' });
  body.set('api_sig', sign(Object.fromEntries(body.entries()), conf.secret));
  const res = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json['error']) {
    throw new Error(`LASTFM_${String((json as { error?: unknown }).error ?? res.status)}`);
  }
  return json;
}

export async function integrationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/integrations/lastfm/token', async (_req, reply) => {
    if (!lastfmConf()) return sendError(reply, 503, 'INTEGRATION_UNCONFIGURED', 'Last.fm is not configured on this server.');
    try {
      const json = (await lastfmCall('auth.getToken', {})) as { token?: string };
      if (!json.token) throw new Error('LASTFM_NO_TOKEN');
      return reply.send({ token: json.token, url: `https://www.last.fm/api/auth/?api_key=${lastfmConf()?.key}&token=${json.token}` });
    } catch {
      return sendError(reply, 502, 'LASTFM_FAILED', 'Could not reach Last.fm.');
    }
  });

  app.post('/api/integrations/lastfm/session', async (req, reply) => {
    if (!lastfmConf()) return sendError(reply, 503, 'INTEGRATION_UNCONFIGURED', 'Last.fm is not configured on this server.');
    const parsed = z.object({ token: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_BODY', 'Invalid request body.');
    try {
      const json = (await lastfmCall('auth.getSession', { token: parsed.data.token })) as {
        session?: { key?: string; name?: string };
      };
      if (!json.session?.key) throw new Error('LASTFM_NO_SESSION');
      return reply.send({ sk: json.session.key, username: json.session.name ?? '' });
    } catch {
      return sendError(reply, 502, 'LASTFM_FAILED', 'Authorization not completed yet — approve Zabify on Last.fm first.');
    }
  });

  const scrobbleBody = z.object({
    sk: z.string().min(8).max(128),
    method: z.enum(['track.updateNowPlaying', 'track.scrobble']),
    artist: z.string().min(1).max(300),
    track: z.string().min(1).max(300),
    album: z.string().max(300).optional(),
    duration: z.coerce.number().int().min(1).max(36000).optional(),
    timestamp: z.coerce.number().int().min(946684800).max(4102444800).optional(),
  });

  app.post('/api/integrations/lastfm/scrobble', async (req, reply) => {
    if (!lastfmConf()) return sendError(reply, 503, 'INTEGRATION_UNCONFIGURED', 'Last.fm is not configured on this server.');
    const parsed = scrobbleBody.safeParse(req.body);
    if (!parsed.success) return sendError(reply, 400, 'INVALID_BODY', 'Invalid request body.');
    const { sk, method, ...rest } = parsed.data;
    const params: Record<string, string> = { sk };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) params[k] = String(v);
    }
    try {
      await lastfmCall(method, params);
      return reply.send({ ok: true });
    } catch {
      return sendError(reply, 502, 'LASTFM_FAILED', 'Scrobble was rejected.');
    }
  });
}
