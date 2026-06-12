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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
