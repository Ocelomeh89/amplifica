# Content engine slice 1: baselines and status

> **Build note for Miguel:** build this slice with a smaller model (Sonnet 5.5).
> It is constants, mappers, one migration and one page section, all under tests
> that this document names. Keep the large model for specs and reviews.

Roadmap: `2026-10-13-content-engine-instagram-intelligence-roadmap.md`, slice 1.
Parent design: `2026-09-17-content-engine-design.md` ("Performance math"). Status:
approved 2026-10-18, built on branch `feat/content-baselines-status`; migration 0013 and production acceptance pending.

## Intent

Every Instagram post gets one honest answer to "is this doing better than my
typical post?", compared at the same age, with the typical post defined per media
type over the last 90 days.

Today the Performance page normalizes saves, shares and watch time against a 60-day
median per platform and format, and that is all. Views, the number Miguel actually
reads, have no baseline. Carousels and images sit in a blank format bucket. A post
published yesterday is compared with posts that had weeks to accumulate. And the
page already reads a truncated snapshot set without knowing it. Slice 1 fixes those
four things and gives later slices (classification, competitors, Recreate, Post
Today) the functions they reuse.

## Goals

- A views baseline per group: settled P25, P50, P75, P90, sample size, thin flag,
  plus a day-N median for N in 2..7 with its own sample size and thin flag.
- A views multiplier per post at matched age, with a settled fallback, each carrying
  the thin flag of the denominator it used.
- A status per post (Pending, Lagging, Normal, Promising, Viral) and a separate
  Evergreen flag.
- Instagram media type and thumbnail stored, refreshed by the cron.
- Insights pulled for every post of the last 90 days, not the first 100 items.
- The snapshot read paginated, so the math sees every row.
- Overview cards on the Performance page with a 7, 14, 30, 90-day post filter.
- One window constant for all baselines, including the existing rate medians.

## Non-goals

- No classification, no Claude call, no API key. That is slice 2.
- No competitor data. Slice 6.
- No post detail page. Slice 3. The thumbnail is stored now so slice 3 has it.
- No new tab. The cards live on the Performance page.
- No change to `attribute()` thresholds, lists or grouping (it still groups by
  `format`), and no removal of the existing `n_saves`, `n_shares`, `n_watch`,
  `n_reach` columns.
- No YouTube work. The channel has zero videos as of 2026-10-18, so the empty
  YouTube table is correct, not a bug.
- No snapshot pruning. Pagination is enough for a year; thinning old daily rows is
  a later housekeeping item.

## Anti-goals

- A second baseline module with its own window or thin rule. There is one window
  and one grouping function, shared by the rate medians and the views baseline.
- A status that makes a two-day-old post look like a failure.
- A label that overrides Viral or Lagging. Evergreen is a flag next to the status,
  never instead of it.
- A cron run that overwrites `format`, `pillar`, `hook_type`, `hook_used` or
  `idea_id` on an existing post.

## Constraints

- `features/content` rules apply: pure math in `engine/`, reads in `data/`, pages
  are layout only, every page opens with `requireContentOwner()`.
- The cron stays idempotent: a re-run appends snapshots and refreshes media fields,
  nothing else.
- Migration 0013 is applied by hand in the Supabase SQL editor like 0008 to 0012,
  with a `0013_*.test.ts` asserting its shape.
- `pnpm test`, `pnpm typecheck`, `pnpm build` pass. `boundaries.test.ts` and
  `features/content/wiring.test.ts` keep passing without edits.

## Data this is built on (2026-10-18)

| Fact | Value |
|---|---|
| Instagram posts in the table | 97: 72 Reels, 25 blank format (carousels and images) |
| Reels published since snapshots began (2026-09-29) | 24, of which 14 are a week old or more |
| Non-Reels published since snapshots began | 6, of which 4 are a week old or more |
| Non-Reels in the 90-day window | 22 |
| Snapshot cadence | one per post per day, cron at 10:00 UTC, since 2026-09-29 |
| Snapshot rows today | about 2,200 across Instagram and beehiiv, growing by about 130 a day |
| PostgREST default response cap | 1,000 rows; nothing in the repo raises it |

So on day one the settled Reel baseline and the day-7 Reel median both clear the
thin threshold. The carousel baseline is settled on 18 posts but its day-7 sample is
4, so the card reads "thin at day 7" for a few more weeks. And the current page is
computing from an arbitrary 1,000 of the 2,200 snapshot rows, which Decision 10
fixes.

## The decisions

### Decision 1: one grouping function

`baselineGroup(post)` returns `instagram:<media_type>` for Instagram and
`<platform>:<format>` for everything else. An Instagram post with an empty media
type groups as `instagram:unknown`. `normalizePosts` switches from its own
`platform:format` key to this function, so carousels leave the blank bucket in the
rate medians too.

### Decision 2: one window, and what the filter does

`WINDOW_DAYS = 90`, exported from the engine and used by `normalizePosts` (which
drops its `windowDays = 60` default) and by the views baseline. The Overview
filter selects which posts the cards count. It never changes the window the
baseline is computed over, and it does not touch the table or the attribution
panels.

### Decision 3: the views baseline

For each group, over posts published inside the window:

- **Settled set:** posts at least `SETTLED_MIN_AGE_DAYS` (14) old with a latest
  snapshot that has views. Over it: `count`, `p25`, `p50`, `p75`, `p90` of latest
  views, and `thin` when `count < THIN_BASELINE_BELOW` (8). `p50` is also the
  settled denominator in Decision 4, so the card and the table reconcile by eye.
- **Day medians:** for N in 2..7, `day[N] = { median, count, thin }` over posts in
  the group and window that have `dayViews(post, N)`. Same threshold.

`dayViews(post, N)` is the views value of the snapshot whose `captured_at` is
nearest `posted_at + N × 24h`, provided it is within `DAY_TOLERANCE_HOURS` (18).
Otherwise null. The tolerance absorbs the cron's position in the day and one missed
run; two missed runs mean no value.

Young posts are excluded from the percentiles on purpose: their latest views are
low because they are young, not because they did badly.

### Decision 4: the multiplier

Each post gets `n_views`, `n_views_mode` and `n_views_thin`:

- **Pending** when the post is under `PENDING_HOURS` (48) old: `n_views` null, mode
  `pending`.
- **Matched** when `dayViews(post, N)` exists for `N = min(floor(age in days), 7)`
  and `day[N].median` exists: `n_views = dayViews / day[N].median`, mode `matched`,
  `n_views_thin = day[N].thin`. Day 7 is the canonical comparison from a week old
  onward.
- **Settled** otherwise, when the post is at least 14 days old and the settled set
  is non-empty: `n_views = latest views / p50`, mode `settled`, `n_views_thin =
  thin`.
- **None** when neither applies (a post between 2 and 14 days old whose snapshots
  were missed): `n_views` null, mode `none`, shown as a dash.

The medians include the post itself. With 8 or more posts that changes little;
with fewer, the denominator is thin and the row says so. (My call: simpler to test
and explain than leave-one-out.)

### Decision 5: the status and the Evergreen flag

Status comes from `n_views` alone:

1. `pending` mode → **Pending**.
2. `none` mode → no status (dash).
3. Under `LAGGING_BELOW` (0.5) **Lagging**; under `PROMISING_FROM` (1.5) **Normal**;
   under `VIRAL_FROM` (3.0) **Promising**; else **Viral**.

**Evergreen** is a separate boolean, shown as a second badge, never replacing the
status. It is true when the post is at least `EVERGREEN_MIN_AGE_DAYS` (28) old,
`dayViews(post, 14)` exists, and `(latest views − dayViews(post, 14)) / latest views
≥ EVERGREEN_LATE_SHARE` (0.2). In words: a fifth or more of its views arrived after
its second week. Without a day-14 snapshot the flag is false. (My call, replacing
an earlier rule anchored on `now − 14 days` that fired on nearly every post between
two and three weeks old.)

A thin denominator does not suppress the status. The badge reads "thin" next to it.

### Decision 6: the pull

`pulls/instagram.ts` changes in three places and nowhere else:

- `MEDIA_FIELDS` adds `media_url,thumbnail_url`. `IgMedia` gains both as optional.
- `igMediaType(m)` maps `media_product_type` REELS → `reel`, STORY → `story`; else
  `media_type` IMAGE → `image`, CAROUSEL_ALBUM → `carousel`, VIDEO → `video`; anything
  else → `""`. `igFormat` is unchanged, so the queue still sees only Reels and
  Stories.
- `PulledPost` gains `media_type: MediaType | ""` and `thumbnail_url: string`
  (`thumbnail_url ?? media_url ?? ""`). YouTube and beehiiv fill `""` for both.
- Paging stops when a page's oldest `timestamp` is older than `WINDOW_DAYS`, or at a
  safety cap of 400 items, whichever first. Insights and comments are fetched only
  for items inside the window. The old `MAX_MEDIA = 100` goes away. Posts older than
  the window stop getting snapshots and never receive a media type; that is
  accepted.

### Decision 7: storing media fields without breaking insert-ignore

`MetricsDb` gains `updatePostMedia(rows: { id; media_type; thumbnail_url }[])`,
called by `storePull` after `upsertPosts` for every pulled post whose values are
non-empty. It updates those two columns only. `upsertPosts` stays insert-ignore.
Instagram CDN URLs expire, which is why the thumbnail is refreshed on every run
rather than written once.

Implementation note: a partial upsert on `id` fails the NOT NULL checks on
`user_id`, `platform` and `external_id`, so the adapter issues one `update().eq("id")`
per row, batched a few at a time. A failed row is logged and skipped; it never fails
the pull.

### Decision 8: migration 0013

```sql
alter table public.content_posts
  add column media_type text not null default ''
    check (media_type in ('', 'reel', 'carousel', 'image', 'video', 'story')),
  add column thumbnail_url text not null default '';
```

`MEDIA_TYPES` in `engine/types.ts` mirrors the check list; the migration test
asserts the SQL contains every member and nothing else, like the 0012 test does for
defaults. `database.types.ts` gets the two columns by hand.

### Decision 9: what the Performance page shows

Above the attribution panels, a row of **Overview cards**, one per group with at
least one post published inside the selected filter window, Instagram groups first
by post count, then beehiiv. Each card:

- group label ("Reels", "Carousels", "Images", "Newsletter") and the number of
  posts published in the filter window;
- settled typical views (`p50`) and `p90`, both 90-day and unaffected by the
  filter, with a "thin baseline" badge when the settled set is thin and a "thin at
  day 7" badge when `day[7]` is thin;
- counts of Viral, Promising and Lagging among the filtered posts, and an Evergreen
  count.

The filter is four links above the cards, labelled "Posts from the last 7 / 14 /
30 / 90 days", `?window=7|14|30|90`, default 30, read by the page as a search
param. No client state. The table and the attribution panels always show every
post; their title and lists do not change with the filter.

The **Performance table** gains columns after "Format": "Type" (media type,
replacing today's `"feed"` fallback), "Views" (latest), "Views ×" (`n_views` to two
decimals with a mode suffix: `2.10× d7`, `0.80× settled`, plus "thin" when the
denominator is thin), and a "Status" column at the end before the links that shows
the status badge and, when set, the Evergreen badge. Sorting works on the new
numeric columns the way it does on the old ones.

Nothing else on the page moves.

### Decision 10: the snapshot read

`loadPostsForMath` reads `content_metrics` with `.range()` in pages of 1,000,
ordered by `captured_at`, until a page comes back short. The same rows feed
`pickSnapshots` (first and latest, unchanged) and the new per-post `series` of
`{ at, views }`. This fixes a live defect: with about 2,200 rows and a 1,000-row
cap, today's "latest" snapshot is whichever rows PostgREST happened to return.

`series` stays on the server. `TableRow` goes to a client component, so the page
strips `series` before passing rows down.

## Where the code goes

| Piece | File | Status |
|---|---|---|
| Constants, `baselineGroup`, `dayViews`, `viewsBaselines`, `viewsMultiplier`, `statusOf`, `isEvergreen` | `engine/baseline.ts` | new, pure |
| `WINDOW_DAYS` consumer, `baselineGroup` consumer | `engine/normalize.ts` | edit |
| `MediaType`, `MEDIA_TYPES` | `engine/types.ts` | edit |
| Media type mapping, fields, date-scoped paging | `data/pulls/instagram.ts` | edit |
| `media_type`, `thumbnail_url` on `PulledPost` | `data/pulls/types.ts`, `youtube.ts`, `beehiiv.ts` | edit |
| `updatePostMedia` | `data/metrics.ts`, `data/supabase-db.ts` | edit |
| Paginated snapshot read, `series` on `PostForMath` | `data/performance.ts` | edit |
| Cards, status badge, table columns | `ui/OverviewCards.tsx` (new), `ui/StatusBadge.tsx` (new), `ui/PerformanceTable.tsx` | new, new, edit |
| Page wiring, `?window=`, series stripped before the table | `app/(app)/content/performance/page.tsx` | edit |
| Migration and its test | `supabase/migrations/0013_content_media_type.sql`, `.test.ts` | new |
| Types | `shared/supabase/database.types.ts` | edit |
| Folder map and invariants | `features/content/CLAUDE.md` | edit |

`PostForMath.first` and `n_reach` stay as they are. `PostForMath` is built only by
`loadPostsForMath` and by `normalize.test.ts`, so adding `media_type` and `series`
is contained; the existing "different format on its own baseline" test case needs
`media_type` on its carousel fixture and nothing else.

## Tests the builder writes

- `engine/baseline.test.ts`: `dayViews` picks the nearest snapshot inside tolerance
  and returns null outside it; percentiles on known arrays over the settled set
  only (a 3-day-old post with huge views does not move `p50`); `day[N]` ignores
  posts without a day-N value; matched before settled before none; each status
  boundary at 0.5, 1.5 and 3.0; Evergreen needs age 28, a day-14 snapshot and the
  late share, and a 16-day-old Viral post is Viral and not Evergreen; thin at 7
  posts and not at 8, for the settled set and for `day[7]` separately;
  `baselineGroup` for each platform and the unknown case.
- `engine/normalize.test.ts`: window is 90 days; an Instagram carousel and a Reel
  land in different groups.
- `data/pulls/instagram.test.ts`: media type for each of the five inputs and the
  empty case; thumbnail fallback order; paging stops after the first page whose
  oldest item is past the window; items past the window get no insights call.
- `data/metrics.test.ts`: `updatePostMedia` receives only posts with non-empty
  values and only the two columns; `upsertPosts` payload unchanged.
- `data/performance.test.ts` (new, over a fake client): the read keeps requesting
  pages until a short one and concatenates them.
- `supabase/migrations/0013_content_media_type.test.ts`: both columns, the check
  list equals `MEDIA_TYPES` plus the empty string, no other table touched.
- The existing `features/content/wiring.test.ts` passes: the page keeps every read
  in `data/`.

## Acceptance

Done means all of the following on production after the first cron run:

1. Every Instagram post published in the last 90 days has a non-empty `media_type`
   and a `thumbnail_url`.
2. The Performance table shows a Status for every Instagram post older than 48 hours
   that has snapshots. Reels published from about 2026-09-22 on read `d7` (their
   day-7 snapshot exists); older ones read `settled`.
3. The Reels card carries no thin badge. The Carousels card reads "thin at day 7"
   and no "thin baseline".
4. No post in the table is both under 28 days old and Evergreen.
5. The cron response for Instagram lists posts and snapshots with no new error
   strings, and a second manual run adds snapshots only.
6. `pnpm test`, `pnpm typecheck`, `pnpm build` are green.

## Left to the builder

- Card layout within the existing `Card` component and theme tokens, badge colors,
  and the order of the four filter links.
- How `series` is shaped in memory as long as `dayViews` stays O(snapshots per
  post).
- Whether `viewsBaselines` returns a `Map` or an object, as long as the tests above
  read naturally.
- Batch size for the per-row media updates and the log wording when one fails.

## Follow-ups

Slice 2 adds tag columns next to `media_type`. Slice 3 reads `thumbnail_url` and
`n_views_mode`. Slice 6 calls `viewsBaselines`, `viewsMultiplier` and `statusOf` on
competitor posts with a per-creator group key. PR 5's weekly review reads the same
statuses. Snapshot thinning (one row a week for posts older than 90 days) is a
housekeeping item once the table passes a few tens of thousands of rows.
