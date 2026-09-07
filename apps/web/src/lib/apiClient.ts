import type { ApiErrorBody } from '@zabify/shared';
import { toast } from '../stores/toast';

// Runtime-configurable API bases with fallback. The frontend only ever
// sends public music queries/ids — no credentials or private data.

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

let basesOverride: string[] | null = null;
let activeBase: string = DEFAULT_BASE;
let fallbackNoticed = false;

export function setApiBases(bases: string[]): void {
  basesOverride = bases.length > 0 ? bases : null;
  activeBase = currentBases()[0] ?? DEFAULT_BASE;
  fallbackNoticed = false;
}

export function currentBases(): string[] {
  return basesOverride && basesOverride.length > 0 ? basesOverride : [DEFAULT_BASE];
}

export function getActiveBase(): string {
  return activeBase;
}

export function normalizeBase(input: string): string | null {
  const v = input.trim().replace(/\/+$/, '');
  if (!v) return null;
  if (v.startsWith('/')) {
    return /^\/[A-Za-z0-9/_.-]*$/u.test(v) ? v : null;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function testBase(base: string, timeoutMs = 8000): Promise<{ ok: boolean; latencyMs?: number; message?: string }> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { headers: { accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const body = (await res.json()) as { ok?: boolean; service?: string };
    if (body?.service && body.service !== 'zabify-api') return { ok: false, message: 'Not a Zabify API' };
    return { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, message: e instanceof DOMException && e.name === 'AbortError' ? 'Timed out' : 'Unreachable' };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiFetch(path: string): Promise<Response> {
  return tryBases(path, { headers: { accept: 'application/json' } });
}

async function tryBases(path: string, init: RequestInit): Promise<Response> {
  const bases = currentBases();
  let lastErr: unknown = null;
  for (let i = 0; i < bases.length; i++) {
    const base = bases[i] as string;
    try {
      const res = await fetch(`${base}${path}`, init);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && i < bases.length - 1) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (i > 0 && !fallbackNoticed) {
        fallbackNoticed = true;
        activeBase = base;
        toast(`Switched to fallback API (${shortBase(base)})`, 'error');
      } else if (i === 0) {
        activeBase = base;
      }
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All API instances unreachable.');
}

export async function apiPost(path: string, body: unknown): Promise<Response> {
  return tryBases(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function shortBase(base: string): string {
  return base.length > 34 ? `${base.slice(0, 32)}…` : base;
}

export async function throwForResponse(res: Response): Promise<never> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  throw new Error(body?.error.message ?? `Request failed (${res.status})`);
}
