import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { YouTubeMusicProvider } from '../providers/ytmusic/provider.js';
import { sendError, toSafeMessage } from '../utils/errors.js';

// Same-origin audio proxy for user-initiated offline caching.
// Only raw bytes are relayed — upstream stream URLs are never exposed and
// nothing is stored server-side. Size-capped and timed out.
const MAX_BYTES = 30 * 1024 * 1024;

const idParam = z.object({ id: z.string().min(1).max(128).regex(/^[^<>"]+$/) });
const querySchema = z.object({ quality: z.enum(['low', 'medium', 'high', 'auto']).default('high') });

export async function audioRoutes(app: FastifyInstance): Promise<void> {
  const provider = new YouTubeMusicProvider();

  // Lightweight metadata probe: validates availability and reports size
  // from a 1-byte range request instead of downloading the whole track.
  app.head('/api/tracks/:id/audio', async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    let stream;
    try {
      stream = await provider.getStream(p.data.id, { quality: 'high' });
    } catch {
      return sendError(reply, 404, 'TRACK_UNAVAILABLE', 'The requested track is currently unavailable.');
    }
    try {
      const probe = await fetch(stream.url, {
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(20000),
      });
      if (!probe.ok && probe.status !== 206) return sendError(reply, 502, 'AUDIO_FAILED', 'Audio is temporarily unavailable.');
      // Drain the single byte so the socket closes cleanly.
      await probe.arrayBuffer().catch(() => undefined);
      const total = probe.headers.get('content-range')?.split('/')[1];
      const headers: Record<string, string> = {
        'Content-Type': probe.headers.get('content-type') ?? 'audio/mp4',
        'Accept-Ranges': 'bytes',
      };
      if (total && /^\d+$/.test(total)) headers['Content-Length'] = total;
      return reply.headers(headers).send();
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'audio probe failed');
      return sendError(reply, 502, 'AUDIO_FAILED', 'Audio is temporarily unavailable.');
    }
  });

  // exposeHeadRoute:false — HEAD has its own lightweight handler above.
  app.get('/api/tracks/:id/audio', { exposeHeadRoute: false }, async (req: FastifyRequest, reply: FastifyReply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return sendError(reply, 400, 'INVALID_ID', 'Invalid track id.');
    const q = querySchema.safeParse(req.query);
    if (!q.success) return sendError(reply, 400, 'INVALID_QUERY', 'Invalid quality.');

    let stream;
    try {
      stream = await provider.getStream(p.data.id, { quality: q.data.quality });
    } catch {
      return sendError(reply, 404, 'TRACK_UNAVAILABLE', 'The requested track is currently unavailable.');
    }

    const range = req.headers.range;
    if (range && !/^bytes=\d*-\d*$/.test(range)) {
      return sendError(reply, 416, 'INVALID_RANGE', 'Invalid range.');
    }

    // Always range-request upstream: plain (non-range) requests get
    // throttled to a trickle and cut off early by the stream host.
    const upstreamRange = range ?? 'bytes=0-';
    let upstream: Response;
    try {
      upstream = await fetch(stream.url, {
        headers: { Range: upstreamRange },
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      app.log.error({ err: toSafeMessage(e) }, 'audio proxy fetch failed');
      return sendError(reply, 502, 'AUDIO_FAILED', 'Audio is temporarily unavailable.');
    }
    if (!upstream.ok && upstream.status !== 206) {
      return sendError(reply, 502, 'AUDIO_FAILED', 'Audio is temporarily unavailable.');
    }

    const contentType = upstream.headers.get('content-type') ?? 'audio/mp4';
    if (!/^(audio\/|video\/mp4)/.test(contentType)) {
      await upstream.body?.cancel().catch(() => undefined);
      return sendError(reply, 502, 'AUDIO_FAILED', 'Unexpected upstream response.');
    }
    const declared = Number(upstream.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      await upstream.body?.cancel().catch(() => undefined);
      return sendError(reply, 502, 'AUDIO_TOO_LARGE', 'Audio exceeds the cacheable size.');
    }
    if (!upstream.body) return sendError(reply, 502, 'AUDIO_FAILED', 'Audio is temporarily unavailable.');

    // No client range + upstream 206 with a total: answer 200 with the
    // full length so plain download clients get a complete file.
    const total = upstream.headers.get('content-range')?.split('/')[1];
    const fullBody = !range && upstream.status === 206 && total && /^\d+$/.test(total);
    const status = !range && fullBody ? 200 : upstream.status;
    // reply.raw bypasses @fastify/cors hooks — mirror its ACAO decision.
    const origin = req.headers.origin;
    const cfg = (process.env.CORS_ORIGIN ?? 'http://localhost:5174').split(',').map((s) => s.trim());
    const acao = cfg.includes('*') ? '*' : origin && cfg.includes(origin) ? origin : undefined;
    reply.raw.writeHead(status, {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      ...(acao ? { 'Access-Control-Allow-Origin': acao, Vary: 'Origin' } : {}),
      ...(fullBody
        ? { 'Content-Length': total as string }
        : {
            ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length') as string } : {}),
            ...(upstream.headers.get('content-range') ? { 'Content-Range': upstream.headers.get('content-range') as string } : {}),
          }),
      'Cache-Control': 'private, max-age=300',
    });
    try {
      const reader = upstream.body.getReader();
      let sent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        sent += value.byteLength;
        if (sent > MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          reply.raw.destroy();
          return;
        }
        if (!reply.raw.write(value)) {
          await new Promise<void>((resolve) => reply.raw.once('drain', () => resolve()));
        }
      }
      reply.raw.end();
    } catch {
      try {
        reply.raw.destroy();
      } catch {
        // already gone
      }
    }
  });
}
