import { execFile } from 'node:child_process';
import type { StreamOptions } from '@zabify/shared';

// yt-dlp fallback for stream-URL resolution. Innertube streaming_data
// increasingly ships without playable URLs (PO-token/SABR requirements);
// yt-dlp solves the player challenge locally and is the community-standard
// approach. Used ONLY to resolve a short-lived audio URL — never to
// download/store content server-side.
//
// Security: trackId is validated before use and passed as an argv element
// (no shell). Output is a single URL line; anything else is rejected.
//
// Datacenter note (Render/Fly/HF): YouTube frequently challenges datacenter
// IPs ("Sign in to confirm you're not a bot"). The default player client is
// tried first (best audio quality), then progressively more permissive
// clients. Cookies (YTDLP_COOKIES) bypass the challenge entirely when set.

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function formatFor(quality: StreamOptions['quality']): string {
  switch (quality) {
    case 'low':
      return 'bestaudio[abr<=48]/bestaudio[acodec=opus]/bestaudio';
    case 'medium':
      return 'bestaudio[abr<=128]/bestaudio';
    default:
      return 'bestaudio';
  }
}

interface Attempt {
  name: string;
  extractorArgs?: string;
  format?: string;
}

/** Ordered strategies: best quality first, most-permissive last. */
function attemptsFor(quality: StreamOptions['quality']): Attempt[] {
  const base = formatFor(quality);
  return [
    { name: 'default', format: base },
    // Android returns non-SABR URLs without a PO token (often itag 18
    // video/mp4 — still playable, slightly larger). Accepts any format.
    { name: 'android', extractorArgs: 'youtube:player_client=android', format: 'bestaudio/best' },
    // iOS + mweb + tv are additional fallbacks for heavily-flagged IPs.
    // tv is frequently the most permissive on datacenter IPs.
    { name: 'ios', extractorArgs: 'youtube:player_client=ios', format: 'bestaudio/best' },
    { name: 'mweb', extractorArgs: 'youtube:player_client=mweb', format: 'bestaudio/best' },
    { name: 'tv', extractorArgs: 'youtube:player_client=tv', format: 'bestaudio/best' },
  ];
}

/**
 * Decode YTDLP_COOKIES env. Accepts either raw Netscape cookies.txt body
 * (contains tabs / "# HTTP") or base64 of that file (single-line, safe for
 * dashboards that strip newlines). Returns null when unset.
 */
function cookiesContent(): string | null {
  const raw = (process.env.YTDLP_COOKIES ?? '').trim();
  if (!raw) return null;
  if (raw.includes('\n') || raw.includes('\t') || raw.includes('# HTTP') || raw.includes('.youtube.com')) {
    return raw;
  }
  // Heuristic: single-line base64 without cookie markers — try to decode.
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s/g, '').length % 4 === 0) {
    try {
      const decoded = Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf8');
      if (decoded.includes('.youtube.com') || decoded.includes('# HTTP') || decoded.includes('\t')) {
        return decoded;
      }
    } catch {
      // fall through to raw
    }
  }
  return raw;
}

function extraArgs(): string[] {
  const raw = (process.env.YTDLP_EXTRA_ARGS ?? '').trim();
  if (!raw) return [];
  // Split on whitespace, respecting simple double quotes. No shell involved.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  // Allow-list: only yt-dlp flags, never a new URL/command.
  return out.filter((a) => a.startsWith('-') && !a.includes('\n') && !a.includes('\0')).slice(0, 20);
}

export interface YtDlpResolution {
  url: string;
  expiresAt: number;
  /** Attempt name that succeeded ("default" | "android" | "ios" | "mweb" | "tv"). */
  via: string;
}

export async function resolveWithYtDlp(trackId: string, options?: StreamOptions): Promise<YtDlpResolution> {
  if (!/^[A-Za-z0-9_-]{5,32}$/u.test(trackId)) throw new Error('INVALID_ID');
  const attempts = attemptsFor(options?.quality);
  let lastErr: unknown = null;
  for (const attempt of attempts) {
    try {
       
      return await resolveOnce(trackId, options, attempt);
    } catch (e) {
      lastErr = e;
      // Only fall through on resolvable upstream failures. INVALID_ID is
      // permanent — rethrow immediately.
      if (e instanceof Error && e.message === 'INVALID_ID') throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('YTDLP_NO_URL');
}

async function resolveOnce(
  trackId: string,
  options: StreamOptions | undefined,
  attempt: Attempt,
): Promise<YtDlpResolution> {
  const python = process.env.PYTHON_BIN ?? 'python';
  const timeoutMs = Number(process.env.YTDLP_TIMEOUT_MS ?? 25000);
  // www.youtube.com (not music.youtube.com): identical video IDs, but the
  // main-site player is yt-dlp's most-tested path and is challenged less
  // often on datacenter IPs than the music-specific player.
  const url = `https://www.youtube.com/watch?v=${trackId}`;
  const args = [
    '-m',
    'yt_dlp',
    '-f',
    attempt.format ?? formatFor(options?.quality),
    '--get-url',
    '--no-playlist',
    '--no-warnings',
    '--retries',
    '2',
    '--socket-timeout',
    '12',
    '--user-agent',
    process.env.YTDLP_USER_AGENT ?? BROWSER_UA,
  ];
  // TLS impersonation (curl_cffi) makes datacenter requests look like real
  // Chrome traffic and defeats a large share of bot challenges. The Docker
  // image ships curl_cffi; local dev may not have it — detected once.
  const impersonate = await impersonateTarget(python);
  if (impersonate) args.push('--impersonate', impersonate);
  if (attempt.extractorArgs) args.push('--extractor-args', attempt.extractorArgs);
  // Forward Innertube session hardening to yt-dlp so both resolvers benefit
  // from the same secrets. Multiple --extractor-args flags are merged.
  const poToken = (process.env.YT_PO_TOKEN ?? '').trim();
  if (poToken) args.push('--extractor-args', `youtube:po_token=${poToken}`);
  const visitorData = (process.env.YT_VISITOR_DATA ?? '').trim();
  if (visitorData) args.push('--extractor-args', `youtube:visitor_data=${visitorData}`);
  // Single login cookie (YT_COOKIE="SAPISID=...; ...") when no full
  // cookies.txt is configured — sent as an HTTP Cookie header.
  const singleCookie = (process.env.YT_COOKIE ?? '').trim();
  const cookies = cookiesContent();
  if (singleCookie && !cookies) args.push('--add-header', `Cookie:${singleCookie}`);
  if (cookies) {
    // Raw Netscape cookie file contents via env (Render secret file pattern:
    // paste the cookies.txt body or its base64). Written to a temp file,
    // never logged.
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { randomUUID } = await import('node:crypto');
    const path = join(tmpdir(), `zabify-cookies-${randomUUID()}.txt`);
    await writeFile(path, cookies, 'utf8');
    args.push('--cookies', path);
    // NOTE: extraArgs must still apply when cookies are set (previously
    // dropped here, silently ignoring YTDLP_EXTRA_ARGS).
    args.push(...extraArgs());
    try {
      const resolved = await runYtDlp(python, args, url, timeoutMs);
      return { ...resolved, via: attempt.name };
    } finally {
      await unlink(path).catch(() => undefined);
    }
  }
  args.push(...extraArgs(), url);
  const resolved = await runYtDlp(python, args, url, timeoutMs);
  return { ...resolved, via: attempt.name };
}

function runYtDlp(python: string, args: string[], url: string, timeoutMs: number): Promise<{ url: string; expiresAt: number }> {
  // `url` is appended by the caller when cookies are absent; when cookies are
  // present the args already exclude it — append here for uniformity.
  const finalArgs = args[args.length - 1] === url ? args : [...args, url];
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 25000;
  return new Promise<string>((resolve, reject) => {
    execFile(
      python,
      finalArgs,
      { timeout: effectiveTimeout, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`YTDLP_FAILED: ${String((stderr as string) || err.message).slice(0, 200)}`));
          return;
        }
        resolve(String(stdout ?? ''));
      },
    );
  }).then((out) => {
    const line = out
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.startsWith('https://'));
    if (!line || line.length > 4096) throw new Error('YTDLP_NO_URL');
  let expiresAt = Date.now() + 30 * 60_000;
  try {
    const exp = new URL(line).searchParams.get('expire');
    if (exp) {
      const ms = Number(exp) * 1000 - 60_000;
      if (Number.isFinite(ms) && ms > Date.now()) expiresAt = Math.min(ms, Date.now() + 6 * 3600_000);
    }
  } catch {
    // keep default
  }
    return { url: line, expiresAt };
  });
}

let cachedVersion: { version: string; checkedAt: number } | null = null;

/** Best-effort yt-dlp version for /api/health diagnostics. Never throws. */
export async function ytDlpVersion(): Promise<{ installed: boolean; version?: string }> {
  if (!ytDlpEnabled()) return { installed: false };
  if (cachedVersion && Date.now() - cachedVersion.checkedAt < 5 * 60_000) {
    return { installed: true, version: cachedVersion.version };
  }
  const python = process.env.PYTHON_BIN ?? 'python';
  try {
    const version = await new Promise<string>((resolve, reject) => {
      execFile(python, ['-m', 'yt_dlp', '--version'], { timeout: 15000, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(String((stderr as string) || err.message).slice(0, 160)));
          return;
        }
        resolve(String(stdout ?? '').trim().split('\n')[0]?.trim() ?? '');
      });
    });
    if (!version) return { installed: false };
    cachedVersion = { version, checkedAt: Date.now() };
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}

export function ytDlpEnabled(): boolean {
  return (process.env.YTDLP_ENABLED ?? 'true').toLowerCase() !== 'false';
}

let impersonateCache: { python: string; target: string | null } | null = null;

/**
 * Chrome TLS impersonation target when curl_cffi is installed, else null.
 * Result is cached per PYTHON_BIN — never throws, never blocks long.
 */
async function impersonateTarget(python: string): Promise<string | null> {
  if (impersonateCache && impersonateCache.python === python) return impersonateCache.target;
  // Explicit opt-out (e.g. minimal hosts where the flag breaks old yt-dlp).
  if ((process.env.YTDLP_IMPERSONATE ?? '').toLowerCase() === 'false') {
    impersonateCache = { python, target: null };
    return null;
  }
  const target = (process.env.YTDLP_IMPERSONATE ?? 'chrome').trim() || 'chrome';
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(python, ['-c', 'import curl_cffi'], { timeout: 15000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    impersonateCache = { python, target };
    return target;
  } catch {
    impersonateCache = { python, target: null };
    return null;
  }
}

/**
 * True when a resolve failure means "YouTube is blocking/rate-limiting this
 * server" rather than "this track doesn't exist". Routes map this to 502
 * AUDIO_BLOCKED so clients can explain it; everything else stays 404.
 *
 * Covers bot-challenge, rate limits, upstream 403s, timeouts under challenge,
 * and SABR/PO-token failures that all mean "server IP flagged", not "bad id".
 */
export function isUpstreamBlocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /ytdlp-bot-challenge|rate-limited|upstream-403|ytdlp-timeout|innertube-timeout|PO token|SABR/i.test(msg);
}

/** True when yt-dlp is missing/misconfigured (distinct from blocked vs gone). */
export function isYtDlpMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /ytdlp-missing|yt-?dlp disabled/i.test(msg);
}

/**
 * Fire-and-forget yt-dlp self-update, called once after the server starts
 * listening. Never delays startup or readiness: YouTube breaks pinned
 * yt-dlp versions within weeks, and free-tier images can sit undeployed for
 * months. Disable with YTDLP_AUTO_UPDATE=false.
 */
export function maybeRefreshYtDlp(log?: (msg: string) => void): void {
  if ((process.env.YTDLP_AUTO_UPDATE ?? 'true').toLowerCase() === 'false') return;
  if (!ytDlpEnabled()) return;
  const python = process.env.PYTHON_BIN ?? 'python';
  try {
    const child = execFile(
      python,
      ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', '--break-system-packages', '-U', 'yt-dlp'],
      { timeout: 180000, maxBuffer: 1024 * 1024 },
      (err) => {
        if (err) log?.(`yt-dlp auto-update skipped: ${String(err.message).slice(0, 120)}`);
        else {
          cachedVersion = null;
          log?.('yt-dlp auto-update finished');
        }
      },
    );
    child.unref?.();
  } catch {
    // best-effort only
  }
}
