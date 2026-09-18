# features/content — the content engine

Spec: `docs/superpowers/specs/2026-09-17-content-engine-design.md`. Owner-only:
every page and action opens with `requireContentOwner()` from `data/owner.ts`.

## Map

- `engine/` — pure, tested. `schema.ts` is the ingest contract the routines
  write against; `types.ts` mirrors migration 0008's check constraints.
- `data/` — `actions.ts` (Server Actions), `ingest.ts` and `context.ts` (endpoint
  logic behind an interface), `supabase-db.ts` (the adapter), `api-auth.ts`.
- `ui/` — one file per component. `IdeaCard` is used by the inbox and the idea page.
- Routes: `src/app/(app)/content/**` and `src/app/api/content/**`.
- `engine/prompts/ideas.ts` — the generation rules. The daily routine reads it
  from its checkout; PR 4 uses it as a Claude system prompt. `ideas.test.ts`
  asserts it names every ingest field.
- `data/clickup.ts` — task per liked idea, best effort, healed on the next Like.
  The spec's format tag is deferred; the format is in the task name.
- `routines/` (repo root) — routine instructions and README; `.claude/skills/`
  holds the local companions `/content-plaud` and `/content-daily`.

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

## Applying the migration

Run `supabase/migrations/0008_content_engine.sql` in the Supabase SQL editor,
then set `CONTENT_OWNER_USER_ID` (from `auth.users`) and `CONTENT_ENGINE_SECRET`
in Vercel and `.env.local`.
