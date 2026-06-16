# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use a glibc-based image (debian slim) because pnpm-workspace.yaml excludes
# the musl (@esbuild/linux-x64-musl) binary — Alpine uses musl and would fail.
FROM node:24-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy the full monorepo (required for pnpm workspaces)
COPY . .

RUN pnpm install --frozen-lockfile

# Build the API — produces artifacts/api-server/dist/index.mjs + pino workers
RUN pnpm --filter @workspace/api-server run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app

# Copy only the compiled output; esbuild bundles all JS deps into index.mjs.
# The entire dist/ folder is copied because pino emits worker thread files
# alongside the main bundle.
COPY --from=builder /app/artifacts/api-server/dist ./dist

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
