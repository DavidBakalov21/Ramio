FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN test -f dist/main.js || (echo "nest build did not produce dist/main.js" >&2; ls -la dist 2>&1 || true; exit 1)
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333

# Docker CLI only: CodeTestService spawns `docker run` against the host daemon (socket mount).
# Match bookworm; supports amd64 + arm64 static bundles from Docker.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && ARCH=$(dpkg --print-architecture) \
  && case "$ARCH" in \
       amd64) DARCH=x86_64 ;; \
       arm64) DARCH=aarch64 ;; \
       *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://download.docker.com/linux/static/stable/${DARCH}/docker-27.4.1.tgz" \
    | tar xz --strip-components=1 -C /usr/local/bin docker/docker \
  && chmod +x /usr/local/bin/docker \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

EXPOSE 3333
CMD ["node", "dist/main.js"]
