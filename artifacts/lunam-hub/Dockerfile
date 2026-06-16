# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use glibc (debian slim) for the same reason as the api Dockerfile:
# pnpm-workspace.yaml excludes @esbuild/linux-x64-musl (the Alpine binary).
FROM node:24-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy the full monorepo (required for pnpm workspaces)
COPY . .

RUN pnpm install --frozen-lockfile

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
