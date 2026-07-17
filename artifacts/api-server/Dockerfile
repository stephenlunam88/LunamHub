# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Use a glibc-based image (debian slim) because pnpm-workspace.yaml excludes
# the musl (@esbuild/linux-x64-musl) binary — Alpine uses musl and would fail.
FROM node:24-slim AS builder

# Pin pnpm to match the workspace version for lockfile compatibility
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

# Create the production dependency tree before copying source so this layer is
# also reused for source-only changes.
# --legacy bypasses the ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE restriction in
# pnpm v10 that requires inject-workspace-packages to be enabled.
RUN --mount=type=cache,id=lunamhub-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @workspace/api-server deploy --prod --legacy /app/api-deploy

# Application source changes are copied after dependencies are installed.
COPY . .

# Build the API — produces artifacts/api-server/dist/index.mjs + pino workers
RUN pnpm --filter @workspace/api-server run build

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
