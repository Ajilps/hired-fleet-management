# Independent backend install boundary; keep the pnpm pin with package.json.
ARG NODE_IMAGE=node:26.11.1-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Keep build and runtime on the same OS/OpenSSL ABI for Prisma/native modules.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS tooling
ARG PNPM_VERSION=12.14.0
ENV PNPM_VERSION=${PNPM_VERSION}
# npm only bootstraps pnpm; pnpm manages application dependencies.
RUN npm install --global "pnpm@${PNPM_VERSION}" \
    && mkdir -p /app/node_modules \
    && chown -R node:node /app
USER node

FROM tooling AS dependencies
# Source edits do not invalidate this dependency layer.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN node -e 'const p = require("./package.json"); if (p.packageManager !== "pnpm@" + process.env.PNPM_VERSION) { console.error("Set packageManager to pnpm@" + process.env.PNPM_VERSION); process.exit(1); }'
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --chown=node:node . .
RUN pnpm run generate
EXPOSE 3000
# Synchronize the container dependency volume and regenerate after mounted source changes.
CMD ["sh", "-ec", "pnpm install --frozen-lockfile && pnpm run generate && exec pnpm run dev"]

FROM dependencies AS build
COPY --chown=node:node . .
# generate must work offline; build must compile the API and custom generated client to dist/.
RUN pnpm run generate \
    && pnpm run build \
    && test -f dist/index.js

FROM build AS production-dependencies
# Preserve pnpm's complete node_modules layout, including its internal symlinks.
RUN pnpm prune --prod

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
# Migrations and seeds run separately, never on every API container startup.
CMD ["node", "dist/index.js"]
