# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use glibc (debian slim) for the same reason as the api Dockerfile:
# pnpm-workspace.yaml excludes @esbuild/linux-x64-musl (the Alpine binary).
FROM node:24-slim AS builder

RUN npm install -g pnpm@10.32.1

WORKDIR /app

# Install dependencies in a layer that is invalidated only when a workspace
# manifest or the lockfile changes. Source-only changes can reuse this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/lunam-hub/package.json artifacts/lunam-hub/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json

RUN --mount=type=cache,id=lunamhub-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Application source changes are copied after dependencies are installed.
COPY . .

# vite.config.ts reads PORT and BASE_PATH at build time.
# PORT is a dummy value (only used by the dev server, not the static build).
ENV PORT=3000
ENV BASE_PATH=/
ENV NODE_ENV=production

# Build — output goes to artifacts/lunam-hub/dist/public
RUN pnpm --filter @workspace/lunam-hub run build

# ── Stage 2: runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Remove the default nginx config and replace with our SPA + proxy config
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/artifacts/lunam-hub/dist/public /usr/share/nginx/html

EXPOSE 80
