# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use a glibc-based image (debian slim) because pnpm-workspace.yaml excludes
# the musl (@esbuild/linux-x64-musl) binary — Alpine uses musl and would fail.
FROM node:24-slim AS builder

# Pin pnpm to match the workspace version for lockfile compatibility
RUN npm install -g pnpm@10.32.1

WORKDIR /app

# Copy the full monorepo (required for pnpm workspaces)
COPY . .

RUN pnpm install --frozen-lockfile

# Build the API — produces artifacts/api-server/dist/index.mjs + pino workers
RUN pnpm --filter @workspace/api-server run build

# Create a self-contained production deployment folder.
# --legacy bypasses the ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE restriction in
# pnpm v10 that requires inject-workspace-packages to be enabled.
RUN pnpm --filter @workspace/api-server deploy --prod --legacy /app/api-deploy

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app

# Bundled application — esbuild output + pino worker thread files
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Production node_modules for externalized native/dynamic packages
# (e.g. bcrypt, @google-cloud/storage)
COPY --from=builder /app/api-deploy/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
