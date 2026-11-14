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
  with every snapshot (paged) for the Performance and Week pages.
- `engine/baseline.ts` — 90-day window, baseline group, views baselines, matched-age
  multiplier, status and Evergreen flag. `engine/overview.ts` — Overview cards and the
  `?window=` filter. Both pure; slices 2, 3 and 6 reuse them.
- `data/found.ts` — `mineFound()`, the one flow for pasted URLs and uploads, over a
  `FoundDeps` interface. `claude.ts` is the single Claude call (`record_ideas`, tool_choice auto
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
- `engine/tags.ts` — the six tags' value lists, plus `topic` as a seventh (`POST_TAG_NAMES`; `TAG_NAMES` stays the six, because competitor tagging needs a confidence for every one) (`HOOK_TYPES` is shared with ideas), caption
  length, cover summary, `parseTagFilters`/`filterByTags` and the tag endpoint's zod schema.
  `engine/performance-view.ts` — Overview cards for the filtered posts, baselines from all.
  `data/tags.ts` (`getTagQueue`, `storeTags`, `correctTags`) over `TagsDb`;
  `supabase-tags-db.ts` is the adapter plus `igMediaUrlLookup`. Routes
  `GET /api/content/tags/queue` and `POST /api/content/tags`; `tag-actions.ts` is the
  correction Server Action. Tagging runs in `routines/content-tag.md` (weekly, and
  `/content-tag`), not in the cron.
- `engine/winners.ts` (top-third counts per tag value), `post-figures.ts`, `recreate.ts` (schema,
  prompt, idea mapping) — pure, slice 3. `data/recreate.ts` is the flow over `RecreateDb`
  (start, run, pick, regenerate); `supabase-recreate-db.ts` is the adapter and builds the prompt's
  context; `recreate-actions.ts` holds the Server Actions; `post-detail.ts` loads the post page
  (`/content/performance/[postId]`); `loadOpenRecreations` in `queries.ts` feeds the Inbox card.
- `engine/experiments.ts` (evidence counts over eligible Reels, control recipe, picker, reason, verdict,
  tally, `tagsFromRecipe`) and `today-brief.ts` (prompt, tool schema, idea patch, recipe) — pure, slice 5.
  `data/today.ts` is the flow over `TodayDb` (daily briefs, moment, swap, skip, expire, judge, make now);
  `supabase-today-db.ts` is the adapter and builds `/content/today`; `today-cron.ts` is the tail of the
  metrics cron; `today-actions.ts` holds the Server Actions; `mark-posted-brief.ts` links an experiment
  at Mark posted. UI: `BriefCard`, `MomentForm`, `MakeNowButton`, `VerdictsList`, `TallyTable`,
  `YouTubeSlots`, `AutoRefresh`. `today.fake.ts` is the in-memory `TodayDb` for tests.
- Slice 6, competitors: `engine/competitors.ts` (Apify item mapping and filters, per-creator median, popularity,
  freshness, the 6-word copy check) and `engine/competitor-tags.ts` (tagging prompt and schema) are pure;
  `competitorTest` in `experiments.ts` picks a format or source test. `data/pulls/apify.ts` is the Apify client
  over Composio; `data/competitors.ts` the flow over `CompetitorsDb` (creators, Monday pull, collect, tag;
  `competitors.fake.ts` for tests); `supabase-competitors-db.ts` the adapter and the Creators page;
  `competitor-cron.ts` the cron step; `competitor-actions.ts` the Creators page actions. Today's slot 2 lives in
  `data/today.ts`. UI: `CreatorsTable`, `AddCreatorForm`, the competitor line in `BriefCard`. Route `/content/creators`.
- Sharpen and the taste loop (4c): `engine/sharpen.ts` (the four marks, 3-rewrite schema and prompt, the in-place idea
  patch) and `engine/taste.ts` (constants, the proposal prompt, `mergeProposal`) are pure. `data/sharpen.ts` is the
  Sharpen flow over `SharpenDb` (`sharpen.fake.ts`); `data/taste.ts` the notes, proposals and approval flow over
  `TasteDb` (`taste.fake.ts`); `supabase-sharpen-db.ts` and `supabase-taste-db.ts` are the adapters (the proposal
  write is the `content_apply_taste_proposal` SQL function); `sharpen-actions.ts` and `taste-actions.ts` hold the
  Server Actions; `taste-run.ts` starts a proposal in the background (a plain module: every export of a
  server-action file is an endpoint). UI: `SharpenPanel` (built by the pages and passed to the cards as a slot),
  `TasteRules`. `loadSharpenStates` in `queries.ts` feeds the pages. Route `/content/taste`.
- The brand gate: `engine/brand.ts` (pure) holds the standard copied from the `brand-writing` skill (readers,
  six-line test, voice pairs, five personal and four Amplifica pillars, guardrails, Amplifica layer, retired words),
  `VERIFIED_FIGURES`, `BRAND_FACTS`, `brandBrief()`, the check/rewrite prompt and schemas, `pillarBalance`, `gateLine`.
  `prompts/ideas.ts` exports `BRAND_CONTEXT` (brief plus facts), which every generator prompt embeds. `data/brand-gate.ts`
  is the flow (`gatePiece`: check, one rewrite, re-check; `gateOptions`: check-only, parallel; `gateRecord`,
  `gateColumns`). `data/gate-sweep.ts` releases `gating` ideas (`GateDb`, `gate.fake.ts`); `gate-run.ts` sweeps a fresh
  batch after the response and posts its digest; `gate-digest.ts` is the ClickUp digest; `gate-backfill.ts` the
  one-time backfill; `supabase-gate-db.ts` the three adapters. UI: `GateCheck` (idea page), `GateFailedList`
  (Performance). `loadGateFailed` and `loadPillarBalance` in `queries.ts`.
- The weekly review (slice 4 + PR 5): `engine/focus.ts` (pure: `focusCounts` per hook type and topic, `decideFocus` for the
  double-down and skip lists, `isSkipped`, `focusTier`, `orderForToday`, `evidenceWithoutSkipped`, `focusBrief`/`reviewBlock`
  for prompts, `skipEnd`) and `engine/review.ts` (pure: the week and its Chicago-midnight dates, `weekPosts`, `accountTiles`,
  `pillarSpread`, `gateWeek`, `summaryLine`, and the why call's prompt, schema and `groundedWhy`). `data/focus.ts` is the
  stored lists over `FocusDb` (`focus.fake.ts`, `supabase-focus-db.ts`: `applyReviewFocus`, `bringBack`, `releaseEndedSkips`,
  `activeFocus`, `loadActiveFocus`, `addTestDoubleDown`); `data/review.ts` is `buildReview` over `ReviewDb` (`review.fake.ts`,
  `supabase-review-db.ts`); `data/review-sections.ts` holds the seams the Trial Reel tests and the creator suggestions fill
  (`loadExtraOutcomes`, `loadTestSection`, `loadSuggestionsSection`: empty until those slices exist); `data/review-actions.ts`
  is Build now and Bring back. `data/topics.ts` (topic list, `resolveTopic`) and `data/topic-backfill.ts` (one-time topics for
  existing ideas, `?topics=dry|run` on the metrics cron; pass `&after=<next_after>` from the last report to continue past ideas the model answered none for) give posts and ideas a topic; `PILLAR_TOPICS` in `engine/brand.ts`
  is the seed. `data/account-stats.ts` stores one follower reading a day (the metrics cron) for the follows tile. UI:
  `ReviewPage`, `ReviewLists`, `BuildNowButton`, `BringBackButton`. Pages `/content/review` and `/content/review/[weekStart]`;
  route `POST /api/content/review/build`; `routines/content-weekly.md` (Monday 07:30, after tagging).
- `routines/` (repo root) — routine instructions and README; `.claude/skills/`
  holds the local companions `/content-plaud`, `/content-daily`, `/content-draft` and
  `/content-voice`.

## Touchpoints outside this folder

Nothing in `shared/` or another feature imports content. To move or remove it,
these are all the places that know it exists:

- `src/app/(app)/content/**`, `src/app/api/content/**` — the routes.
- `src/app/(app)/layout.tsx` (`showContentNav`) and `Sidebar.tsx` (`contentNavItem`) — the nav entry.
- `src/app/robots.ts` — `/content` disallow; `src/app/content-route.test.ts` asserts it and the sitemap.
- `vercel.json` — the daily metrics cron. `next.config.mjs` — `jsdom` external package.
- `package.json` — `jsdom`, `@mozilla/readability`, `@anthropic-ai/sdk` are used only here.
- `supabase/migrations/0008`, `0009`, `0011`, `0013`, `0014`, `0015`, `0016`, `0017`, `0018`, `0020`, `0021` and the `content_*` types in `shared/supabase/database.types.ts`.
- `routines/`, `.claude/skills/content-*` (incl. `content-draft`, `content-voice`), `docs/superpowers/**` — the routines and their docs.
- Env: `CONTENT_OWNER_USER_ID`, `CONTENT_ENGINE_SECRET`, `CRON_SECRET`, `COMPOSIO_APIFY_CONNECTION_ID`, `CLICKUP_WORKSPACE_ID` (the digest), and the platform keys in `docs/PRODUCT-STATUS.md`.

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
- `obsidian_path` must be `C - Writing/Content/<format>/<YYYY-MM-DD slug>.md` (or
  `... slug (N).md`) with the format matching the idea: lowercase letters, digits and
  hyphens only, so nothing in it can reach a shell. The queue response gives each idea
  a `suggested_obsidian_path` (Chicago date); the skill checks existence with the Read
  tool and POSTs the free name. The skills only create files there, never edit or delete.
- Lint runs once, on the humanized first draft. There is no Mark-posted gate.
- Never used is derived, not stored (inbox over 14 days, queued over 30 since the
  Like); the Inbox, queues and week plan exclude those ideas, and `moveIdea` ranks
  only the ideas the queue shows. `rejected` and `archived` are never in it. The
  drafts queue (`GET /api/content/drafts/queue`, bare mode) excludes them too, while
  `?id=` still serves an explicit one.
- The cron refreshes `media_type` and `thumbnail_url` on existing posts and nothing else; `upsertPosts` stays insert-ignore.
- Every baseline uses `WINDOW_DAYS` (90) and `baselineGroup`; there is no second window.
- `loadPostsForMath` pages the snapshot read in 1,000s; PostgREST caps a single response at 1,000 rows.
- Tagging never writes `pillar` (the idea routine's content pillar). `message` is the personal pillar slug (the old canon values are legacy). `topic` is a `content_topics` slug under that pillar. A hook type copied onto a post by `markPosted` is not locked: the routine
  replaces it with what the post did.
- `storeTags` skips any field named in `tag_locks`; `correctTags` locks each tag it writes at
  confidence 1 and leaves `tagged_at` alone, so a corrected post is still queued for its
  other tags. To re-queue unlocked posts after a list change:
  `update content_posts set tagged_at = null where platform = 'instagram' and cardinality(tag_locks) = 0;`
- Tag writes are conditional on the row's `updated_at` (read with the locks): if Miguel corrects a tag
  while the routine runs, the write misses, re-reads once, and either lands with the new locks or
  reports `conflict`. `markPosted` leaves a hook type the routine set or Miguel corrected alone.
- The tag queue excludes stories and takes a fresh `media_url` from Composio at request time;
  Instagram's CDN links expire, so none is stored.
- One live recreation per post and mode (partial unique index on `content_recreations`). A start first
  marks that post's pending rows older than 10 minutes failed, so a crashed job never blocks a retry.
  The daily cap (10, America/Chicago day) counts every status.
- A pick claims the row (`ready` to `picked`) before it inserts the idea, and puts it back to `ready` if
  the insert fails, so a double click makes one idea. Recreated ideas are Reels at score 1 with
  `source_post_id`; they go through an app-only schema, so the shared ingest contract and the daily
  routine's prompt never carry `source_post_id`.
- The Recreate job runs after the response with `waitUntil`, through the admin client; every query in
  `supabase-recreate-db.ts` filters by the owner's id, because the admin client bypasses RLS. A missing
  `ANTHROPIC_API_KEY` is checked before any row is inserted.
- Today (slice 5): a brief is a Reel idea plus a `content_experiments` row. The evidence is eligible
  Reels only (`isEligible`), so the tally and the winners block agree. A (variable, value) pair held by
  an open or posted experiment is never proposed again; slots on one day never share a variable (the
  moment slot and refills included); an idea that ever had an experiment is not picked again, so expired
  and skipped briefs wait in the Inbox for Miguel. Swap rewrites the open experiment in place. A proposed brief rewrites the claimed Inbox idea in place (old hook kept in `hook_alt`); unposted
  briefs are skipped by the next cron and their ideas return to the Inbox. Mark posted tags an untagged
  Instagram post from the brief's recipe and never overwrites existing tags. Briefs are generated at the
  end of the metrics cron (Hobby does not order two crons), skipped with a failed run when under 90
  seconds remain; on-demand briefs (swap, moment, make now) are capped at 5 per Chicago day. `idea_id` is unique only among live
  experiments, so a skipped idea can be briefed again. YouTube slots are the top two of the YouTube queue,
  with no evidence; the planned link to Instagram winners is a comment in `YouTubeSlots.tsx`.
- Competitors (slice 6): one Apify run a week (Monday cron, or `?competitors=now`) for every watching creator,
  capped at $1 by Apify's `maxTotalChargeUsd`; results are read from the run's dataset on a later cron and kept only
  when `ownerUsername` is a watched creator, the item is a Reel (`type` Video) and it falls in the creator's window
  (90 days first, 21 after). A run records the usernames it sent and only they get its outcome; a failed run
  sets `last_pull_status` but keeps `last_pulled_at` (the last successful pull), so a creator whose first pull
  failed still gets 90 days. A re-pull updates views; no snapshots. Popular is 3x the creator's 90-day median
  (thin under 8 Reels); fresh is 14 days. Only popular fresh posts are tagged, by Claude from caption and
  thumbnail, at most five per cron and only while the Today tail keeps 150 seconds. A post seeds at most one brief
  ever (`briefed_at`, set even when both copy checks fail), always in slot 2, and the competitor brief is picked
  first so slot 1 and the moment avoid its variable. Swap turns it into a proposed brief and clears the link; a
  topic brief's swap takes a fresh Inbox idea. `new-format` is a recipe value only: Mark posted leaves
  `post_style` blank for it and the tally never counts it. A post's `source` comes from its idea's `competitor`
  source (`meta.angle`); everything else is `own`. Removed creators are never pulled and never seed briefs.
- Sharpen (4c): one live sharpen per idea (partial unique index), 10 a day (every status counts), a pending row older
  than 10 minutes is failed. Only an `inbox` or `queued` idea that has no draft or Obsidian file and no open or
  posted Today experiment can be sharpened. Pick claims the row (`ready` to `picked`), re-checks the idea, then
  rewrites it in place (old hook to `hook_alt`; status, format, pillar, score and rank stay) and, for a queued idea,
  renames its ClickUp task (`refreshClickUpTask`, best effort) or creates the one it lacks. Try again reuses the chips and text and stores no second note. When Today claims an idea for a brief it
  discards that idea's live sharpen first.
- Taste rules (4c): a rule is `proposed`, `active`, `off` or `rejected`, and `active = (status = 'active')` is a
  database check, so the context endpoint and every prompt read only approved rules. A note feeds at most one
  proposal; a failed proposal leaves its notes unused. A proposal runs after 5 unused notes (silently) or on the Taste
  page's button, at most 3 a day, one pending at a time (a partial unique index; pending ones older than 10 minutes
  are failed first). `mergeProposal` drops any new rule matching an existing rule after lowercasing and
  stripping punctuation: evidence for an active or proposed one, nothing for a rejected or turned-off one. Approved
  rules reach the daily routine (context endpoint), Today's brief writer and Sharpen; Recreate does not use them.
- `content_voice.built_from` is `{ files: [{path, mtime, bytes}], previous_profile_md }`.
- Every GET `/api/content` route exports `fetchCache = "force-no-store"` beside `dynamic = "force-dynamic"`.
  Next 14 caches a GET route handler's fetches (every Supabase read) without it, and Vercel keeps that
  cache across requests: a query whose URL never changes (pending runs, active taste rules) is served
  stale indefinitely. `wiring.test.ts` asserts it; a new GET route goes on that list.
- Brand gate (2026-11-10): every idea is checked before Miguel sees it. Ingest writes ideas as `gating`; every list
  filters on `inbox` or `queued`, so a gating idea is never shown. The sweep moves a pass to `inbox` (rewritten in
  place when the gate rewrote it, old hook to `hook_alt`, the original in `gate_original`) and a second fail to
  `gate_failed`; a gate error leaves it `gating` and bumps `gate_attempts` (fewest attempts are swept first), and the
  third error moves it to `gate_failed` with the error as its reason: an idea never reaches the Inbox unchecked, and
  never waits unseen. A rewrite that adds a figure the original and `VERIFIED_FIGURES` lack fails (`addedFigures`).
  Every outcome write is conditional on `status = 'gating'`. Like, Pass and Mark posted refuse `gating` and
  `gate_failed`; Archive refuses only `gating`. The idea's `pillar` is the gate's personal pillar slug.
- The cron's gate sweep runs after Today, on the time Today leaves (30-second calls, 70-second reserve); the
  background sweep after ingest does most of the work. Today gates its slots in parallel. The snapshot a failed Today
  run restores includes `gate` and `pillar`.
- Today briefs are checked with one rewrite before the claimed idea is patched; a brief whose gate pillar differs from
  its `message` fails; a failed slot stays empty and its idea untouched. Sharpen and Recreate options are checked once
  (no rewrite) and failing ones are dropped; a pick refuses an option with no gate result (a card from before the
  gate). A posted draft is checked with no rewrite and its result nests under `gate.draft`, leaving the idea's check
  alone: the first fail is a 422 `brand_gate`, the second (`gate.draft.fails`) is final and moves the idea to
  `gate_failed`. The idea card offers no Like or Pass on `gating` or `gate_failed` ideas; chain badges skip `gating`.
- The ClickUp digest lists only a routine batch's passed ideas (by `ingest_batch`), once every idea in it is settled;
  found content (url and upload sources) never gets one. `digest_posted_at` stamps a posted batch.
- A post's `message` tag and Today's `message` variable are the five personal pillar slugs (`MESSAGES`); the old
  canon values are `LEGACY_MESSAGES`, valid on history and locked tags, never written, and skipped by the tally.
- The standard in `engine/brand.ts` is a hand copy of the `brand-writing` skill: change both together.

- Weekly review lists: a hook type or a topic needs `FOCUS_MIN_POSTS` (3) eligible Instagram Reels in the 90-day window. Double
  down: at least half won and more won than lost. Skip: none won and at least half lost. A value under a running skip is not
  re-evaluated. The lists run on settled numbers (`isEligible`, so a post counts about a week after it goes up); the page's
  section 2 is looser and labels young posts "early read".
- While any eligible Reel in the window is untagged (`untaggedEligible`), a review decides no new skip (`holdSkips`; existing skip rows are left as they are) and the page says so: a 90-day skip must not rest on a half-tagged sample. The lists are applied after the review is saved, so a failed build leaves no skip behind. The tag queue also returns tagged posts that only lack a topic (a pillar, an unlocked topic), so Reels made from a Today brief still get one.
- The lists act on ideas whose format is `reel` only; newsletter, YouTube, Story and X ideas are never hidden or re-ranked by
  them. Queued ideas are never hidden (in the queues or in Never used). A skipped idea in the Inbox is hidden, not deleted.
- A skip lasts `SKIP_DAYS` (90) from the review day and its dates never move: a rebuild of the same week may add or withdraw
  skips that week started, and never touches an earlier week's. A lifted skip is never touched. Bring back ends a skip at once
  and protects the value for `BRING_BACK_PROTECT_DAYS` (90). Double-downs are replaced only by the newest week's review; a
  `source = 'test'` double-down is never touched by a review.
- `content_ideas.inbox_since` restarts the Never-used clock (null means `batch_date`): Bring back and `releaseEndedSkips` (in
  the metrics cron before Today) set it, so a hidden idea gets its 14 days back in the Inbox. A clock only moves forward, and an
  idea another running skip still hides keeps its clock.
- A review is a snapshot as of its Monday 00:00 America/Chicago (`asOfFor`): `loadPostsForMath(…, { before })` leaves out later
  posts and snapshots, so Build now on a Wednesday gives Monday's lists. The why call (one Claude call, `groundedWhy` checks each
  sentence names a tag or count) can fail without losing the review or the lists: `why: "failed"`, every why is "No clear reason."
  The review writes no content, so nothing it produces goes through the brand gate; what it changes is the order and choice
  of already-gated ideas.
- A post made from a Today brief is tagged at Mark posted and never reaches the tagging routine, so `linkBriefExperiment` copies
  the idea's topic. The gate picks an idea's topic from the offered list under its own pillar and never proposes a new one;
  the tagging routine may propose a label (`topic_label`), which is added and used at once.
- To re-queue existing posts for the tagging routine after a list change (the topic rollout does this once):
  `update content_posts set tagged_at = null where platform = 'instagram' and posted_at >= now() - interval '90 days' and not ('topic' = any(tag_locks));`
  Until the routine finishes, untagged posts are not counted, so Today's evidence and the lists are thin.

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
