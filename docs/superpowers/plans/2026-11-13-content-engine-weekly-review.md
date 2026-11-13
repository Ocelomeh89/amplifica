# Content engine weekly review: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Contract change** (against `2026-11-13-content-final-slices-shared-names.md`; no name is renamed):
> 1. `content_ideas.inbox_since`: null means "use `batch_date`", not `created_at`. The Never-used clock for Inbox
>    ideas already runs on `batch_date` (`engine/unused.ts:19`).
> 2. `evidenceCounts(..., extra?)` counts an extra only when its variable is one of `COUNTED`. `Evidence` has no topic
>    rows (`experiments.ts:56`), so an extra with `variable: "topic"` is counted by `focusCounts` only. Slice B loses
>    nothing: the lists read `focusCounts`.
> 3. `'topic'` is a valid `tag_locks` entry but is **not** added to `TAG_NAMES`, because
>    `engine/competitor-tags.ts:27,53` requires a confidence for every `TAG_NAMES` entry. The new list is
>    `POST_TAG_NAMES = [...TAG_NAMES, "topic"]`.
> 4. The loaders with no client parameter (`loadActiveFocus`, `addTestDoubleDown`, `loadFollowerCount`, the three in
>    `review-sections.ts`) create the admin client inside and filter every query by `userId`. Signatures are as fixed.
> 5. The routine is scheduled as `CRON_TZ=America/Chicago 30 7 * * 1`: 07:30 America/Chicago all year. The live
>    tagging trigger is `CRON_TZ=America/Chicago 55 6 * * 1` (checked on the trigger itself, 2026-11-11), not the
>    `0 12 * * 1` UTC that `routines/README.md` shows; fix the README's tag row in Task 13. The review starts 35
>    minutes after tagging, so the build reports how many of the week's posts are still untagged and Build now covers
>    a slow tagging run.

**Goal:** Each Monday the app stores a review of the week that ended on Sunday, shows it at `/content/review`, and
acts on it: a hook or topic that keeps winning is favored, and one that keeps losing is not offered for 90 days.

**Architecture:** Pure math in `engine/focus.ts` (counts, the two lists, skip and tier checks) and `engine/review.ts`
(week dates, the page's sections, the why prompt). `data/focus.ts` and `data/review.ts` are flows over `FocusDb` and
`ReviewDb` with in-memory fakes and one Supabase adapter each. Skips and double-downs are rows in `content_focus`; the
Inbox, Never used, Today, the context endpoint and three prompts all read them through `loadActiveFocus`. A cloud
routine calls one bearer route that builds and stores the review; the only Claude call writes the why sentences.

**Tech stack:** Next.js 14 App Router, Supabase (Postgres plus RLS, admin client in routes and background work),
`@anthropic-ai/sdk` through `data/claude.ts` (`ToolCaller`), Composio REST for Instagram, Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-11-13-content-engine-weekly-review-design.md`, with the approved layout in
`2026-11-13-content-engine-weekly-review-mockup.html` beside it. Read both, then `src/features/content/CLAUDE.md`,
then the shared names file above.

## Global constraints

- A week is Monday to Sunday, America/Chicago. Weekday 0 is Monday. `week_start` is that Monday as `YYYY-MM-DD`. The
  review day is `week_start + 7` (the Monday after).
- A review is computed as of the review day at 00:00 America/Chicago. Only posts and snapshots from before that
  instant count.
- Per-post verdict is the existing views status: beat usual = Promising or Viral (1.5x or more), far below = Lagging
  (under 0.5x), Pending under 48 hours. No second rule.
- Lists: Instagram Reels only, tagged, `isEligible`, inside `WINDOW_DAYS` (90). Minimum 3 posts. Double down: at least
  half won and more won than lost. Skip: none won and at least half lost. A skip lasts 90 days from the review day.
  Bring back protects the value for 90 days.
- The lists act on ideas whose format is `reel` only. Queued ideas are never hidden. A pillar is never skipped.
- The review writes no content. Nothing it produces goes through the brand gate, and nothing it does bypasses the
  gate.
- Owner-only: pages and actions open with `requireContentOwner()`; the route opens with `authorizeRoutine(req,
  process.env.CONTENT_ENGINE_SECRET)`. Admin-client queries filter by owner.
- Baselines use `WINDOW_DAYS` and `baselineGroup`. No second window.
- Migration `0021_content_weekly_review.sql`. Re-check that 0021 is free when the build starts.
- Not a math-guard change: nothing touches the finance engine.
- Build in a worktree cut from `origin/main`. `git add` explicit paths only. Never run Prettier. No merge, push,
  migration apply or deploy without Miguel's go-ahead. Commit messages end with `Co-Authored-By: Claude Fable 5.2
  <noreply@anthropic.com>`.
- Copy on the page is plain: no em dashes, no jargon. Run `no-ai-slop` on new page copy.

## Review focus

1. **The why call fails** (no API key, timeout, invalid output). The review is still stored and the lists still act;
   each post's why reads "No clear reason." Test in Task 11.
2. **A post made from a Today brief** is tagged at Mark posted and never reaches the tagging routine
   (`mark-posted-brief.ts:45`). It must still get a topic. Test in Task 4.
3. **A Reel idea carries a skipped hook and a skipped topic**, and Miguel brings back only the hook. It stays hidden,
   and its Never-used clock does not restart yet. Test in Task 7.
4. **A post with no topic or a legacy `message`** (`''`, `velocity`). It is skipped by the topic counts and the pillar
   spread, and nothing throws. Test in Task 6 and Task 10.
5. **The first weeks have no history**: no follower reading at one end of the week, or no earlier full week. The tile
   shows "not available" or no multiple; the page still renders. Task 10, 12.

---

### Task 1: Spike: which Composio call returns the follower count

**Files:** none changed. Write the outcome into this plan under "Spike result" (below) and commit only that edit.

- [ ] **Step 1: List the Instagram tools and read two schemas.** Use the `composio-cli` skill. Candidates, in order:
  `INSTAGRAM_GET_USER_INFO` (Graph `GET /{ig-user-id}?fields=followers_count`), then `INSTAGRAM_GET_USER_INSIGHTS`
  (metric `follower_count`, period `day`). Run `composio execute <slug> --get-schema` for each. The slugs are guesses
  until this step confirms them.
- [ ] **Step 2: Call the first one that fits**, read-only, with `ig_user_id: "me"` on the existing
  `instagram_schism-beano` account. Record the slug, the arguments and the response shape.
- [ ] **Step 3: Write the result here and act on it.**
  - **A count comes back** (a total follower number): Task 3 uses that slug. Go on.
  - **Only a daily change comes back** (`follower_count` insights give new followers per day, not a total): nothing
    is stored and `loadFollowerCount` returns null, so slice C uses its own fallback. The follows tile then reads
    that insight at build time for the review week and the weeks before it (Instagram keeps about 30 days). Before
    starting Task 10, replace `followers` in `accountTiles` and `ReviewDb` with `{ day: string; gained: number }[]`
    and say so in this plan. Tell Miguel.
  - **Neither works** (missing scope, no tool): skip Task 3's pull, keep the table and `loadFollowerCount` (returns
    null), the tile says "not available". Tell Miguel.

**Spike result:** _(fill in: slug, arguments, response path to the number, date)_

### Task 2: Migration 0021, seed topics, types

**Files:**
- Create: `supabase/migrations/0021_content_weekly_review.sql`, `0021_content_weekly_review.test.ts` (pattern:
  `0020_content_brand_gate.test.ts`)
- Modify: `src/features/content/engine/brand.ts` (+ `brand.test.ts`), `src/shared/supabase/database.types.ts`,
  `src/features/content/engine/tags.ts` (`PostTags` gains `topic: string`)

**Interfaces (produces):**
- `PILLAR_TOPICS: Record<PillarSlug, { slug: string; label: string }[]>` in `engine/brand.ts`, and `topicLabel(slug:
  string, topics?: { slug: string; label: string }[]): string` (seed label, then the given list, then the slug). The
  seed, copied from "Topics" in the vault note `C - Writing/Brand Content Pillars` (labels verbatim; the slugs are
  this plan's):

  - `freedom-paradox`: `leaving-a-career-path` "The psychological difficulty of abandoning a career path";
    `success-without-fulfillment` "Why conventional success doesn't necessarily produce fulfillment";
    `adaptability-over-certainty` "Why adaptability can be more valuable than certainty"; `corporate-dependence` "The
    hidden dependencies created by corporate employment".
  - `expensive-tuition`: `concentration-risk` "The dangers of concentrating wealth in a single asset, institution or
    job"; `rebuilding-confidence` "Rebuilding confidence after financial setbacks"; `urgency-to-recover` "Why urgency
    to recover losses leads to poor decisions".
  - `physics-of-wealth`: `investing-capacity-vs-net-worth` "The difference between investing capacity and net worth";
    `mechanics-of-leverage` "The mechanics of leverage"; `one-assumption-changes-the-model` "How changing one
    assumption alters an entire financial model"; `capital-deployment-cycles` "Capital deployment cycles";
    `advice-by-the-numbers` "Popular investing advice broken down through numbers and practical examples".
  - `w2-advantage`: `successful-but-unfulfilled` "A successful career can still feel unfulfilling";
    `burnout-vs-ambition` "Professional burnout versus entrepreneurial ambition"; `predictable-income` "Why
    predictable income supports long-term investing"; `lifestyle-inflation` "How lifestyle inflation affects career
    flexibility".
  - `life-by-design`: `everyday-optionality` "Financial optionality in everyday life"; `money-and-anxiety` "Why money
    doesn't automatically eliminate anxiety"; `rebuilding-after-transitions` "Rebuilding after major personal
    transitions"; `planning-vs-the-present` "Balancing long-term planning with enjoying the present".

- SQL, in this order:
  - `content_topics (id uuid pk, user_id uuid not null references auth.users on delete cascade, slug text not null
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), label text not null, pillar text not null check (pillar in (<the five
    slugs>)), created_at timestamptz not null default now(), unique (user_id, slug))`. RLS on, four owner policies
    (copy 0016's block). No touch trigger.
  - `content_posts`: `add column topic text not null default ''`.
  - `content_ideas`: `add column topic text not null default ''`, `add column inbox_since timestamptz`.
  - `content_focus (id, user_id, kind check in ('double_down','skip'), dimension check in ('hook_type','topic'), value
    text not null, won int, lost int, flat int, total int (all not null default 0), source text not null default
    'review' check in ('review','test'), review_week date, starts_on date not null, ends_on date, lifted_at
    timestamptz, protected_until date, created_at)`. Index `(user_id, kind, starts_on)`. Unique index `(user_id,
    review_week, kind, dimension, value) where source = 'review'`. RLS and four policies.
  - `content_account_stats (user_id, platform text check in ('instagram'), day date, followers int not null check
    (followers >= 0), created_at, primary key (user_id, platform, day))`. RLS and four policies.
  - `content_reviews`: `add column review jsonb not null default '{}'::jsonb`, `add column built_at timestamptz`.
    Existing columns stay; `narrative_md`, `double_down` and `stop` are reused (Task 11).
  - Seed: `insert into content_topics (user_id, slug, label, pillar) select u.user_id, v.slug, v.label, v.pillar from
    (select distinct user_id from content_ideas) u cross join (values ...) v on conflict (user_id, slug) do nothing`.

- [ ] **Step 1: Write the failing tests.**
  - `brand.test.ts` "PILLAR_TOPICS has the vault's topics under every pillar": every `PILLAR_SLUGS` key is present;
    counts are 4, 3, 5, 4, 4 in pillar order; all 20 slugs are unique and match `/^[a-z0-9]+(-[a-z0-9]+)*$/`;
    `topicLabel("mechanics-of-leverage") === "The mechanics of leverage"`; `topicLabel("unknown-slug") ===
    "unknown-slug"`.
  - `0021...test.ts` "seeds every PILLAR_TOPICS slug with its pillar": for each seed the SQL contains `'<slug>'` and
    its label (with `'` doubled).
  - "creates the three tables with RLS and four policies each": `enable row level security` count is 3.
  - "the focus check lists are exact": `kind` is `double_down`, `skip`; `dimension` is `hook_type`, `topic`; `source`
    is `review`, `test` (Task 6's constants must match these).
  - "adds topic to posts and ideas, inbox_since to ideas, review and built_at to reviews", by regex.
  - "the review unique index is partial on source = 'review'".
- [ ] **Step 2: Run them and see them fail.** `npx vitest run supabase/migrations/0021_content_weekly_review.test.ts
  src/features/content/engine/brand.test.ts`
- [ ] **Step 3: Write the SQL and `PILLAR_TOPICS`.** Update `database.types.ts` by hand for the three tables and the
  new columns. Add `topic: string` to `PostTags`; run `npx tsc --noEmit -p .` and give every construction site `topic`
  (`data/performance.ts` selects and maps it; fixtures get `""`).
- [ ] **Step 4: Run the full suite and typecheck. Commit.** The migration is **not applied**.

### Task 3: The follower count, stored once a day

Skip the pull steps if Task 1 ended on "neither works"; keep `loadFollowerCount`.

**Files:**
- Create: `src/features/content/data/account-stats.ts`, `account-stats.test.ts`
- Modify: `data/pulls/instagram.ts` (+ test), `src/app/api/content/cron/metrics/route.ts`, `wiring.test.ts`

**Interfaces (produces):**
- `pullIgFollowers(env: ComposioEnv, fetchImpl?: typeof fetch): Promise<number | null>` in `pulls/instagram.ts`, using
  Task 1's slug through `composioExecute`. Null on unset env; throws on a Composio failure.
- `interface AccountStatsDb { upsert(row: { platform: "instagram"; day: string; followers: number }): Promise<void>;
  latest(): Promise<{ followers: number; day: string } | null>; between(from: string, to: string): Promise<{ day:
  string; followers: number }[]> }`
- `storeFollowers(db: AccountStatsDb, pull: () => Promise<number | null>, now: Date): Promise<{ followers: number |
  null; error: string | null }>`. `day` is `chicagoIsoDate(now)`. Never throws. A second run the same day overwrites
  the row.
- `supabaseAccountStatsDb(client, userId): AccountStatsDb`.
- `loadFollowerCount(userId: string): Promise<{ followers: number; day: string } | null>` (admin client inside,
  `import "server-only"`).

- [ ] **Step 1: Write the failing tests.**
  - `instagram.test.ts` "pullIgFollowers reads the count from the recorded response": a fake fetch returning Task 1's
    recorded shape with 4,812 gives `4812`; unset `apiKey` gives `null`.
  - `account-stats.test.ts` "stores today's count under the Chicago day": `now` = `2026-11-17T04:30:00Z` upserts `day:
    "2026-11-16"`.
  - "a failed pull is reported and stores nothing": a throwing pull returns `{ followers: null, error: <message> }`
    and makes no upsert.
  - "a null pull stores nothing and is not an error".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Wire the cron.** In the metrics route, right after `runMetricsCron` and only when `!only || only ===
  "instagram"`, call `storeFollowers` in its own try/catch; the reply gains `followers`. One Composio call, 20-second
  timeout (already in `composioExecute`). Add a `wiring.test.ts` case "the follower count is stored after the pulls
  and before the competitor step" (`storeFollowers(` index between `runMetricsCron(` and `runCompetitorCron(`).
- [ ] **Step 4: Run the full suite and commit.**

### Task 4: Topics on posts (the seventh tag)

**Files:**
- Create: `src/features/content/data/topics.ts`, `topics.test.ts`
- Modify: `engine/tags.ts`, `data/tags.ts`, `data/supabase-tags-db.ts`, `data/tag-form.ts`, `ui/TagEditor.tsx`,
  `ui/TagChips.tsx`, `data/post-detail.ts`, `data/mark-posted-brief.ts`, `routines/content-tag.md`,
  `routine-tag.test.ts`, and their tests

**Interfaces (produces):**
- `engine/tags.ts`: `POST_TAG_NAMES = [...TAG_NAMES, "topic"] as const`, `type PostTagName`. `tagPostSchema` gains
  `topic` (`z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60).optional()`) and `topic_label`
  (`z.string().trim().min(3).max(80).optional()`); its confidence object is keyed by `POST_TAG_NAMES`.
  `slugifyTopic(label: string): string` (lowercase, non-alphanumerics to `-`, trimmed, max 60).
- `data/topics.ts`: `type Topic = { slug: string; label: string; pillar: PillarSlug }`; `loadTopics(client, userId):
  Promise<Topic[]>` (by pillar, then label); `topicsDb(client, userId): { list(): Promise<Topic[]>; add(t: Topic):
  Promise<void> }` (insert-ignore). `resolveTopic(topics: Topic[], a: { topic?: string; topic_label?: string; pillar:
  string }): { slug: string; add?: Topic } | { skip: string }`, pure:
  - `pillar` not in `PILLAR_SLUGS`: `{ skip: "no_pillar" }`.
  - `topic` given and listed under that pillar: its slug. Listed under another pillar: `{ skip:
    "topic_pillar_mismatch" }`.
  - else `topic_label` given: `slugifyTopic` it; an existing slug under the same pillar is reused, under another
    pillar is a mismatch, a new one returns `add`. A proposed topic is used at once.
  - neither given: `{ skip: "none" }`.
- `TagsDb` gains `topics(): Promise<Topic[]>` and `addTopic(t: Topic): Promise<void>`. `StoredTags.values` and the
  adapter's `TAG_COLUMNS` include `topic`. `isTagName` in `data/tags.ts` uses `POST_TAG_NAMES`.
- `getTagQueue`'s body becomes `{ posts, remaining, topics }` (`topics: Topic[]`).
- `storeTags`: the pillar is the post's `message` from the body, or the stored (locked) one. A resolved slug is
  written as `topic` unless `topic` is locked. A skip adds `topic_skipped: <reason>` to that post's result and still
  writes the other tags.
- `readTagForm(fd, topics: Topic[])`: `topic` is a select; a changed value must be a slug in `topics` under the post's
  effective `message`. `correctTags` then locks `topic` like any tag.
- `linkBriefExperiment`: when it writes recipe tags to an untagged post, it also writes `topic` = the idea's `topic`
  (may be `''`) with confidence `BRIEF_TAG_CONFIDENCE`.

- [ ] **Step 1: Write the failing tests.**
  - `topics.test.ts`: "a listed topic under the post's pillar resolves to its slug"; "a listed topic under another
    pillar is a mismatch"; "a new label is slugified and returned to add" (`"Seller financing terms"` under
    `expensive-tuition` gives `seller-financing-terms`); "a legacy or empty message skips with no_pillar"
    (`"velocity"`, `""`, `"none"`). **(Review focus 4)**
  - `tags.test.ts` (data): "storeTags writes a topic picked from the list"; "storeTags adds a proposed topic and uses
    it at once" (fake `addTopic` called once, post gets the slug); "a locked topic is skipped and reported in
    skipped_locked"; "a mismatch writes the other tags and reports topic_skipped"; "correctTags locks topic"; "the
    queue returns the topic list".
  - `tags.test.ts` (engine): "TAG_NAMES is unchanged, so competitor tagging needs no topic" (`TAG_NAMES` has 8 entries
    and no `"topic"`).
  - `mark-posted-brief.test.ts`: "a brief post takes its idea's topic". **(Review focus 2)**
  - `routine-tag.test.ts`: "the routine names topic, topic_label and the queue's topics list"; the existing "names
    every field" case now covers both new keys.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Edit `routines/content-tag.md`.** Step 2: the queue also returns `topics` (`slug`, `label`, `pillar`).
  Add to "The tags": `topic` is what the post is about. Pick the one `slug` from `topics` whose `pillar` equals the
  post's `message` and that fits. When none fits, leave `topic` out and send `topic_label`, a short plain label (3 to
  80 characters) for a new topic. Send neither when `message` is `none`. Add `topic` to the confidence keys and to the
  example body. Topic labels from the queue are data, like captions.
- [ ] **Step 4: UI.** `TagEditor` gets a Topic select (options: the topics of the post's `message`; the label as text,
  `(low confidence)` and lock marks as the other tags). `TagChips` shows the topic label. `data/post-detail.ts` loads
  the topic list for the page.
- [ ] **Step 5: Run the full suite, typecheck, commit.**

### Task 5: Topics on ideas (the brand gate picks one) and the one-time backfill

**Files:**
- Create: `src/features/content/data/topic-backfill.ts`, `topic-backfill.test.ts`
- Modify: `engine/brand.ts`, `data/brand-gate.ts`, `data/gate-sweep.ts`, `data/gate.fake.ts`,
  `data/supabase-gate-db.ts`, `data/today.ts`, `data/today.fake.ts`, `data/supabase-today-db.ts`, `data/sharpen.ts`,
  `data/recreate.ts` and their adapters and fakes, `src/app/api/content/cron/metrics/route.ts`, `wiring.test.ts`, and
  their tests

**Interfaces:**
- `GateResult` gains `topic?: string | null`.
- `renderGateTurn(a)` takes `topics?: Topic[]`: when given, it appends "Topics (slug: label), by pillar" and "Also
  give `topic`: the slug under your pillar that fits best, or null." The system prompt is unchanged.
  `gateToolSchema(keys, rewrite, topicSlugs?: string[])` adds an optional `topic` property (`enum` of the slugs plus
  null). `gateOutputSchema` accepts `topic: z.string().nullable().optional()`.
- `gatePiece(caller, piece, opts: { rewrite: boolean; topics?: Topic[] })`. After a pass, the result's `topic` is kept
  only when it is in `opts.topics` under `result.pillar`; otherwise null. The gate never proposes a new topic for an
  idea.
- `gateOptions(caller, options, fieldsOf, format, topics?: Topic[])`. `gateColumns` also returns `topic` when the gate
  gave one.
- `GateDb`, `TodayDb`, `SharpenDb`, `RecreateDb` and `BackfillDb` each gain `topics(): Promise<Topic[]>` (adapters
  call `loadTopics`). The sweep, the gate backfill, `gateBrief`, `runSharpen` and `runRecreation` pass it.
  `applyPass`, Today's `patchIdea` (`BriefPatch` gains `topic?: string`) and the two picks write `topic`. The drafts
  gate is unchanged.
- `topic-backfill.ts`:
  - `TOPIC_TOOL_NAME = "record_topics"`, `TOPIC_CHUNK = 20`.
  - `interface TopicBackfillDb { candidates(limit: number): Promise<{ id: string; title: string; hook: string; pillar:
    string }[]>; topics(): Promise<Topic[]>; setTopic(id: string, slug: string): Promise<void> }`. Candidates: `inbox`
    and `queued` ideas with `topic = ''` and `pillar` in `PILLAR_SLUGS`, oldest first.
  - `runTopicBackfill(db, caller, a: { dryRun: boolean; limit: number; timeLeft: () => number }):
    Promise<TopicBackfillReport>` with `type TopicBackfillReport = { checked: number; assigned: number; none: number;
    errors: number; samples: { id: string; title: string; topic: string | null }[] }` (up to 10 samples). One Claude
    call per chunk of 20: each idea's id, title, hook and pillar, plus the topic list; output `{ picks: { id: string;
    topic: string | null }[] }`. A slug not listed under the idea's pillar counts as `none`. A dry run writes nothing.
    It only classifies, so it does not go through `gatePiece`.
  - Route: `?topics=dry` or `?topics=run` on the metrics cron route, beside `?backfill=`. Nothing else runs. Limit 100
    a call, `anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 })`.

- [ ] **Step 1: Write the failing tests.**
  - `brand-gate.test.ts`: "a pass keeps a topic listed under the gate's pillar"; "a topic under another pillar, or an
    unknown slug, becomes null"; "with no topics given the turn and the tool schema are exactly as before" (compare
    against the current output).
  - `gate-sweep.test.ts`: "a pass writes the gate's topic onto the idea".
  - `today.test.ts`: "a passing brief writes its topic to the claimed idea".
  - `topic-backfill.test.ts`: "a dry run reports counts and makes no setTopic call"; "a real run writes each listed
    pick"; "a pick outside the idea's pillar is counted as none"; "a failed chunk counts its ideas as errors and the
    next chunk still runs"; "the limit is respected".
  - `wiring.test.ts`: "the topic backfill runs only on request, dry unless asked to run" (`params.get("topics")`,
    `dryRun: topics !== "run"`, before `runMetricsCron(`).
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Run the full suite, typecheck, commit.**

### Task 6: The lists' math (`engine/focus.ts`)

**Files:**
- Create: `src/features/content/engine/focus.ts`, `focus.test.ts`
- Modify: `engine/experiments.ts` (+ test)

**Interfaces (produces), all pure:**
- `FOCUS_MIN_POSTS = 3`, `SKIP_DAYS = 90`, `BRING_BACK_PROTECT_DAYS = 90`.
- `type FocusDimension = "hook_type" | "topic"`, `type FocusKind = "double_down" | "skip"`, `FOCUS_DIMENSIONS =
  ["hook_type", "topic"] as const` (hooks first).
- `type ExtraOutcome = { variable: "hook_type" | "onscreen_text" | "topic"; value: string; outcome: "won" | "lost" |
  "flat"; at: string }`.
- `type FocusPost = WinnerPost & { topic: string }`.
- `focusCounts(posts: FocusPost[], scores: Map<string, PostScore>, windowStart: Date, extra?: ExtraOutcome[]):
  Record<FocusDimension, ValueCount[]>`. Same guards as `evidenceCounts` (Reel, tagged, in the window, `isEligible`,
  an outcome). Rows are built from the values seen, so topics need no fixed list. An empty `hook_type` or `topic` is
  not counted. An extra counts when its variable is a dimension and `at` is in the window.
- `type FocusState = { activeSkips: { dimension: FocusDimension; value: string }[]; protectedValues: { dimension:
  FocusDimension; value: string }[] }` (skips started by other weeks and still running on the review day; values
  Miguel brought back).
- `type FocusEntry = { kind: FocusKind; dimension: FocusDimension; value: string; won: number; lost: number; flat:
  number; total: number }`.
- `decideFocus(counts, state: FocusState): { doubleDown: FocusEntry[]; skip: FocusEntry[] }`. Double down: `total >= 3
  && won * 2 >= total && won > lost`. Skip: `total >= 3 && won === 0 && lost * 2 >= total`. A value under an active
  skip is on neither list. A protected value is never on the skip list. Order: hooks, then topics; inside each,
  `total` descending, then value.
- `type ActiveFocus = { skip: Record<FocusDimension, string[]>; doubleDown: Record<FocusDimension, string[]> }`,
  `EMPTY_FOCUS: ActiveFocus`.
- `isSkipped(focus, item: { hook_type: string; topic: string }): boolean`.
- `focusTier(focus, item): 0 | 1 | 2`.
- `orderForToday<T extends { hook_type: string; topic: string }>(ideas: T[], focus): T[]`: drops skipped ideas, then
  puts ideas with a double-down topic first; the given order holds inside each group.
- `evidenceWithoutSkipped(ev: Evidence, focus): Evidence`: the `hook_type` rows minus skipped hooks. If that would
  leave no row, the rows are returned unchanged.
- `focusBrief(focus, label: (d: FocusDimension, v: string) => string): string`: `""` when all four lists are empty.
  Otherwise a block headed `## From the weekly review` with up to two lines: `Do not write an idea with these hook
  types: …, or on these topics: ….` and `Prefer these hook types: … and these topics: …. Keep all five pillars.`
- `skipEnd(startsOn: string): string` (`startsOn + SKIP_DAYS`).
- `engine/experiments.ts`: `evidenceCounts(posts, scores, windowStart, extra?: ExtraOutcome[])`. An extra counts for
  its variable's row when the variable is in `COUNTED`, the value has a row and `at` is in the window. Import the type
  only (`import type`) to avoid a cycle.

- [ ] **Step 1: Write the failing tests** (`focus.test.ts`; build posts with a small `reel(id, tags, status)` helper
  as `experiments.test.ts` does):
  - "a hook with 4 eligible posts and 0 wins is skipped": 3 Lagging and 1 Normal `promise` Reels give a skip entry `{
    value: "promise", won: 0, lost: 3, flat: 1, total: 4 }`. **(Acceptance 1)**
  - "a hook with 2 posts is on neither list" (2 Lagging). **(Acceptance 1)**
  - "0 wins but under half lost is not skipped" (1 Lagging, 3 Normal).
  - "double down needs at least half won and more won than lost": 2 of 3 won qualifies; 2 won and 2 lost of 4 does
    not; 1 of 3 does not.
  - "one bad post never bans a topic" (1 Lagging: neither list).
  - "hooks are listed before topics, most posts first".
  - "a value under an active skip is not re-evaluated" (it would qualify for double down; it is on neither list).
  - "a brought-back value is not skipped again" (`protectedValues`).
  - "a Reel under 7 days old is not counted" (matched at day 3: absent from every row). **(Acceptance 3)**
  - "carousels, untagged posts, empty topics and legacy messages are skipped without throwing". **(Review focus 4)**
  - "an extra outcome counts for its hook or topic, and one outside the window does not". `skipEnd("2026-11-16") ===
    "2027-02-14"`.
  - "isSkipped is true on either dimension"; "focusTier is 2 for hook and topic, 1 for either, 0 for neither".
  - "orderForToday drops skipped ideas and puts double-down topics first, order kept".
  - "evidenceWithoutSkipped removes a skipped hook, and keeps every row when all are skipped".
  - "focusBrief is empty with no entries and names each list by its label otherwise".
  - `experiments.test.ts`: "evidenceCounts counts an extra hook outcome and ignores a topic one"; "evidenceCounts
    without extra returns what it did before".
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/features/content/engine/focus.test.ts`
- [ ] **Step 3: Implement. Run them and see them pass. Commit.**

### Task 7: Stored skips and double-downs (`data/focus.ts`)

**Files:**
- Create: `src/features/content/data/focus.ts`, `focus.test.ts`, `focus.fake.ts`, `supabase-focus-db.ts`
- Modify: `src/app/api/content/cron/metrics/route.ts`, `wiring.test.ts`

**Interfaces (produces):**
- `type FocusRow = { id: string; kind: FocusKind; dimension: FocusDimension; value: string; won: number; lost: number;
  flat: number; total: number; source: "review" | "test"; review_week: string | null; starts_on: string; ends_on:
  string | null; lifted_at: string | null; protected_until: string | null }`.
- `isActive(row: FocusRow, day: string): boolean`: `lifted_at === null && starts_on <= day && (ends_on === null || day
  < ends_on)`.
- `interface FocusDb { rows(): Promise<FocusRow[]>; insert(rows: Omit<FocusRow, "id">[]): Promise<void>; update(id:
  string, patch: Partial<Pick<FocusRow, "ends_on" | "lifted_at" | "protected_until" | "won" | "lost" | "flat" |
  "total">>): Promise<void>; remove(ids: string[]): Promise<void>; restartInboxClock(a: { dimension: FocusDimension;
  value: string; at: string; stillSkipped: ActiveFocus }): Promise<number> }`. `restartInboxClock` sets `inbox_since =
  at` on `inbox` Reel ideas carrying the value, where `inbox_since` is null or earlier, leaving out ideas
  `stillSkipped` still hides.
- `activeFocus(rows: FocusRow[], day: string): ActiveFocus` (pure).
- `loadActiveFocus(userId: string, day: string): Promise<ActiveFocus>`.
- `addTestDoubleDown(userId: string, a: { dimension: FocusDimension; value: string; day: string; minWeeks: number }):
  Promise<void>`: an active `source = 'test'` double-down for the value has its `ends_on` moved to the later of its
  own and `day + minWeeks * 7`; otherwise one is inserted with `starts_on = day`.
- `bringBack(db: FocusDb, id: string, now: Date): Promise<{ error: string | null }>`: only an active skip. Sets
  `lifted_at = now` and `protected_until = today + 90`, then `restartInboxClock`.
- `releaseEndedSkips(db: FocusDb, day: string): Promise<number>`: for skips never lifted whose `ends_on` is in the
  last 30 days up to `day`, `restartInboxClock` with `at` = that `ends_on` at 00:00 America/Chicago. Safe to run every
  day: it never moves a clock backwards.
- `applyReviewFocus(db: FocusDb, a: { weekStart: string; newest: boolean; decided: { doubleDown: FocusEntry[]; skip:
  FocusEntry[] } }): Promise<void>`:
  - Skips of this `review_week` (source `review`): one still decided keeps its row and dates (only counts are
    updated); one no longer decided and not lifted is removed; a new one is inserted with `starts_on = weekStart + 7`,
    `ends_on = skipEnd(starts_on)`. A lifted row is never touched. Rows of any other `review_week` are never touched.
  - Double-downs (source `review`), only when `newest`: an open row still decided has its counts updated; one no
    longer decided gets `ends_on = weekStart + 7`; a new one is inserted with `ends_on = null`. `source = 'test'` rows
    are never touched.
- `focusState(rows: FocusRow[], weekStart: string): FocusState`: active skips on the review day from other weeks, and
  values with `protected_until` after the review day.

- [ ] **Step 1: Write the failing tests** (`focus.test.ts` over `focus.fake.ts`):
  - "a new skip starts on the review Monday and ends 90 days later" (`2026-11-09` week: `starts_on 2026-11-16`,
    `ends_on 2027-02-14`). **(Acceptance 1)**
  - "a rebuilt review does not move a running skip's dates": apply week `2026-11-09`, apply week `2026-11-16` with the
    same value qualifying again: one row, dates unchanged. **(Acceptance 6)**
  - "a rebuild withdraws a skip this same week started" and "never touches a skip from an earlier week".
  - "a rebuild does not resurrect a skip Miguel lifted".
  - "the double-down list is replaced each week: a value that stops qualifying is closed".
  - "an older week's rebuild leaves double-downs alone" (`newest: false`).
  - "bringBack ends the skip at once, protects the value for 90 days and restarts the clock".
  - "bringBack on a hook leaves an idea hidden when its topic is still skipped, clock untouched". **(Review focus 3)**
  - "releaseEndedSkips restarts the clock at the end date and is idempotent".
  - "activeFocus ignores lifted, ended and not-yet-started rows".
  - "addTestDoubleDown inserts once, then extends, and never shortens".
- [ ] **Step 2: Run them and see them fail. Implement the flow, the fake and the adapter.**
- [ ] **Step 3: Wire the cron.** Call `releaseEndedSkips` in the metrics route before `runTodayCron(`, in its own
  try/catch (two cheap queries, no Claude). `wiring.test.ts`: "ended skips are released before Today picks ideas".
- [ ] **Step 4: Run the full suite and commit.**

### Task 8: The lists act on the Inbox and Never used

**Files:**
- Modify: `engine/inbox.ts`, `engine/unused.ts`, `data/queries.ts`, `src/app/(app)/content/page.tsx`,
  `src/app/(app)/content/unused/page.tsx` only if its props change, and their tests (`inbox.test.ts`,
  `unused.test.ts`, a new `data/queries.focus.test.ts`)

**Interfaces:**
- `rankIdeas(ideas, tier?: (i: T) => number)`: tier descending first, then the existing order.
- `UnusedCandidate` gains `inbox_since?: string | null`; the unreviewed age is measured from `inbox_since ??
  batch_date`. `reviveFields` also sets `inbox_since: null`.
- `splitHidden<T extends { format: string; hook_type: string; topic: string }>(ideas: T[], focus: ActiveFocus): {
  shown: T[]; hidden: T[] }` in `engine/inbox.ts`: an idea is hidden when `format === "reel"` and `isSkipped`.
- `loadInbox(db, userId, focus: ActiveFocus)` returns `{ ideas, pending, hidden: number }`: all `inbox` ideas,
  `splitHidden`, then `partitionUnused` on the shown ones. `hidden` counts every hidden Inbox idea, fresh or old.
- `loadUnused(db, userId, focus)`: hidden Inbox ideas are left out; queued ideas never are.
- The Inbox page loads `loadActiveFocus(user.id, chicagoIsoDate(now))`, ranks with `(i) => (i.format === "reel" ?
  focusTier(focus, i) : 0)`, and when `hidden > 0` shows one line above the list: "`n` ideas hidden by the skip list",
  linking to `/content/review` ("1 idea" in the singular).

- [ ] **Step 1: Write the failing tests.**
  - `inbox.test.ts`: "a skipped hook's Reel idea is hidden and a newsletter idea with the same hook is not"
    **(Acceptance 2)**; "double-down ideas rank first: both, then either, then the rest, existing order inside each
    group"; "rankIdeas with no tier is unchanged".
  - `unused.test.ts`: "an idea's clock starts at inbox_since when set": `batch_date` 40 days ago and `inbox_since` 2
    days ago is fresh; 15 days ago is unreviewed.
  - "reviveFields clears inbox_since".
  - `queries.focus.test.ts` (fake client as `queries.gate.test.ts` does): "loadInbox counts hidden ideas and does not
    return them"; "a hidden idea is not listed in Never used"; "a queued Reel idea with a skipped hook stays in the
    queue and in Never used"; "after Bring back the idea returns to the Inbox with a fresh clock" (`inbox_since` now,
    empty skip list: in `ideas`, not in Never used). **(Acceptance 2)**
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Run the full suite, typecheck, commit.**

### Task 9: The lists act on Today, the prompts and the daily routine

**Files:**
- Modify: `data/today.ts`, `data/today.fake.ts`, `data/supabase-today-db.ts`, `engine/today-brief.ts`,
  `engine/sharpen.ts`, `data/sharpen.ts`, `engine/recreate.ts`, `data/recreate.ts` (and the two adapters),
  `data/context.ts`, `data/supabase-db.ts`, `routines/content-daily.md`, and their tests

**Interfaces:**
- `TodayDb` gains `focus(day: string): Promise<ActiveFocus>`. `unclaimedInboxIdeas(limit, focus)` applies
  `orderForToday` before it cuts to `limit`. `IdeaLite` gains `hook_type` and `topic`.
- In `runDaily`, `runMoment` and `runSwap`: `const ev = evidenceWithoutSkipped(rawEv, focus)` right after
  `db.evidence(now)`. The control recipe, `candidateTests`, `pickDay`, `pickMoment` and `competitorTest` then never
  see a skipped hook. The page's tally keeps the unfiltered evidence.
- `briefSystemPrompt(approvedRules, focusBlock = "")`, `sharpenSystemPrompt(rules, focusBlock = "")`,
  `recreateSystemPrompt(focusBlock = "")`: the block is appended when not empty. `SharpenDb` and `RecreateDb` gain
  `focus(day)`; the flows build the block with `focusBrief` and `topicLabel`.
- `ContextDb` gains `focus(day: string): Promise<ActiveFocus>` and `topics(): Promise<Topic[]>`. `ContentContext`
  gains `focus: { skip: FocusOut; double_down: FocusOut }` with `type FocusOut = { hook_type: string[]; topic: { slug:
  string; label: string }[] }`.
- `routines/content-daily.md`, step 1 (the context list) and step 5 (the hook checks): `focus.skip` names hook types
  and topics not to write a Reel idea with; `focus.double_down` names the ones to write more Reel ideas with, without
  dropping any pillar. Other formats are not affected.

- [ ] **Step 1: Write the failing tests.**
  - `today.test.ts`: "Today's picker never returns a skipped value": the fixture has `promise` with 0 posts (the first
    untried candidate without a skip) and an active skip on it; no planned slot tests `hook_type: promise`.
    **(Acceptance 5)**
  - "the control recipe never uses a skipped hook": `promise` is the most used hook (4 Lagging Reels, nothing else
    over 3) and is skipped; every recipe's `hook_type` is another value. **(Acceptance 5)**
  - "Today does not pick an idea with a skipped hook or topic, and takes a double-down topic first".
  - "with no focus rows the day's plan is what it was" (existing fixtures, unchanged output).
  - `today-brief.test.ts`, `sharpen.test.ts`, `recreate.test.ts`: "the system prompt carries the review block when
    given one and is unchanged when not".
  - `context.test.ts`: "the context carries the skip and double-down lists with topic labels"; "an empty focus gives
    four empty lists".
  - `routines.test.ts` (or the daily routine's test file): the routine contains `focus.skip` and `focus.double_down`.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Run the full suite, typecheck, commit.**

### Task 10: The review's sections (`engine/review.ts`)

**Files:**
- Create: `src/features/content/engine/review.ts`, `review.test.ts`
- Modify: `engine/baseline.ts` (`SeriesPoint` gains optional `saves` and `shares`), `data/performance.ts`

**Interfaces (produces), all pure:**
- `weekStartOf(d: Date): string`; `addDays(day: string, n: number): string`; `chicagoMidnight(day: string): Date`
  (DST-safe; model it on `chicagoDayStart` in `data/recreate.ts`); `reviewWeekFor(now: Date): string`
  (`addDays(weekStartOf(now), -7)`: the newest finished week); `asOfFor(weekStart: string): Date`
  (`chicagoMidnight(addDays(weekStart, 7))`); `isWeekStart(s: string): boolean` (a valid date that is a Monday).
- `EARLY_READ_DAYS = 7`, `NO_REASON = "No clear reason."`.
- `type ReviewPost = { id: string; title: string; url: string; media_type: string; views: number | null; n_views:
  number | null; second: { metric: "saves" | "shares"; value: number; multiple: number } | null; early: boolean; why:
  string }`.
- `type Tile = { total: number | null; usual: number | null; multiple: number | null }`.
- `type ReviewData = { week_start: string; as_of: string; line: { posts: number; beat: number; far_below: number };
  tiles: Record<"views" | "saves" | "shares" | "follows", Tile>; worked: ReviewPost[]; didnt: ReviewPost[]; usual: {
  id: string; title: string }[]; too_early: { id: string; title: string }[]; pillars: { pillar: PillarSlug; posts:
  number; median_multiple: number | null }[]; gate: GateWeek; why: "ok" | "failed" | "none" }`.
- `postTitle(p): string`: `hook_spoken`, else `hook_onscreen`, else `hook_used`, else the caption's first 60
  characters.
- `weekPosts(posts, scores: Map<string, PostScore>, normalized: NormalizedPost[], weekStart: string, asOf: Date)`
  returns `{ worked, didnt, usual, too_early }`. In it: Instagram posts with `posted_at` in the week, every media
  type. Promising or Viral go to `worked`, Lagging to `didnt`, Normal to `usual`, Pending or no status to `too_early`.
  `second` is the larger of `n_saves` and `n_shares`, with the raw count; null when neither exists. `early` is true
  under 7 days old at `asOf`. `worked` is sorted by `n_views` descending, `didnt` ascending.
- `weekGain(posts: { posted_at: string; series: SeriesPoint[] }[], metric: "views" | "saves" | "shares", from: Date,
  to: Date): number | null`: the sum over posts of (value at the newest point before `to`) minus (value at the newest
  point before `from`, else 0). Null when no post has a point before `to`.
- `accountTiles(posts, followers: { day: string; followers: number }[], weekStart: string, asOf: Date):
  ReviewData["tiles"]`. `usual` is the median of the same figure over the earlier full weeks that start on or after
  `asOf - WINDOW_DAYS` and have a value; null when there is none. `multiple` is null when `usual` is null or 0.
  Follows: the reading on the newest day before the week's end minus the reading on the newest day before its start,
  each at most 2 days old; otherwise `total` is null.
- `pillarSpread(posts, scores, weekStart, asOf)`: one entry per `PILLAR_SLUGS` in order, by the post's `message`;
  `median_multiple` over the posts that have one.
- `type GateWeek = { checked: number; passed: number; rewritten: number; failed: number; failures: { id: string;
  title: string; format: string; reasons: string[] }[] }`; `gateWeek(ideas: { id: string; title: string; format:
  string; status: string; gate: unknown }[], from: Date, to: Date): GateWeek`. An idea counts when `gate.checked_at`
  is in the week. `passed` is a pass verdict with `rewritten: false`; `rewritten` a pass with `rewritten: true`;
  `failed` a fail verdict or status `gate_failed`. Reasons read like `GateFailedList` (`gateItemLabel(item): reason`,
  or the error).
- `summaryLine(line): string`: `"5 posts. 2 beat your usual views, 1 was far below."` ("1 post", "No posts last week."
  for zero).
- The why call: `WHY_TOOL_NAME = "record_review_why"`; `whySystemPrompt(): string`; `renderWhyTurn(a: { posts:
  WhyInput[]; counts: Record<FocusDimension, ValueCount[]> }): string` with `type WhyInput = { id: string; title:
  string; verdict: "worked" | "didnt"; n_views: number | null; hook_type: string; topic: string; pillar: string;
  second: string }` (labels, not slugs); `whyToolSchema()`; `whyOutputSchema(ids: string[])` for `{ summary: string
  (max 200); whys: { id: string; why: string (max 240) }[] }`, every id present once. The prompt says: one plain
  sentence per post; name a tag or a count that is in the input; write exactly "No clear reason." when there is none;
  invent no cause; no advice, no content.
- `groundedWhy(why: string, facts: string[]): string`: returns `why` when it contains one of the post's facts (hook
  label, topic label, pillar name, or an "n of m" from its counts), case-insensitive; otherwise `NO_REASON`.

- [ ] **Step 1: Write the failing tests.**
  - "weekStartOf returns the Chicago Monday": `2026-11-16T05:59:00Z` (Sunday 23:59 Chicago) gives `2026-11-09`;
    `2026-11-16T06:00:00Z` gives `2026-11-16`.
  - "reviewWeekFor on a Wednesday is the Monday nine days before".
  - "asOfFor is Chicago midnight in both seasons": `2026-03-02` gives `2026-03-09T05:00:00Z` (daylight time began
    March 8) and `2026-11-09` gives `2026-11-16T06:00:00Z`.
  - "a Reel posted 3 days before the review is in section 2 as an early read". **(Acceptance 3)**
  - "a Saturday or Sunday post is too early to call" (under 48 hours at `asOf`).
  - "Promising and Viral are worked, Lagging is didn't, Normal is about usual".
  - "carousels and images are listed against their own baseline group".
  - "second names the stronger of saves and shares and is null when neither exists".
  - "weekGain counts growth on old posts and the whole value of a post published in the week".
  - "usual is the median of the earlier full weeks, and null when there are none". **(Review focus 5)**
  - "the follows tile is null when a reading is missing at either end". **(Review focus 5)**
  - "pillarSpread lists all five pillars, a dash value (null) for one with no post, and skips a legacy message without
    throwing". **(Review focus 4)**
  - "gateWeek counts passed as written, passed after a rewrite and failed, inside the week only".
  - "summaryLine words 0, 1 and several posts".
  - "whyOutputSchema rejects a missing or repeated post id".
  - "groundedWhy keeps a sentence that names a tag and replaces one that names none".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: As-of reads.** `loadSnapshotRows` and `loadPostsForMath` take `opts?: { before?: Date }`, which
  filters `captured_at` and `posted_at` in the query. The series points also carry `saves` and `shares`. Test in
  `performance.test.ts`: "with before, later snapshots and later posts are not loaded"; "without it nothing changes".
- [ ] **Step 4: Run the full suite, typecheck, commit.**

### Task 11: Build and store a review; the route; the seams

**Files:**
- Create: `src/features/content/data/review.ts`, `review.test.ts`, `review.fake.ts`, `supabase-review-db.ts`,
  `data/review-sections.ts`, `review-sections.test.ts`, `src/app/api/content/review/build/route.ts`
- Modify: `data/queries.ts`, `wiring.test.ts`

**Interfaces:**
- `data/review-sections.ts` (`import "server-only"`), each returning the empty value in this slice:
  - `loadExtraOutcomes(userId: string, windowStart: Date): Promise<ExtraOutcome[]>` returns `[]`.
  - `type TestSection = { state: "open" | "judged"; question: string; owes: string[]; verdict: string | null;
    conclusion: string | null; href: string }`; `loadTestSection(userId: string, weekStart: string):
    Promise<TestSection | null>` returns `null`.
  - `loadSuggestionsSection(userId: string): Promise<{ waiting: number; href: string } | null>` returns `null`.
- `interface ReviewDb { posts(before: Date): Promise<PostRowForView[]>; followers(from: string, to: string): Promise<{
  day: string; followers: number }[]>; gateIdeas(from: Date, to: Date): Promise<Parameters<typeof gateWeek>[0]>;
  topics(): Promise<Topic[]>; extra(windowStart: Date): Promise<ExtraOutcome[]>; focus: FocusDb; newestWeek():
  Promise<string | null>; save(row: { week_start: string; narrative_md: string; double_down: FocusEntry[]; stop:
  FocusEntry[]; review: ReviewData; built_at: string }): Promise<void> }`. `save` upserts on `(user_id, week_start)`
  and leaves `best_times`, `plan` and `replies_owed` alone. The adapter's `extra` calls `loadExtraOutcomes`.
- `buildReview(db: ReviewDb, caller: ToolCaller | null, a: { weekStart?: string; now: Date }): Promise<{ status:
  number; body: unknown }>`:
  1. `weekStart` defaults to `reviewWeekFor(now)`. Not a Monday: 400 `{ error: "week_start must be a Monday" }`.
     `asOfFor(weekStart) > now`: 400 `{ error: "week_not_finished" }`.
  2. Load posts before `asOf`; `scorePosts(posts, asOf)`; `normalizePosts(posts, asOf)`; `focusCounts(reels, scores,
     asOf - 90 days, await db.extra(...))`.
  3. `decideFocus(counts, focusState(await db.focus.rows(), weekStart))`, then `applyReviewFocus` with `newest =
     weekStart >= (await db.newestWeek() ?? weekStart)`.
  4. Sections from Task 10. Then one why call for `worked` and `didnt` (skipped when both are empty: `why: "none"`). A
     null caller, a throw or invalid output gives `why: "failed"`, every why `NO_REASON`, and `narrative_md = ""`.
     Otherwise each why goes through `groundedWhy` and `narrative_md` is the summary. `maxTokens: 3000`.
  5. `save`. Body: `{ ok: true, week_start, url: "/content/review/<week_start>", line, double_down: n, skip: n, why
     }`.
- Route `POST /api/content/review/build`: `authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET)`, `dynamic =
  "force-dynamic"`, `maxDuration = 300`, body `z.object({ week_start: z.string().optional() }).strict()` (an empty
  body is `{}`), admin client, `anthropicToolCaller({ timeoutMs: 120_000, maxRetries: 0 })` or null when
  `MissingApiKeyError`. The body's `url` is made absolute with `NEXT_PUBLIC_SITE_URL`.
- `data/queries.ts`: `loadReview(db, userId, weekStart: string | null): Promise<{ row: ContentReview | null; weeks:
  string[] }>` (the given week or the newest; `weeks` newest first, up to 12); `loadReviewSkips(db, userId, reviewDay:
  string): Promise<FocusRow[]>` (skips with `starts_on <= reviewDay < ends_on`, lifted ones included, hooks first).
  `loadGateFailed` is unchanged.

- [ ] **Step 1: Write the failing tests** (`review.test.ts` over `review.fake.ts` and a scripted caller):
  - "Build now midweek returns the same lists as Monday's run": build with `now` = Monday 07:30 and again with `now` =
    Wednesday, the fake holding extra snapshots and a post from Tuesday; `double_down`, `stop` and the focus rows are
    deep-equal. **(Acceptance 4)**
  - "a 4-post, 0-win hook is stored as a skip ending 90 days out, and a 2-post hook is on neither list" (end to end
    through `save` and the focus fake). **(Acceptance 1)**
  - "a rebuilt review does not move a running skip's dates" (two weeks, then rebuild the second). **(Acceptance 6)**
  - "fixing a tag and rebuilding withdraws the skip that came from it".
  - "a review is a snapshot: rebuilding an older week does not change the newest double-downs".
  - "the why call failing still stores the review and the lists" (`why: "failed"`, whys are `NO_REASON`); "no API key
    behaves the same". **(Review focus 1)**
  - "an ungrounded why is replaced with No clear reason.".
  - "a week with no posts stores an empty review and makes no Claude call".
  - "a week that has not finished is a 400"; "a Tuesday is a 400".
  - "the unused review columns are not written" (`save` gets no `best_times`, `plan`, `replies_owed`).
  - `review-sections.test.ts`: "slice A's seams return empty": `[]`, `null`, `null`.
  - `wiring.test.ts`: add the route to the `authorizeRoutine` list; "the review route is a POST with a 300 second
    budget and an explicit Claude timeout".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Run the full suite, typecheck, commit.**

### Task 12: The page

**Files:**
- Create: `src/app/(app)/content/review/page.tsx`, `src/app/(app)/content/review/[weekStart]/page.tsx`,
  `src/features/content/ui/ReviewPage.tsx`, `ReviewPage.test.tsx`, `ui/ReviewLists.tsx`, `ReviewLists.test.tsx`,
  `data/review-actions.ts`
- Modify: `ui/ContentTabs.tsx`, `ui/GateFailedList.tsx`, `src/app/(app)/content/performance/page.tsx`,
  `data/gate-digest.ts` (+ test), `wiring.test.ts`

**Interfaces:**
- Both pages open with `requireContentOwner()`, hold no query, and render `<ReviewPage review weeks skips gateFailed
  test suggestions newest />`. `[weekStart]` calls `notFound()` when `isWeekStart` is false. They load
  `loadTestSection` and `loadSuggestionsSection`.
- `ReviewPage` (server component), sections in the mockup's order:
  1. The bold `summaryLine`, then `narrative_md`. Four tiles in the order views, saves, shares, follows: the total,
     and "`1.4x usual`" when there is a multiple. A null total reads "not available".
  2. "What worked and why", then "What didn't": title (linked to `/content/performance/<id>`), views with the
     multiple, the second number, the why, and an "early read" label. Then "`n` posts were about usual: <titles>" and
     "Too early to call: <titles>". One line under the section: "Early reads use the numbers so far. The lists below
     wait until a post is 7 days old."
  3. "Double down": caption "The engine now favors these in Today and the Inbox. From posts at least 7 days old."
     Lines "Hook: <label> · 3 of 4 beat usual views".
  4. "Skip for 90 days": caption "The engine stops offering these until the date shown. From posts at least 7 days
     old." Lines "Hook: <label> · 0 of 4 · back Feb 14" with a **Bring back** button on an active skip, or "brought
     back <date>" on a lifted one.
  5. "Pillar spread": five rows; a pillar with no post shows "0 posts" and a dash.
  6. "Brand gate this week": "14 ideas checked. 9 passed as written, 2 after a rewrite, 3 didn't pass." On the newest
     week, `GateFailedList` with the live rows (Archive works). On an earlier week, the stored `failures` as plain
     lines.
  - "This week's test" renders only when `test` is not null; "New creator suggestions" only when `suggestions` is not
    null. Both sit between sections 4 and 5.
  - A **Build now** button on the newest page, and "No review yet" with the same button when there is no row. A
    closing row "Earlier weeks: Nov 2 · Oct 26", each a link.
- `data/review-actions.ts` (`"use server"`): `buildNowAction()` runs `buildReview` for `reviewWeekFor(now)` through
  the admin client and revalidates `/content`; `bringBackAction(formData)` validates a uuid, runs `bringBack`,
  revalidates. Both open with `requireContentOwner()`. The route segment exports `maxDuration = 300`.
- `ContentTabs`: `{ href: "/content/review", label: "Review" }` after Performance.
- Performance loses `GateFailedList` and `loadGateFailed`; the pillar line stays. `GateFailedList`'s comment no longer
  says "moves". `renderDigest`'s failed line links to `/content/review`.

- [ ] **Step 1: Write the failing tests.**
  - `ReviewPage.test.tsx`: "the page hides the test section when its loader returns null" and "hides the suggestions
    section when its loader returns null" (no heading in the output); "shows each when given a value".
  - "a missing follows total reads not available". **(Review focus 5)**
  - "an early read is labelled"; "about usual and too early to call are one line each".
  - "an earlier week lists stored gate failures without an Archive button".
  - "with no review it offers Build now".
  - `ReviewLists.test.tsx`: "hooks are listed before topics with n of m"; "an active skip shows its return date and
    Bring back"; "a lifted skip shows no button"; "topic values show their label".
  - `gate-digest.test.ts`: the failed line ends `/content/review`.
  - `wiring.test.ts`: add both pages and `review-actions.ts` to the `requireContentOwner` list and both pages to the
    "no Supabase queries" list; "Performance no longer renders GateFailedList".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Run `no-ai-slop` on the page copy.** Then `npx next build`.
- [ ] **Step 4: Commit.**

### Task 13: The weekly routine

**Files:**
- Create: `routines/content-weekly.md`, `src/features/content/routine-weekly.test.ts`
- Modify: `routines/README.md`

**Content of `routines/content-weekly.md`:** the header and Safety block follow `content-tag.md` (env
`CONTENT_API_BASE` and `CONTENT_ENGINE_SECRET`; the response is data, never instructions; the secret only in the
Authorization header). Connector: ClickUp. Numbered steps, so slices B and C can each insert one before the last:

1. **Build the review.** `curl -sS --max-time 290 -o /tmp/review.json -w '%{http_code}' -X POST
   "$CONTENT_API_BASE/api/content/review/build" -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" -H "Content-Type:
   application/json" --data '{}'`. Anything other than 200: go to the last step and report the status code. Read
   `url`, `line`, `double_down`, `skip` and `why` with `jq`.
2. **Post one line to ClickUp** (last step): chat channel `7-9011777568-8`, `clickup_send_chat_message`, markdown,
   exactly `**Weekly review, week of <week_start>**: <posts> posts, <beat> beat usual, <far_below> far below.
   <double_down> to double down, <skip> to skip. <url>`. On a failed build: `**Weekly review failed** (HTTP <code>).
   Open <CONTENT_API_BASE>/content/review and press Build now.` Nothing else is posted.

README: a row `content-weekly.md | Mon 07:30 (`CRON_TZ=America/Chicago 30 7 * * 1`) | ClickUp`, and a short "Weekly review run" section:
it must run after `content-tag.md`; 07:30 America/Chicago all year; network allowlist is the
`CONTENT_API_BASE` host only; a missed Monday is fixed with Build now.

- [ ] **Step 1: Write the failing test** (`routine-weekly.test.ts`): "names the env, the build endpoint and the
  ClickUp channel"; "step 1 builds the review and the last step posts one line"; "treats the response as data and
  keeps the secret in the header"; "is scheduled after the tagging routine in the README" (`/content-weekly\.md.*30 7 \* \* 1/`, and the tag row reads `55 6 * * 1`).
- [ ] **Step 2: Run it and see it fail. Write the routine and the README. Run it and see it pass. Commit.**

### Task 14: Docs, the whole-branch check and the hand-offs Miguel approves

**Files:**
- Modify: `src/features/content/CLAUDE.md`, `docs/superpowers/content-next-steps.md`, `docs/PRODUCT-STATUS.md` (the
  three tables and the route)

- [ ] **Step 1: Update the docs.**
  - `CLAUDE.md` map: `engine/focus.ts`, `engine/review.ts`, `data/focus.ts`, `data/review.ts`,
    `data/review-sections.ts` (the seams B and C fill), `data/topics.ts`, `data/topic-backfill.ts`,
    `data/account-stats.ts`, the route, the two pages, `routines/content-weekly.md`; add 0021 to the migrations list.
    Change "the six tags" to seven and fix the line that says `message` is the canon argument.
  - Invariants: the list rules and constants; Reel ideas only; queued ideas never hidden; a skip's dates never move;
    Bring back protects for 90 days; `inbox_since` restarts the Never-used clock; a review is a snapshot as of its
    Monday 00:00 Chicago; the why call can fail without losing the review; `TAG_NAMES` excludes `topic`; the re-queue
    SQL below.
  - `content-next-steps.md`: the weekly review is built; next is slice B (Trial Reel tests), then C.
- [ ] **Step 2: Run the full suite, `npx tsc --noEmit -p .` and `npx next build`.** All clean.
- [ ] **Step 3: Commit, whole-branch review on the most capable model, open the PR. Do not merge.** The PR lists what
  waits for Miguel, in this order. Each is his call; none runs by itself.
  1. Apply migration 0021 in the Supabase SQL editor, before the merge.
  2. Merge and deploy.
  3. **Topic backfill for existing ideas.** Run `GET /api/content/cron/metrics?topics=dry` with the cron secret and
     show Miguel the report (counts and samples). Only after he approves, run `?topics=run`, repeating until `checked`
     is 0.
  4. **Re-queue posts for the tagging routine**, so existing posts get a topic. Show him the count first (`select
     count(*) ...` with the same `where`), then run: `update content_posts set tagged_at = null where platform =
     'instagram' and posted_at >= now() - interval '90 days' and not ('topic' = any(tag_locks));` Then run
     `/content-tag` until `remaining` is 0. Until it finishes, Today's evidence and the lists are thin, because
     untagged posts are not counted. Do it on a day with no review due.
  5. Create the cloud routine from `routines/content-weekly.md` (`CRON_TZ=America/Chicago 30 7 * * 1`, ClickUp connector, allowlist of
     the app host) and run it once by hand.
  6. The first real Monday run: Miguel reads `/content/review` and says whether anything needs a follow-up question.
     **(Acceptance 7)** Until two follower readings a week apart exist, the follows tile reads "not available".

---

## Coverage

Decisions: 1 in Tasks 10 and 11; 2 in Tasks 1, 3 and 10; 3 in Tasks 2, 4, 5 and 14; 4 in Tasks 6 and 7; 5 in Tasks 8
and 9; 6 in Tasks 10 to 13; 7 in Tasks 11 and 12. Acceptance lines, by the test that proves each:

1. Task 6 "a hook with 4 eligible posts and 0 wins is skipped", "a hook with 2 posts is on neither list"; Tasks 7 and
   11 for the end date.
2. Task 8 "a skipped hook's Reel idea is hidden and a newsletter idea with the same hook is not", "after Bring back
   the idea returns to the Inbox with a fresh clock".
3. Task 6 "a Reel under 7 days old is not counted"; Task 10 "a Reel posted 3 days before the review is in section 2 as
   an early read".
4. Task 11 "Build now midweek returns the same lists as Monday's run".
5. Task 9 "Today's picker never returns a skipped value", "the control recipe never uses a skipped hook".
6. Tasks 7 and 11 "a rebuilt review does not move a running skip's dates".
7. Task 14, step 3, item 6: the first real Monday run, read by Miguel.
