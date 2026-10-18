# Independent Node.js project; initialize package.json and pnpm-lock.yaml first.
ARG NODE_IMAGE=node:26.11.1-bookworm-slim
ARG NGINX_IMAGE=nginx:1.30.5-alpine

FROM ${NODE_IMAGE} AS tooling
ARG PNPM_VERSION=12.5.1
ENV PNPM_VERSION=${PNPM_VERSION}
# npm only bootstraps pnpm; pnpm manages application dependencies.
RUN npm install --global "pnpm@${PNPM_VERSION}" \
    && mkdir -p /app/node_modules \
    && chown -R node:node /app
WORKDIR /app
USER node

FROM tooling AS dependencies
# Source edits do not invalidate this dependency layer.
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN node -e 'const p = require("./package.json"); if (p.packageManager !== "pnpm@" + process.env.PNPM_VERSION) { console.error("Set packageManager to pnpm@" + process.env.PNPM_VERSION); process.exit(1); }'
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=5173
COPY --chown=node:node . .
EXPOSE 5173
CMD ["sh", "-ec", "pnpm install --frozen-lockfile && exec pnpm run dev --host 0.0.0.0 --port 5173 --strictPort"]

FROM dependencies AS build
# Public browser configuration only. Wire API_BASE_URL into the chosen build tool.
ARG API_BASE_URL=http://localhost:3000
ENV API_BASE_URL=${API_BASE_URL}
COPY --chown=node:node . .
RUN pnpm run build && test -f dist/index.html

FROM ${NGINX_IMAGE} AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
# Discard the image's example site; only serve this application's built assets.
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
# Bypass root-oriented image entrypoint setup; nginx.conf uses writable /tmp paths.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
