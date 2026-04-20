# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Cursed Crew — multi-stage build.
#
# Layers (ordered for cache efficiency):
#   1. Install client + server deps with their package.json only.
#   2. Copy source; build client (SvelteKit static bundle) and server (tsc).
#   3. Final runtime stage: install server prod deps only, then copy dist +
#      client build. better-sqlite3 is compiled against Alpine/musl in the
#      runtime stage; build toolchain is then torn down in the same layer.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS build

# Toolchain for native modules (better-sqlite3).
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /build

# --- deps (cacheable while package.json doesn't change) ---
COPY client/package.json client/package-lock.json* ./client/
COPY server/package.json server/package-lock.json* ./server/
RUN cd client && npm ci
RUN cd server && npm ci

# --- source ---
# Copy server first — client's prebuild sync-shared step reads from
# ../server/src/{types,reducer}.ts.
COPY server/ ./server/
COPY client/ ./client/

# --- build ---
RUN cd client && npm run build
RUN cd server && npm run build


FROM node:20-alpine AS runtime

# Build toolchain is needed transiently to compile better-sqlite3 against
# musl, then removed in the same layer so the runtime image stays small.
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat \
  && addgroup -S cc && adduser -S cc -G cc

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev \
  && apk del python3 make g++

COPY --from=build --chown=cc:cc /build/server/dist ./dist
COPY --from=build --chown=cc:cc /build/client/build ./client

RUN mkdir -p /data && chown -R cc:cc /data /app

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/cursedcrew.db \
    CLIENT_DIR=/app/client

USER cc

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
