FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
RUN DATABASE_URL=file:/tmp/build-only.db pnpm build

FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 DATABASE_URL=file:/data/antrian.db
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates gosu && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
# Generate the entrypoint here so uploads cannot omit a separate shell file.
RUN printf '%s\n' '#!/bin/sh' 'set -eu' 'if [ "$(id -u)" = "0" ]; then' '  mkdir -p /data' '  chown node:node /data' '  exec gosu node "$@"' 'fi' 'exec "$@"' > /usr/local/bin/imei-entrypoint && chmod 755 /usr/local/bin/imei-entrypoint
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["imei-entrypoint"]
CMD ["node", "--import", "tsx", "scripts/start-production.ts"]
