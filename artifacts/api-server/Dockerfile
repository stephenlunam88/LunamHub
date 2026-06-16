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

# Create a self-contained production deployment folder.
# This gives us a pruned node_modules containing only production deps
# (e.g. bcrypt, @google-cloud/storage) for packages that esbuild externalises.
RUN pnpm --filter @workspace/api-server deploy --prod /app/api-deploy

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

WORKDIR /app

# Bundled application — esbuild output + pino worker thread files
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Production node_modules for externalized native/dynamic packages (e.g. bcrypt)
COPY --from=builder /app/api-deploy/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
