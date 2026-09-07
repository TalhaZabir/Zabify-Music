# Zabify API — Fastify + youtubei.js + yt-dlp fallback.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --include-workspace-root=false 2>/dev/null || npm install --workspace apps/api --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api

FROM node:24-alpine AS runtime
# yt-dlp for stream-URL resolution + curl_cffi for Chrome TLS impersonation
# (defeats a large share of datacenter bot challenges). The server refreshes
# yt-dlp itself in the background after boot (see maybeRefreshYtDlp), so the
# image never goes stale between deploys.
RUN apk add --no-cache python3 py3-pip && pip install --no-cache-dir --break-system-packages yt-dlp curl_cffi
ENV NODE_ENV=production PYTHON_BIN=python3
WORKDIR /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/node_modules node_modules
EXPOSE 8788
CMD ["node", "apps/api/dist/index.js"]
