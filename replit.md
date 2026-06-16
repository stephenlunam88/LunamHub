# LunamHub

A Skylight-inspired family command centre app for wall-mounted tablets and Raspberry Pi touchscreens.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/lunam-hub run dev` — run the frontend Vite dev server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/lunam-hub) at path `/`
- API: Express 5 (artifacts/api-server) at path `/api`
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec`) → `lib/api-client-react`
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/index.ts` — Drizzle DB schema (source of truth)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/api.ts` — Generated React Query hooks + API functions
- `lib/api-client-react/src/generated/api.schemas.ts` — Generated Zod schemas and TypeScript types
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/lunam-hub/src/pages/` — All frontend pages
- `artifacts/lunam-hub/src/components/Layout.tsx` — Sidebar nav layout

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives both server validation (Zod schemas) and client hooks (Orval codegen). Always run `codegen` after spec changes.
- **Orval mutation signatures**: Create mutations take `{ data: InputType }`, delete/complete/approve take `{ id: number }`, nested mutations (list items, routine items) take `{ parentId, [childId], data }`.
- **Query options with `enabled`**: Orval-generated query hooks require `queryKey` alongside `enabled` in the options object — e.g. `{ query: { enabled: !!id, queryKey: getGetFooQueryKey(id) } }`.
- **Parent PIN**: Stored in `settings` table, default is `1234`. Admin page PIN-gates the parent area locally (no server session).
- **Display mode**: Full-screen dark dashboard at `/display` — designed for always-on wall tablet, auto-refreshes every 60s.

## Product

Family command centre with 9 screens:
- **Dashboard** — clock, today's events, chores overview, family points leaderboard
- **Calendar** — monthly view with event dots, day panel with add/delete
- **Chores** — tabs for To Do / Needs Approval / Done; per-child points cards; complete + approve flow
- **Rewards** — reward store with points cost; child redemption requests + parent approve/reject
- **Lists** — shared grocery, school, packing, reminder lists with checklist items
- **Meals** — weekly meal planner + meal library with ingredient-to-grocery export
- **Routines** — morning/afternoon/evening/bedtime step-by-step checklists with progress bar
- **Admin** — PIN-gated parent panel: manage family members + app settings
- **Display** — full-screen wall-clock mode with events, chores, leaderboard, dinner

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm run typecheck:libs` after any `lib/*` package change before checking artifacts.
- API server runs on port 8080 (not 5000 as the template default says).
- `ChoreInput` does NOT include a `status` field — server defaults to `"pending"`.
- `SharedListInput` is the correct type for list creation (not `ListInput`).

## Docker / NAS Deployment

LunamHub ships as a three-service Docker Compose stack (db, api, web) designed for QNAP NAS or any Linux host with Docker installed.

### First-time NAS setup

```bash
# 1. Pull the repo onto the NAS
cd /share/Container/familyhub/
git clone https://github.com/stephenlunam88/LunamHub.git
cd LunamHub

# 2. Copy .env.example → .env and fill in real values (see .env.example)
cp .env.example .env
nano .env   # set POSTGRES_PASSWORD and SESSION_SECRET at minimum

# 3. Build and start
docker compose build && docker compose up -d
```

The first `up` mounts `docker/init.sql` into Postgres and initialises the schema automatically. Subsequent starts skip the init script (data volume already populated).

### Routine update deploy

```bash
cd /share/Container/familyhub/LunamHub
git pull github-nas main
CACHE_BUST=$(date +%s) docker compose build api web && docker compose up -d
```

### Key files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Defines db / api / web services |
| `artifacts/api-server/Dockerfile` | Multi-stage build → slim Node runtime |
| `artifacts/lunam-hub/Dockerfile` | Multi-stage Vite build → nginx static server |
| `docker/init.sql` | Full Postgres schema (runs on first boot only) |
| `docker/nginx.conf` | nginx SPA config + `/api` reverse-proxy |
| `.env.example` | All required secrets (copy → `.env` on NAS) |

### Add the GitHub remote (run once in your local repo or on the NAS)

```bash
git remote add github-nas https://github.com/stephenlunam88/LunamHub.git
```

### Notes

- Screensaver photo uploads use Replit Object Storage in dev; on NAS this feature will silently skip uploads. Photos can be added directly via the DB if needed (future work).
- The web container's nginx listens on port 80 (mapped to `WEB_PORT` on the host, default 3000). Your NAS reverse proxy should point to that port.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
