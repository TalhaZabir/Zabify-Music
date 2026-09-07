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

export async function resolveWithYtDlp(trackId: string, options?: StreamOptions): Promise<{ url: string; expiresAt: number }> {
  if (!/^[A-Za-z0-9_-]{5,32}$/u.test(trackId)) throw new Error('INVALID_ID');
  const python = process.env.PYTHON_BIN ?? 'python';
  const timeoutMs = Number(process.env.YTDLP_TIMEOUT_MS ?? 25000);
  const url = `https://music.youtube.com/watch?v=${trackId}`;
  const out = await new Promise<string>((resolve, reject) => {
    execFile(
      python,
      ['-m', 'yt_dlp', '-f', formatFor(options?.quality), '--get-url', '--no-playlist', '--no-warnings', url],
      { timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 25000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`YTDLP_FAILED: ${String((stderr as string) || err.message).slice(0, 200)}`));
          return;
        }
        resolve(String(stdout ?? ''));
      },
    );
  });
  const line = out.split('\n').map((s) => s.trim()).find((s) => s.startsWith('https://'));
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
}

export function ytDlpEnabled(): boolean {
  return (process.env.YTDLP_ENABLED ?? 'true').toLowerCase() !== 'false';
}
