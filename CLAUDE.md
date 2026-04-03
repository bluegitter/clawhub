# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawHub is a public skill registry for Clawdbot — users publish, version, and search text-based agent skills (SKILL.md + supporting files). It also hosts an onlycrabs.ai SOUL.md registry and an OpenClaw package directory for code/package plugins.

**Stack**: TanStack Start (React SSR) + Vite 8 + Convex (backend-as-a-service) + Tailwind CSS v4 + ArkType validation. Runtime: **Bun** (enforced via `only-allow`).

## Common Commands

| Command | Purpose |
|---|---|
| `bun install` | Install dependencies |
| `bun run dev` | Vite dev server (port 3000) |
| `bun run build` | Production build (`bun --bun vite build` + OG asset copy) |
| `bun run test` | Unit tests (vitest, jsdom, excludes `packages/clawdhub` and `e2e`) |
| `bun run test:watch` | Unit tests in watch mode |
| `bun run coverage` | Unit tests with V8 coverage (70% threshold) |
| `bun run lint` | oxlint (type-aware) |
| `bun run lint:fix` | oxlint fix + oxfmt format |
| `bun run format` | `oxfmt --write` |
| `bun run test:e2e` | E2E API tests (vitest, node env, 60s timeout) |
| `bun run test:pw` | Playwright browser tests |
| `bun run convex:deploy` | Deploy Convex functions |
| `bun run --cwd packages/clawdhub test` | CLI package tests only |
| `bun run --cwd packages/clawdhub verify` | CLI full verification (test + typecheck + build) |

**Run a single test**: `bun vitest run path/to/test.test.ts`

## Monorepo Structure

```
src/                  → TanStack Start web app (routes, components, lib)
convex/               → Backend: schema, queries/mutations/actions, HTTP API, auth
packages/schema/      → Shared API types, ArkType validators, route definitions
packages/clawdhub/    → CLI tool (published as `clawhub` on npm)
server/               → Nitro server routes (OG image generation)
e2e/                  → E2E tests (*.e2e.test.ts = API, *.pw.test.ts = Playwright)
```

No Turborepo/Nx — simple Bun workspaces (`"workspaces": ["packages/*"]`).

## Architecture

### Frontend
- **Routing**: TanStack Router file-based routing in `src/routes/`. Files prefixed with `-` are layout modules (not routes).
- **State**: No global state library. Data loading via TanStack Router loaders + Convex `useQuery` for reactive data. Public listing pages use `ConvexHttpClient.query()` (one-shot) instead of reactive subscriptions.
- **Styling**: Tailwind CSS v4 with CSS-first config (no `tailwind.config.js`). Custom properties and theme defined in `src/styles.css`.
- **Linting/Formatting**: oxlint + oxfmt (not ESLint/Prettier).
- **Validation**: ArkType (not Zod). Validators defined in `packages/schema/src/ark.ts`.

### Backend (Convex)
- `convex/functions.ts` — central export hub. Wraps mutations with `convex-helpers` Triggers for denormalized table sync. All mutations import from this file, not `convex/_generated/server`.
- `convex/schema.ts` — all table definitions + indexes.
- `convex/http.ts` + `httpApiV1.ts` — HTTP API routes. Route definitions shared via `packages/schema/src/routes.ts`.
- Auth: Convex Auth + GitHub OAuth, configured in `convex/auth.config.ts`.

### Key Database Tables
`users`, `publishers`, `publisherMembers` — identity and orgs. `skills`, `skillVersions`, `skillSlugAliases` — core skill data. `souls`, `soulVersions` — SOUL.md registry. `packages`, `packageReleases` — OpenClaw packages. `skillSearchDigest`, `packageSearchDigest` — denormalized search projections. `skillEmbeddings`, `soulEmbeddings` — vector search (OpenAI `text-embedding-3-small`). Soft delete via `softDeletedAt` field.

## Convex Performance Rules

- For public listing/browse pages, use `ConvexHttpClient.query()` (one-shot fetch), not `useQuery`/`usePaginatedQuery` (reactive subscription). Reserve reactive queries for data the user needs to see update in real time.
- Denormalize hot read paths into a single lightweight "digest" table. Every `ctx.db.get()` join adds a table to the reactive invalidation scope.
- When a `skillSearchDigest` row is available, use `digestToOwnerInfo(digest)` to resolve owner data. NEVER call `ctx.db.get(ownerUserId)` when digest owner fields (`ownerHandle`, `ownerName`, `ownerDisplayName`, `ownerImage`) are already present. Reading from `users` adds the entire table to the reactive read set and wastes bandwidth.
- Use `convex-helpers` Triggers to sync denormalized tables automatically. Always add change detection — skip the write if no fields actually changed.
- Use compound indexes instead of JS filtering. If you're filtering docs after the query, you're scanning documents you'll throw away.
- For search results scored by computed values (vector + lexical + popularity), fetch all results once and paginate client-side. Don't re-run the full search pipeline on "load more."
- Backfills on reactively-subscribed tables need `delayMs` between batches.
- Mutations that read >8 MB should use the Action → Query → Mutation pattern to split reads across transactions.

## Convex Conventions

- All mutations import from `convex/functions.ts` (not `convex/_generated/server`) to get trigger wrapping. Type imports still come from `convex/_generated/server`.
- NEVER use `--typecheck=disable` on `npx convex deploy`.
- Use `npx convex dev --once` to push functions once (not long-running watcher).

## Testing

- Tests use `._handler` to call mutation handlers directly with mock `db` objects.
- Mock `db` objects MUST include `normalizeId: vi.fn()` for trigger wrapper compatibility.
- Vitest globals enabled — no need to import `describe`/`it`/`expect`.
- Three test tiers: unit (`bun run test`), CLI (`bun run --cwd packages/clawdhub test`), E2E (`bun run test:e2e` / `bun run test:pw`).

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
