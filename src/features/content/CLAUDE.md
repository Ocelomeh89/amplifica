# features/content — the content engine

Spec: `docs/superpowers/specs/2026-09-17-content-engine-design.md`. Owner-only:
every page and action opens with `requireContentOwner()` from `data/owner.ts`.

## Map

- `engine/` — pure, tested. `schema.ts` is the ingest contract the routines
  write against; `types.ts` mirrors migration 0008's check constraints.
- `data/` — the shared core sits at the top: `actions.ts` (Server Actions), `ingest.ts` and
  `context.ts` (endpoint logic behind an interface), `supabase-db.ts` (the adapter), `api-auth.ts`,
  `owner.ts`, `queries.ts`, `claude.ts`, `clickup.ts`, `topics.ts`. Each slice has its own subfolder
  (`today/`, `gate/`, `review/`, ...) holding its flow, `-actions`, `-cron`, `supabase-*-db` adapter
  and `.fake` for tests; `pulls/` holds the platform clients.
- `ui/` — one file per component. `IdeaCard` is used by the inbox and the idea page.
- Routes: `src/app/(app)/content/**` and `src/app/api/content/**`. Pages are routing and
  layout only: every read is in `data/queries.ts` (or `data/metrics/performance.ts`), and every
  `/api/content` route opens with `authorizeRoutine()` from `data/api-auth.ts`.
  `wiring.test.ts` asserts both.

Status and what to build next: `docs/superpowers/content-next-steps.md`.

## Slices

Each slice's file map and invariants live in `notes/`. Read the one for the slice
you are touching before its code; the rules there are load-bearing.

| Slice | Notes |
|---|---|
| Ideas, ingest, inbox and queues | `notes/ideas-and-ingest.md` |
| Metrics and performance | `notes/metrics-and-performance.md` |
| Found content | `notes/found-content.md` |
| Drafting and voice | `notes/drafting-and-voice.md` |
| Post tagging | `notes/tagging.md` |
| Post page and Recreate | `notes/recreate.md` |
| Today | `notes/today.md` |
| Competitors | `notes/competitors.md` |
| Sharpen and the taste loop | `notes/sharpen-and-taste.md` |
| Brand gate | `notes/brand-gate.md` |
| Weekly review | `notes/weekly-review.md` |
| Trial Reel tests | `notes/trial-reel-tests.md` |
| Creator suggestions | `notes/creator-suggestions.md` |
| Seeding, running the cron, applying migrations by hand | `notes/runbook.md` |

## Cross-cutting rules

- Weekday 0 is Monday everywhere in the engine; times are America/Chicago.
- Every GET `/api/content` route exports `fetchCache = "force-no-store"` beside `dynamic = "force-dynamic"`.
  Next 14 caches a GET route handler's fetches (every Supabase read) without it, and Vercel keeps that
  cache across requests: a query whose URL never changes (pending runs, active taste rules) is served
  stale indefinitely. `wiring.test.ts` asserts it; a new GET route goes on that list.
- The standard in `engine/brand.ts` is a hand copy of the `brand-writing` skill: change both together.
  Any new build that produces, rewrites or ranks content goes through `gatePiece` or `gateOptions`
  in `data/gate/brand-gate.ts`.

## Touchpoints outside this folder

Nothing in `shared/` or another feature imports content. To move or remove it,
these are all the places that know it exists:

- `src/app/(app)/content/**`, `src/app/api/content/**` — the routes.
- `src/app/(app)/layout.tsx` (`showContentNav`) and `Sidebar.tsx` (`contentNavItem`) — the nav entry.
- `src/app/robots.ts` — `/content` disallow; `src/app/content-route.test.ts` asserts it and the sitemap.
- `vercel.json` — the daily metrics cron. `next.config.mjs` — `jsdom` external package.
- `package.json` — `jsdom`, `@mozilla/readability`, `@anthropic-ai/sdk` are used only here.
- `supabase/migrations/0008`, `0009`, `0011`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`, `0020`, `0021`, `0022`, `0023` and the `content_*` types in `shared/supabase/database.types.ts`.
- `routines/` (repo root: routine instructions and README), `.claude/skills/content-*` (local companions: daily, draft, found, plaud, resume, tag, voice), `docs/superpowers/**` — the routines and their docs.
- Env: `CONTENT_OWNER_USER_ID`, `CONTENT_ENGINE_SECRET`, `CRON_SECRET`, `COMPOSIO_APIFY_CONNECTION_ID`, `CLICKUP_WORKSPACE_ID` (the digest), and the platform keys in `docs/PRODUCT-STATUS.md`.
