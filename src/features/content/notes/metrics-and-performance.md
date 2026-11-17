# content — Metrics and performance

Daily platform pulls, snapshots, baselines, Overview and Performance (slice 1). Index and cross-cutting rules: `../CLAUDE.md`.

## Files

- `data/pulls/` — one file per platform (`instagram.ts` via Composio, `youtube.ts`,
  `beehiiv.ts`), each returning the same `Pull` shape; the mappers are pure and
  tested with recorded fixtures. `data/metrics/metrics.ts` stores a pull through
  `MetricsDb`; `api/content/cron/metrics` runs all three daily (one route, not
  three: Vercel Hobby allows two crons).
- `engine/snapshots.ts`, `normalize.ts`, `attribution.ts`, `best-times.ts`,
  `plan.ts` — the performance math, pure. `data/metrics/performance.ts` loads posts
  with every snapshot (paged) for the Performance and Week pages.
- `engine/baseline.ts` — 90-day window, baseline group, views baselines, matched-age
  multiplier, status and Evergreen flag. `engine/overview.ts` — Overview cards and the
  `?window=` filter. Both pure; slices 2, 3 and 6 reuse them.

## Invariants

- A metrics re-run appends a snapshot and changes nothing else: posts and
  comments are insert-ignore, so a hand-logged post keeps its idea link.
- External ids match `engine/posts.ts`: Instagram shortcode, YouTube video id,
  beehiiv slug. A YouTube video of 60 seconds or less is a `reel`.
- The cron refreshes `media_type` and `thumbnail_url` on existing posts and nothing else; `upsertPosts` stays insert-ignore.
- Every baseline uses `WINDOW_DAYS` (90) and `baselineGroup`; there is no second window.
- `loadPostsForMath` pages the snapshot read in 1,000s; PostgREST caps a single response at 1,000 rows.
