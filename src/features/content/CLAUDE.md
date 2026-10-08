# features/content — the content engine

Spec: `docs/superpowers/specs/2026-09-17-content-engine-design.md`. Owner-only:
every page and action opens with `requireContentOwner()` from `data/owner.ts`.

## Map

- `engine/` — pure, tested. `schema.ts` is the ingest contract the routines
  write against; `types.ts` mirrors migration 0008's check constraints.
- `data/` — `actions.ts` (Server Actions), `ingest.ts` and `context.ts` (endpoint
  logic behind an interface), `supabase-db.ts` (the adapter), `api-auth.ts`.
- `ui/` — one file per component. `IdeaCard` is used by the inbox and the idea page.
- Routes: `src/app/(app)/content/**` and `src/app/api/content/**`. Pages are routing and
  layout only: every read is in `data/queries.ts` (or `data/performance.ts`), and every
  `/api/content` route opens with `authorizeRoutine()` from `data/api-auth.ts`.
  `wiring.test.ts` asserts both.
- `engine/prompts/ideas.ts` — the generation rules. The daily routine reads it
  from its checkout; PR 4 uses it as a Claude system prompt. `ideas.test.ts`
  asserts it names every ingest field.
- `data/clickup.ts` — task per liked idea, best effort, healed on the next Like.
  The spec's format tag is deferred; the format is in the task name.
- `data/pulls/` — one file per platform (`instagram.ts` via Composio, `youtube.ts`,
  `beehiiv.ts`), each returning the same `Pull` shape; the mappers are pure and
  tested with recorded fixtures. `data/metrics.ts` stores a pull through
  `MetricsDb`; `api/content/cron/metrics` runs all three daily (one route, not
  three: Vercel Hobby allows two crons).
- `engine/snapshots.ts`, `normalize.ts`, `attribution.ts`, `best-times.ts`,
  `plan.ts` — the performance math, pure. `data/performance.ts` loads posts
  with first and latest snapshots for the Performance and Week pages.
- `data/found.ts` — `mineFound()`, the one flow for pasted URLs and uploads, over a
  `FoundDeps` interface. `claude.ts` is the single Claude call (forced `record_ideas`
  tool); `fetch-page.ts` is the SSRF-guarded fetch; `found-form.ts` reads the form.
  `engine/angle.ts`, `found.ts`, `found-ideas.ts`, `readable.ts` are the pure parts.
  `engine/found.ts` is server-only (it imports `node:net`): client components import
  `foundBadge` from `engine/angle.ts`, which `found.ts` re-exports. `pnpm build` is
  what catches a violation.
- `data/found.ts` also holds `queueFound()` (queue mode: resolve, then save an
  `allowed`, unmined `url`/`upload` source with its text; no Claude). The queue is
  read by `GET /api/content/found/queued` (`data/found-queue.ts`, bearer-protected)
  and mined by `routines/content-found.md` (the weekly cloud routine and the
  `/content-found` skill). `engine/inbox.ts` ranks the Inbox by score and filters
  by type.
- `engine/lint.ts`, `drafts.ts`, `voice.ts`, `unused.ts`, `prompts/draft.ts`,
  `prompts/humanize.ts` — pure. Lint runs server-side when a draft is stored.
  `BANNED_VOCABULARY` (humanize.ts) is the one word list; `LINT_RULES` hints are
  asserted present in the prompts by `prompts/drafting.test.ts`.
- `data/drafts.ts` (`getDraftQueue`, `postDraft`) and `data/voice.ts` over
  `DraftsDb`/`VoiceDb`; `data/supabase-drafts-db.ts` is the adapter. Drafting
  runs in the local `/content-draft` skill (no API key); the Obsidian file is the
  final and the app deletes its drafts on Mark posted, keeping `obsidian_path`.
  Routes: `GET /api/content/drafts/queue`, `POST /api/content/drafts`,
  `GET|POST /api/content/voice`.
- `ui/UnusedCard.tsx` renders the Never used page (`/content/unused`), not
  `IdeaCard`; the tab has no count badge.
- `routines/` (repo root) — routine instructions and README; `.claude/skills/`
  holds the local companions `/content-plaud` and `/content-daily`.

## Touchpoints outside this folder

Nothing in `shared/` or another feature imports content. To move or remove it,
these are all the places that know it exists:

- `src/app/(app)/content/**`, `src/app/api/content/**` — the routes.
- `src/app/(app)/layout.tsx` (`showContentNav`) and `Sidebar.tsx` (`contentNavItem`) — the nav entry.
- `src/app/robots.ts` — `/content` disallow; `src/app/content-route.test.ts` asserts it and the sitemap.
- `vercel.json` — the daily metrics cron. `next.config.mjs` — `jsdom` external package.
- `package.json` — `jsdom`, `@mozilla/readability`, `@anthropic-ai/sdk` are used only here.
- `supabase/migrations/0008`, `0009`, `0011` and the `content_*` types in `shared/supabase/database.types.ts`.
- `routines/`, `.claude/skills/content-*` (incl. `content-draft`, `content-voice`), `docs/superpowers/**` — the routines and their docs.
- Env: `CONTENT_OWNER_USER_ID`, `CONTENT_ENGINE_SECRET`, `CRON_SECRET`, and the platform keys in `docs/PRODUCT-STATUS.md`.

## Invariants

- Ingest is all-or-nothing: zod validates the whole body before any write.
- A source that already exists keeps its status on re-ingest (insert-ignore),
  unless the payload carries `mined_at`, which sets it to `mined`.
- An idea's provenance is mandatory except newsletter ideas flagged
  `from_hook_backlog`.
- Ranks are per format; every move renumbers the queue from positions via
  `ranksAfterMove`, so drift heals itself.
- The routine never opens a `denied` or `pending` source; deny rules win.
- Ingest returns the rows it wrote; the digest links to `/content/ideas/<id>`.
- The context's `known_titles` covers every idea status, so a passed idea does
  not come back as new.
- A metrics re-run appends a snapshot and changes nothing else: posts and
  comments are insert-ignore, so a hand-logged post keeps its idea link.
- External ids match `engine/posts.ts`: Instagram shortcode, YouTube video id,
  beehiiv slug. A YouTube video of 60 seconds or less is a `reel`.
- Weekday 0 is Monday everywhere in the engine; times are America/Chicago.
- Found ideas go through `ingestPayload`, so they obey every ingest rule. The angle
  (Open, Counterpoint, Twist) is appended to the user turn only; `prompts/ideas.ts`
  is shared with the daily routine and is not edited for it.
- Nothing is written for a found source until Claude's answer validates. A denied
  source is never mined. Re-pasting a mined source generates again and updates its
  meta (source upserts are insert-ignore, so `setMeta` does the update).
- A found source is marked `mined` only after its ideas are written, on both paths:
  an explicit `markMined` in `mineFound`, and `ingestPayload` calling `markMined`
  after `insertIdeas`. A failed insert leaves it unmined (and queued). Bookkeeping failures after that are logged and do not turn the result
  into an error.
- Uploads are capped at 4 MB (Vercel's request limit) and live in the private
  `content-uploads` bucket under `<user id>/<sha256>/<filename>`. `loadFile` refuses
  paths outside `<user id>/`; `storeFile` upserts.
- `fetchPublicPage` bounds the response before buffering: it rejects a
  content-length over 20 MiB and reads at most 2 MiB.
- Queue state is `kind` in (`url`, `upload`), `status` `allowed`, no `mined_at`.
  `buildContext` leaves those kinds out of `known_sources` and `requested_sources`
  so the daily routine never tries to open them. Queue mode never calls Claude and
  never marks anything mined; the found-content routine does, through ingest, one
  body per source.
- The form shows queue mode when `ANTHROPIC_API_KEY` is unset; the key itself never
  reaches the client.
- A draft is stored atomically through the `content_store_draft` Postgres function:
  raw (v1), humanized (v2) and `obsidian_path` commit together or not at all. It
  locks the idea row; conflicts are `idea_not_queued` and `draft_exists` (409).
- `obsidian_path` must be `C - Writing/Content/<format>/<name>.md` with the format
  matching the idea. The skills only create files there, never edit or delete.
- Lint runs once, on the humanized first draft. There is no Mark-posted gate.
- Never used is derived, not stored (inbox over 14 days, queued over 30 since the
  Like); the Inbox, queues and week plan exclude those ideas, and `moveIdea` ranks
  only the ideas the queue shows. `rejected` and `archived` are never in it.
- `content_voice.built_from` is `{ files: [{path, mtime, bytes}], previous_profile_md }`.

## Seeding by hand

With `CONTENT_ENGINE_SECRET` set and the app running:

```bash
curl -sS -X POST "$NEXT_PUBLIC_SITE_URL/api/content/ingest" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" \
  -H "Content-Type: application/json" \
  --data @routines/examples/daily-ingest.json
```

Ideas are deduplicated by the routine against `known_titles`, not by ingest,
so running this twice inserts the two example ideas twice.

Then read the context a routine would see:

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/context" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" | jq .
```

## Running the cron by hand

```bash
curl -sS "$NEXT_PUBLIC_SITE_URL/api/content/cron/metrics?platform=beehiiv" \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

Drop `?platform=` to run all three. The response lists posts, snapshots,
comments, and errors per platform; HTTP 500 when every platform failed, where
a platform that returned no posts and reported errors counts as failed.

## Applying the migration

Run `supabase/migrations/0008_content_engine.sql` in the Supabase SQL editor,
then set `CONTENT_OWNER_USER_ID` (from `auth.users`) and `CONTENT_ENGINE_SECRET`
in Vercel and `.env.local`. Then run
`supabase/migrations/0009_content_uploads.sql` for the found-content upload bucket,
and set `ANTHROPIC_API_KEY` in Vercel and `.env.local`.
