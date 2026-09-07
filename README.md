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

## License

Apache-2.0. Music, artwork, and metadata belong to their providers/rights holders.
