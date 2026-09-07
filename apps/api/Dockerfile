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
RUN apk add --no-cache python3 py3-pip && pip install --no-cache-dir --break-system-packages yt-dlp
ENV NODE_ENV=production PYTHON_BIN=python3
WORKDIR /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/node_modules node_modules
EXPOSE 8788
# Refresh yt-dlp on every boot: YouTube breaks pinned versions within weeks,
# and Render free-tier images can sit undeployed for months. Best-effort —
# the API still starts if the upgrade fails (offline mirror, etc.).
CMD ["sh", "-c", "pip install -q --break-system-packages -U yt-dlp >/dev/null 2>&1 || true; node apps/api/dist/index.js"]
