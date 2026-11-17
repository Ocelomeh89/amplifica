# content — Post page and Recreate

The post detail page and Recreate (slice 3). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `engine/winners.ts` (top-third counts per tag value), `post-figures.ts`, `recreate.ts` (schema,
  prompt, idea mapping) — pure, slice 3. `data/recreate/recreate.ts` is the flow over `RecreateDb`
  (start, run, pick, regenerate); `recreate/supabase-recreate-db.ts` is the adapter and builds the prompt's
  context; `recreate/recreate-actions.ts` holds the Server Actions; `recreate/post-detail.ts` loads the post page
  (`/content/performance/[postId]`); `loadOpenRecreations` in `queries.ts` feeds the Inbox card.

## Invariants

- One live recreation per post and mode (partial unique index on `content_recreations`). A start first
  marks that post's pending rows older than 10 minutes failed, so a crashed job never blocks a retry.
  The daily cap (10, America/Chicago day) counts every status.
- A pick claims the row (`ready` to `picked`) before it inserts the idea, and puts it back to `ready` if
  the insert fails, so a double click makes one idea. Recreated ideas are Reels at score 1 with
  `source_post_id`; they go through an app-only schema, so the shared ingest contract and the daily
  routine's prompt never carry `source_post_id`.
- The Recreate job runs after the response with `waitUntil`, through the admin client; every query in
  `recreate/supabase-recreate-db.ts` filters by the owner's id, because the admin client bypasses RLS. A missing
  `ANTHROPIC_API_KEY` is checked before any row is inserted.
