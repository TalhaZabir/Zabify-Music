import type { FastifyReply } from 'fastify';
import { apiError } from '@zabify/shared';

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  const isProd = process.env.NODE_ENV === 'production';
  return reply.status(status).send(apiError(code, message, isProd ? undefined : { status }));
}

export function toSafeMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Unknown error';
}
