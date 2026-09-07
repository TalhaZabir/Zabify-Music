# Zabify

Modern, minimal, open-source music streaming client. Primary source: YouTube Music via a secure backend proxy. Original UI inspired by Monochrome's UX quality — no copied code, assets, or branding.

## Features

- Global search (songs, artists, albums, playlists, videos) with debounced results
- Artist / album / playlist pages, charts, new releases, moods, home feed
- Real audio playback with queue, shuffle/repeat, seek, volume, speed
- Full-screen player with lyrics, sleep timer, share
- Library: liked songs, custom playlists (create/rename/reorder), saved albums & artists, history
- Import/export portable JSON backups
- Configurable API instances with automatic fallback + developer custom backend
- Last.fm + ListenBrainz scrobbling (optional)
- PWA: installable, offline shell + artwork cache (streams are never cached — see below)
- Dark theme system with configurable accent

## Monorepo

- `apps/web` — React + Vite + TS + Tailwind + Zustand + React Router + Framer Motion
- `apps/api` — Fastify + TS + youtubei.js (Innertube), rate-limit, TTL cache
- `packages/shared` — shared domain types + `MusicProvider` contract

## Requirements

- Node 24+, npm 11+
- Python 3 + `pip install yt-dlp` on the API host (stream-URL fallback)
- Optional: Last.fm API key/secret for scrobbling; ListenBrainz user token

## Quickstart

```bash
cp .env.example .env
npm install
npm run dev        # web :5174 + api :8788 → open http://localhost:5174
npm run typecheck
npm run build
```

| Script | What it does |
| --- | --- |
| `npm run dev` | web + api together |
| `npm run dev:web` / `dev:api` | one service |
| `npm run typecheck` / `lint` / `test` | checks |
| `npm run build` | production builds |

## Environment

See `.env.example` for every variable. Never put secrets in `VITE_*` vars (they ship to the browser). Stream URLs are short-lived and never cached.

## Stream resolution

`GET /api/tracks/:id/stream` tries Innertube decipher first, then falls
back to `yt-dlp --get-url` (see `YTDLP_*` in `.env.example`). URLs are
IP-bound and expire — run the API on the same machine/network as the
browser for reliable playback. No content is downloaded or stored
server-side.

Known platform limits (documented, not bugs):

- Spectrum visualizer / EQ would need Web Audio routing, which stream
  hosts block (no CORS headers) — routing would silence playback, so they
  are intentionally omitted in favor of fade in/out + gapless preload.
- Discord Rich Presence is impossible from a browser tab without a local
  bridge, so it is omitted.
- Offline mode covers the app shell, artwork, and your local library —
  never audio, which cannot be truthfully cached.

## API

`GET /api/health|search|home|tracks/:id|tracks/:id/stream|tracks/:id/lyrics|tracks/:id/related|artists/:id|albums/:id|playlists/:id`
`GET|POST /api/integrations/lastfm/*` (requires server keys)

Errors look like `{"error":{"code":"TRACK_UNAVAILABLE","message":"…"}}` — no stack traces in production.

## Free hosting (easiest whole-stack option)

**Render free tier** via the included `render.yaml` blueprint (API + frontend):

1. Push this repo to GitHub.
2. Render dashboard → New + → Blueprint → select the repo.
3. Set `VITE_API_BASE_URL` (web) to `https://zabify-api.onrender.com/api`.
4. Deploy, then set the API's `CORS_ORIGIN` to your web URL and redeploy the API.

Free-tier realities: the API sleeps after ~15 min idle, so the first
request wakes it (30–60s — retry once). Static frontend never sleeps.
Datacenter IPs occasionally get throttled by YouTube; a different host
region usually clears it. Alternatives: Hugging Face Spaces (Docker, free)
for the API + Vercel for the frontend, or Oracle Always-Free VPS if you
want no sleeping (more setup, card verification).

## Production (Docker)

```bash
docker compose up --build   # web :8080 (proxies /api), api :8788
```

Images were authored without a local Docker daemon available, so verify
with `docker compose config` and a first `up --build` before relying on
them. Keep the API on the same network as its listeners (IP-bound URLs).

## Deployment caching rules (read this)

Vite emits content-hashed assets under `/assets/` but `index.html`
references them by exact hash — and `npm run build` deletes old hashes.
If any cache (browser, CDN, edge) serves a **stale `index.html`** after a
deploy, the app boots broken/unstyled until a hard refresh. The loadings
are therefore split:

- `/assets/*` → `public, max-age=31536000, immutable` (hashes make this safe)
- `index.html`, SPA routes, `sw.js`, `registerSW.js`, `manifest.webmanifest`,
  icons, favicon → `no-cache` (always revalidated)

`apps/web/nginx.conf` and the root `vercel.json` already encode exactly
this. Do not put `max-age` on the HTML shell.

## Vercel

- SPA fallback lives in the root `vercel.json` (`/api/*`, real files, and
  hashed assets pass through; everything else serves `/index.html`).
- `/api/*` is intentionally **not** rewritten to the app — point it at
  your Fastify backend (same pattern as the nginx `/api/` proxy), otherwise
  API calls 404 in production while working locally.

## PWA

Production builds register a service worker (app shell + artwork cache).
Install via the browser's install prompt. Audio is always streamed live.

## Testing

- `npm run test -w apps/web` / `-w apps/api` — Vitest unit tests
- `npm run test:e2e -w apps/web` — Playwright journey
  (needs `npx playwright install` + dev servers running)

## Contributing

Keep PRs small and runnable: strict TS, no `any` without need, reusable
hooks/components, colocalized tests. Run typecheck + lint + tests + build
before pushing. Apache-2.0.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `localhost:5173` shows the wrong app | another project on 5173 — use `:5174` |
| Every track skips with playback errors | stream host blocked (VPN/region) or API down — check `/api/health` |
| Search empty / 502s | YouTube throttling (429) — wait and retry |
| `yt-dlp` failures in API logs | upgrade yt-dlp: `pip install -U yt-dlp` |
| PWA has no install prompt | needs HTTPS (or localhost) + production build |

### Render: metadata works but nothing plays (console shows 404)

This almost always means **stream-URL resolution fails on the server**
while metadata (search/track) still works. Stream extraction (Innertube
decipher + `yt-dlp --get-url`) is challenged on datacenter IPs; metadata
is not. Localhost works because residential IPs aren't challenged.

**First — make sure Render is actually running the latest code.**
`git push`, then wait for **both** Render deploys (API + web) to finish;
the API Docker build takes several minutes. Render does **not**
retro-apply new `render.yaml` env vars to services created earlier — if
your API predates them, add `YTDLP_TIMEOUT_MS=45000` manually in the
dashboard and redeploy. After redeploying, the API logs must contain a
`stream backend: yt-dlp <version>` line; if it says NOT FOUND, the
service isn't using the Dockerfile (recreate it from the blueprint).

Then diagnose in order:

1. **Read the failing request** (DevTools → Network → click the red
   `audio?quality=…` row):
   - **Request URL host is your *web* host** (e.g. `zabify-web…/api/…`)
     → `VITE_API_BASE_URL` isn't set on the web service. Set it to
     `https://<api>.onrender.com/api` and **redeploy the web** (Vite bakes
     it in at build time).
   - **Status 502 + code `AUDIO_BLOCKED`** (or response header
     `x-resolve-error` containing `ytdlp-bot-challenge`) → YouTube flagged
     the datacenter IP. Strongest fix: set `YTDLP_COOKIES` on the API
     (export a fresh YouTube `cookies.txt` via a browser extension and
     paste the whole file body as a secret env var), then redeploy. The
     server already tries alternate player clients + Chrome TLS
     impersonation + quality fallback first.
   - **Status 404 + code `TRACK_UNAVAILABLE`** → that specific track can't
     be resolved (deleted/private/region-locked). If *every* track 404s,
     treat it as the blocked case above and check `/api/diag`.
   - **`x-resolve-error: ytdlp-missing`** → `PYTHON_BIN` wrong or a
     non-Docker deploy — recreate the API from the blueprint.
2. **Check diagnostics:** open `https://<your-api>.onrender.com/api/diag`.
   `ytdlp.installed` must be `true` with a recent version.
3. **Check the logs:** Render dashboard → API → Logs. Look for
   `audio resolve failed` / `stream failed` with
   `ytdlp-bot-challenge`, `ytdlp-timeout`, or `innertube-no-url`.
   - `upstream-403` on `/audio` → expired signature; the server
     re-resolves once automatically — if it persists, lower the in-app
     quality to Medium/Low (Settings) and retry.
4. **Cold starts:** free-tier API sleeps after ~15 min. First play after
   sleep takes 30–60s (wake + yt-dlp resolve); press play once more.

## License

Apache-2.0. Music, artwork, and metadata belong to their providers/rights holders.
