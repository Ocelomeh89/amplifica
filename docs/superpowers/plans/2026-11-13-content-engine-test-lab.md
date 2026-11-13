# Content engine Trial Reel tests: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Contract changes:** none. Every name in `2026-11-13-content-final-slices-shared-names.md` is used as
written. Three places where the spec and the code disagree are listed under "Spec against code" below.

**Before anything else:** this is slice B. Slice A (the weekly review) is built and merged first, and
this plan treats the names under "Slice A makes" as existing interfaces. **Task 1 is "confirm slice A is
merged and these names exist".** Do not start Task 3 until Task 1 passes.

**Spike outcome (fill in after Task 2):** `___` (A, B or C).

**Goal:** The engine proposes one Trial Reel test at a time, tells Miguel what to record, reads the
two posts' 24-hour numbers itself, and feeds the verdict into the evidence counts, the double-down
list and the weekly review.

**Architecture:** Two pure engine files hold the picker and the verdict; a third holds the card
prompt and schemas. One flow, `data/test-lab.ts`, runs over a `TestsDb` interface with an in-memory
fake and one Supabase adapter. A proposal is a `proposing` row filled in after the response with
`waitUntil`. The metrics cron judges open tests after the pulls. Test posts carry
`content_posts.is_test` and `loadPostsForMath` leaves them out by default.

**Tech stack:** Next.js 14 App Router, Supabase (Postgres plus RLS, admin client in cron and
background jobs), `@anthropic-ai/sdk` through `data/claude.ts` (`ToolCaller`), Vitest, zod.

**Spec:** `docs/superpowers/specs/2026-11-13-content-engine-test-lab-design.md`. Read it first, then
the shared names file, then `src/features/content/CLAUDE.md`. Slice A's spec
(`2026-11-13-content-engine-weekly-review-design.md`) says what its names mean.

## Global constraints

- At most one test is live (`proposing` or `open`) at a time. A test has exactly two versions, `a` and `b`.
- The two versions differ in exactly one thing: two hook types, two card styles (`ONSCREEN_TEXT`), or
  two topics. An opening test never has two versions of the same hook type.
- Winner: one version has at least **1.5** times the other's 24-hour views, and at least **1,000**
  views. Anything else is "no clear winner".
- Promote: at least **1,000** views in 24 hours and at least **3** times the median 24-hour views of
  Miguel's normal Reels in the 90-day window. Copy: `Worth sharing to your followers.`
- The 24-hour number is the first snapshot taken **24 hours or more** after posting. Never `dayViews`.
- A test with no post linked after **14** days closes as "not run". The button is capped at **3**
  proposals per America/Chicago day, counting every status. A `proposing` row older than **10**
  minutes is failed.
- A winning hook or topic stays on the double-down list for at least **4** weeks. A loss is one miss.
- Never test a value under an active skip. Never repeat an unordered pair of values for one variable
  inside **90** days. Picker rules run in order 1 to 5; hooks before topics before card styles.
- Both versions go through `gatePiece` with one rewrite. After **3** dropped tests the run stops.
- Views decide. Saves and shares are shown and never decide.
- Follow `src/features/content/CLAUDE.md` and the shared names file's "Rules for all three plans":
  owner gate on pages and actions, `authorizeRoutine()` on the route, owner filter on every
  admin-client query, pure math in `engine/`, background starters in a plain module, `wiring.test.ts` updated.
- No finance math is touched. No merge, push, migration apply or deploy without Miguel's go-ahead.

## Spec against code

1. **Topic is not an evidence variable.** Spec Decision 7 counts a topic win "in the evidence counts".
   `Evidence` has no topic key (`engine/experiments.ts:56`, `Counted = Exclude<Variable, "topic">`).
   This plan reads hook and topic counts from slice A's `focusCounts` and card counts from
   `evidenceCounts(...).onscreen_text`, both with `extra`.
2. **Two ideas cannot link to one post.** Decision 4 links "each idea" to the winning version's post.
   A post has one `idea_id` (`data/actions.ts:196`). A cut test's single idea links to the winner's
   post (A's when there is no winner). In a topic test each idea links to its own version's post.
3. **Today's claim is a rewrite.** Decision 4 says ideas are "claimed the way Today claims them" and
   also "not rewritten in place". Today claims by patching the idea to `queued`
   (`engine/today-brief.ts:170`), and `returnToInbox` only moves `queued` ideas
   (`data/supabase-today-db.ts:198`). Here the idea stays `inbox` and untouched. It is held while a
   `proposing` or `open` test's version points at it, so "returns to the Inbox" needs no write.

## Review focus

1. **The two posts straddle the cron hour** (one posted before 10:00 UTC, one after). Both versions
   are read at the first snapshot 24 hours or more after the **later** post, so they are always read
   by the same cron run. Test in Task 5.
2. **The snapshot at the 24-hour mark has no views** (the insights call failed). It is skipped; the
   next snapshot with a number is used. No verdict from a null. Test in Task 5.
3. **Miguel links the wrong post.** The same post for both versions, a post already in a test or in a
   Today experiment, or a post older than 7 days is refused. A link can be changed until the verdict.
   Test in Task 9.
4. **A verdict's follow-up writes fail halfway** (the double-down write throws). The verdict stays;
   the next cron retries the follow-ups and never applies them twice. Test in Task 9.
5. **No Inbox idea fits any question** (for example no idea on another topic in the pillar). The run
   ends `failed` with `No test is left to propose.` and no row stays `proposing`. Test in Task 7.

---

All paths below are under `src/features/content/` unless they start with `src/app`, `supabase` or `routines`.

---

### Task 1: Confirm slice A is merged

**Files:** none changed.

- [ ] **Step 1: Cut the worktree** from `origin/main` (never switch branches in the shared checkout).
- [ ] **Step 2: Check each name exists as the shared names file writes it.** Stop and tell Miguel if one is missing or shaped differently.
  - Migration `0021` with `content_topics`, `content_focus` (`source` allows `'test'`),
    `content_posts.topic`, `content_ideas.topic`.
  - `PILLAR_TOPICS`; `engine/focus.ts` (`ExtraOutcome`, `focusCounts(..., extra?)`, `ActiveFocus`,
    `isSkipped`, `FocusDimension`); `evidenceCounts(..., extra?)`; `weekStartOf`.
  - `data/focus.ts` (`loadActiveFocus`, `addTestDoubleDown`); `data/review-sections.ts`
    (`loadExtraOutcomes` returning `[]`, `loadTestSection` returning `null`, `TestSection`).
  - `routines/content-weekly.md` with numbered steps; `/content/review` and its tab.
- [ ] **Step 3: Record three facts in the PR description**, because later tasks depend on them:
  - which client `data/focus.ts` builds inside `loadActiveFocus` (Tasks 8 and 11 use the same one);
  - whether `loadPostsForMath` selects `topic` (Task 4 adds it if not);
  - whether `supabase-today-db.ts` `evidence()` already passes `loadExtraOutcomes` to `evidenceCounts` (Task 11 adds it if not).
- [ ] **Step 4: Re-check the next free migration number.** This plan writes `0022`. If it is taken, use the next and rename throughout.
- [ ] **Step 5: List slice A's post readers:** `grep -rn 'loadPostsForMath\|from("content_posts")' src/features/content/data`. Add each new one to the table in Task 4.

### Task 2: The Trial Reel spike (spec Decision 1)

**Files:** none committed. A scratch script lives outside the repo.

- [ ] **Step 1: Ask Miguel to post one Trial Reel** and send its link. Wait for it.
- [ ] **Step 2: Read the raw media list.** Write a scratch script that calls `listIgMedia` from
  `data/pulls/instagram.ts` with the `.env.local` Composio keys and prints the raw items. It only
  reads. Run `composio execute INSTAGRAM_GET_IG_USER_MEDIA --get-schema` first and request every media
  field the schema lists, not only `MEDIA_FIELDS`.
- [ ] **Step 3: Decide the outcome.**
  - The Trial Reel's shortcode is missing from the list: **C**.
  - It is listed, and some field differs from a normal Reel in a way that marks a trial: **A**.
    Record the field and its value.
  - It is listed and no field marks it: **B**.
- [ ] **Step 4: If it is listed, call `INSTAGRAM_GET_IG_MEDIA_INSIGHTS` for it** and confirm `views`,
  `saved` and `shares` come back. If views are missing, treat the outcome as **C**.
- [ ] **Step 5: Write the outcome into the "Spike outcome" line at the top of this plan** and commit that one line.

**What each outcome keeps and drops.** Tasks 3 to 12 and 15 are built in every outcome. The schema in
Task 3 is the same in every outcome.

| Piece | A | B | C |
|---|---|---|---|
| Task 4, `is_test` exclusion | keep | keep | keep (the column stays unused until Instagram reports trials) |
| Task 9 steps marked **[A+B]** (post pickers, link, cron reads snapshots) | keep | keep | drop |
| Task 9 steps marked **[C]** (typed numbers, judged in the action) | drop | drop | keep |
| Task 12 version column | post picker | post picker | three number boxes and a link box |
| Task 13, the pull flags trials | keep | drop | drop |
| Task 14, Trial switch and stray-Reel list | drop | keep | drop |
| Unlinking a post clears `is_test` | no | yes | not applicable |
| A judged idea | marked `posted`, linked to a post | same | `archived`, no post |

### Task 3: Migration 0022 and the shared constants

**Files:**
- Create: `supabase/migrations/0022_content_tests.sql`, `supabase/migrations/0022_content_tests.test.ts`
  (pattern: `0016_content_experiments.test.ts`), `engine/test-lab-verdict.ts` (constants only in this task)
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces (produces):**
- Constants in `engine/test-lab-verdict.ts`:
  `TEST_KINDS = ["opening","card","topic"]`, `TEST_VARIABLES = ["hook_type","onscreen_text","topic"]`,
  `TEST_STATUSES = ["proposing","open","judged","skipped","not_run","failed"]`,
  `TEST_VERDICTS = ["a","b","none"]`, `TEST_TRIGGERS = ["routine","button"]`, and their types
  `TestKind`, `TestVariable`, `TestStatus`, `TestVerdict`, `VersionLabel = "a" | "b"`.
- `content_tests`: `id`, `user_id`, `kind`, `variable`, `value_a`, `value_b`, `held jsonb`
  (`{ hook_type?, onscreen_text?, topic?, pillar }`), `rule smallint` (1 to 5), `question`, `reason`,
  `why`, `notes jsonb` (`{ record_once, record_twice, cuts }`), `status` default `'proposing'`,
  `trigger`, `dropped jsonb default '[]'`, `error`, `skip_reason`, `verdict` (null until judged),
  `verdict_line`, `conclusion` (default `''`), `opened_at`, `judged_at`, `effects_at`, `closed_at`,
  `created_at`, `updated_at`. `kind`, `variable`, `value_a`, `value_b` and `rule` are nullable: a
  `proposing` row has none yet.
- Partial unique index on `content_tests (user_id) where status in ('proposing','open')`.
- `content_test_versions`: `id`, `user_id`, `test_id` (cascade), `label` (`'a' | 'b'`), `value`,
  `idea_id` (references `content_ideas`, `on delete set null`), `hook`, `card_text`, `outline jsonb`,
  `gate jsonb`, `post_id` (references `content_posts`, `on delete set null`), `link`, `typed_views`,
  `typed_saves`, `typed_shares`, `views_24h`, `saves_24h`, `shares_24h`, `read_at`, `promote boolean
  not null default false`. Unique `(test_id, label)`. Partial unique index on `(post_id) where post_id is not null`.
- `content_posts.is_test boolean not null default false`.
- Both tables: RLS on, the four owner policies, the `touch_updated_at` trigger, as 0016 does.

- [ ] **Step 1: Write the migration test.** It asserts: the `kind`, `variable`, `status`, `verdict`,
  `trigger` and `label` check lists equal the constants; the one-live index; the unique post index;
  `add column is_test boolean not null default false`; RLS enabled twice with eight policies.
- [ ] **Step 2: Run it and see it fail.** `npx vitest run supabase/migrations/0022_content_tests.test.ts`
- [ ] **Step 3: Write the constants and the SQL. Run it and see it pass.**
- [ ] **Step 4: Add both tables and `is_test` to `database.types.ts`.** `npx tsc --noEmit -p .` is clean.
- [ ] **Step 5: Commit.** The migration is **not applied**; that waits for Miguel.

### Task 4: Test posts leave the baselines, the review and the winners

**Files:**
- Modify: `data/performance.ts`, `data/post-detail.ts`, `data/queries.ts`, `wiring.test.ts`,
  `data/performance.test.ts`, `data/post-detail.test.ts`, `src/app/(app)/content/performance/[postId]/page.tsx`

**Interfaces (produces):**
- `loadPostsForMath(supabase, userId, opts?: { includeTests?: boolean }): Promise<PostRowForView[]>`.
  The default adds `.eq("is_test", false)`. `PostRowForView` gains `is_test: boolean` (and `topic: string`
  if slice A did not add it).
- `PostDetail` gains `isTest: boolean`.

**Every reader of Miguel's posts, and what happens to it:**

| File and function | Reads posts for | Change |
|---|---|---|
| `data/performance.ts` `loadPostsForMath` | every baseline | excludes `is_test` by default |
| `src/app/(app)/content/performance/page.tsx` | Overview cards, attribution, the posts table | none: it calls the default |
| `src/app/(app)/content/week/page.tsx` | `bestTimes` | none: default |
| `data/supabase-today-db.ts` `evidence` | evidence counts, winner hooks, recent hooks | none: default |
| `data/supabase-today-db.ts` `postMath` | Today's verdict multipliers | none: default |
| `data/supabase-recreate-db.ts` `sourceContext` | winners block for Recreate | none: default |
| `data/post-detail.ts` `loadPostDetail` | figures and `winnerInsights` | loads with `includeTests: true`, scores only the non-test posts; for a test post `figures` is `[]`, `insights` is `{ state: "untagged" }` and `isTest` is true |
| `data/queries.ts` `loadPillarBalance` | this week's posts per pillar | adds `.eq("is_test", false)` |
| slice A's review builder and `focusCounts` loader (from Task 1, Step 5) | per-post lists, the two lists, the pillar spread | must go through the default `loadPostsForMath`; add `.eq("is_test", false)` to any direct read |

Left alone on purpose, because they are not baselines, review lists or winners: `data/supabase-db.ts`
`postedTitles` (dedup), `supabaseMetricsDb` (the cron's writes), `data/supabase-tags-db.ts` `untagged`
(a test post is still tagged), `data/actions.ts` `markPosted`, `data/mark-posted-brief.ts`,
`queries.ts` `loadIdeaContext` and `loadOpenRecreations`, and Today's reads by post id. Slice A's
account-wide tiles (views gained across all posts) also keep test posts: they are not per-post lists.

- [ ] **Step 1: Write the failing tests.**
  - `performance.test.ts`, "loadPostsForMath leaves test posts out unless asked": the default query
    carries `is_test = false`; `{ includeTests: true }` does not.
  - `post-detail.test.ts`, "a test post loads with no figures and does not move a normal post's
    multiplier": with fixtures, the normal post's `n_views` is equal with and without the test post present.
  - `wiring.test.ts`, "every direct reader of content_posts is on the list": the set of files under
    `src/features/content/data` containing `from("content_posts")` equals an explicit list (today's
    readers plus slice A's plus `supabase-tests-db.ts`), so a new reader fails until it is classified.
    Also assert `queries.ts` contains `.eq("is_test", false)`.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: The post page** shows `Trial Reel. Left out of your usual numbers.` in place of the
  figures, winners block and Recreate controls when `isTest`.
- [ ] **Step 4: Full suite, typecheck, commit.**

### Task 5: The verdict (pure)

**Files:**
- Modify: `engine/baseline.ts`, `engine/baseline.test.ts`, `engine/test-lab-verdict.ts`
- Create: `engine/test-lab-verdict.test.ts`

**Interfaces (produces):**
- `baseline.ts`: `viewsAtOrAfter(series: SeriesPoint[], fromIso: string, hours: number): { at: string; views: number } | null`.
  The earliest point with a numeric `views` whose `at` is at or after `fromIso + hours`.
- `WIN_RATIO = 1.5`, `WIN_MIN_VIEWS = 1000`, `PROMOTE_MULTIPLE = 3`, `PROMOTE_MIN_VIEWS = 1000`,
  `READ_AFTER_HOURS = 24`, `NOT_RUN_DAYS = 14`, `NO_READING_DAYS = 7`, `PROPOSALS_PER_DAY = 3`,
  `STALE_PROPOSING_MINUTES = 10`, `MAX_DROPPED = 3`, `DOUBLE_DOWN_MIN_WEEKS = 4`, `PAIR_REPEAT_DAYS = 90`,
  `LINK_WINDOW_DAYS = 7`, `PROMOTE_LINE = "Worth sharing to your followers."`.
- `testVerdict(a: number, b: number): TestVerdict`.
- `shouldPromote(views: number, median24h: number | null): boolean`. A null or zero median is false.
- `readingStart(postedA: string, postedB: string): string` (the later of the two).
- `median24h(reels: { posted_at: string; series: SeriesPoint[] }[]): number | null`: the median of
  each Reel's `viewsAtOrAfter(series, posted_at, 24)`, skipping Reels with none. The caller passes
  normal Instagram Reels in the 90-day window.
- `staleReason(t: { opened_at: string; linked: number; laterPostedAt: string | null }, now: Date): string | null`:
  `No post was linked within 14 days.` when fewer than two are linked 14 days after opening;
  `No 24-hour number arrived.` when both are linked and 7 days have passed since the later post.
- `verdictLine(t: { variable: TestVariable; a: { label: string; views: number }; b: { label: string; views: number }; verdict: TestVerdict }): string`.
  Winner: `<winner label> won: <n> views against <m> in the first day.` None:
  `No clear winner: <n> views against <m> in the first day.` Numbers use `toLocaleString("en-US")`.
- `outcomesOf(t: { variable; value_a; value_b; verdict; judged_at }): ExtraOutcome[]`: winner `won`
  and loser `lost`; `none` gives `flat` for both; `at` is `judged_at`.
- `owesOf(linked: 0 | 1 | 2): string[]` for the review section: `["Record and post both versions",
  "Link the two posts on the Tests page"]`, `["Link the other version's post"]`, or
  `["Nothing. The result arrives a day after posting."]`.

- [ ] **Step 1: Write the failing tests** (`it.each` tables):
  - "testVerdict", rows `[a, b, expected]`: `[2000, 1100, "a"]`, `[1100, 2000, "b"]`, `[1300, 1100, "none"]`,
    `[900, 300, "none"]`, `[1500, 1000, "a"]` (exactly 1.5), `[1499, 1000, "none"]`, `[1000, 0, "a"]`,
    `[999, 0, "none"]`, `[1200, 1200, "none"]`.
  - "shouldPromote": `[3000, 1000, true]`, `[2999, 1000, false]`, `[900, 200, false]`, `[5000, null, false]`, `[5000, 0, false]`.
  - "a snapshot 10 hours after posting gives no reading; the next day's does": posted `2026-11-16T00:00Z`,
    points at `T10:00Z` (views 400) and the next day `T10:00Z` (views 2100); `viewsAtOrAfter(..., 24)` returns the second.
  - "a null-views snapshot at the mark is skipped" **(Review focus 2)**.
  - "two posts either side of the cron are read by the same run" **(Review focus 1)**: A posted
    `09:50Z`, B `10:20Z`, daily points at `10:00Z`; from `readingStart` both read the point two days
    later, not one each a day apart.
  - "staleReason": 13 days, 0 linked: null; 14 days, 1 linked: the first text; both linked, 6 days: null; 7 days: the second text.
  - "outcomesOf": a win gives one `won` and one `lost` for the variable; `none` gives two `flat`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/features/content/engine/test-lab-verdict.test.ts src/features/content/engine/baseline.test.ts`
- [ ] **Step 3: Implement. Run them and see them pass. Commit.**

### Task 6: The picker (pure)

**Files:**
- Create: `engine/test-lab-picker.ts`, `engine/test-lab-picker.test.ts`

**Interfaces:**
- Consumes: `ValueCount`, `valueLabel` (`engine/experiments.ts`); `ActiveFocus`, `isSkipped` (`engine/focus.ts`); Task 3's types and Task 5's constants.
- Produces:
  - `type Held = { hook_type?: string; onscreen_text?: string; topic?: string; pillar: string }`
  - `type Question = { rule: 1 | 2 | 3 | 4 | 5; kind: TestKind; variable: TestVariable; a: string; b: string; held: Held; ideaIds: string[]; reason: string }`.
    `a` is the value in question, `b` what it is compared against. `ideaIds` has one id for a cut
    test, and two (a's then b's) for a topic test.
  - `type PastTest = { variable: TestVariable; a: string; b: string; status: TestStatus; verdict: TestVerdict | null; held: Held; opened_at: string | null; judged_at: string | null }`
  - `type PickerInput = { counts: Record<TestVariable, ValueCount[]>; control: { hook_type: string; onscreen_text: string }; focus: ActiveFocus; hookWinTopics: Record<string, string[]>; endedSkips: { dimension: "hook_type" | "topic"; value: string; ended_on: string }[]; topics: { slug: string; label: string; pillar: string }[]; ideas: { id: string; topic: string; pillar: string }[]; past: PastTest[]; today: string }`
  - `pickQuestions(input: PickerInput): Question[]`: every valid question, best first. The flow tries them in order.
  - `currentBest(variable: TestVariable, input: PickerInput): string`.

**Rules the tests pin:**
- **Current best:** the control recipe's value for hooks and card styles. For topics, the unskipped
  topic with the most wins; ties go to more posts, then list order.
- **Ranking inside a variable** ("best value"): wins, then win share, then posts, then list order.
- **A question is valid only when** the two values differ; neither value and no held hook or topic is
  under an active skip; the unordered pair has no past test of that variable that reached `open`
  (status `open`, `judged`, `skipped` or `not_run`) within 90 days of `today`; and the ideas it needs exist.
- **Ideas:** `input.ideas` is the claimable Inbox Reel ideas, best first, each with a topic. An opening
  or card test takes one. A topic test takes one idea per topic.
- **Rule 1, neighbor of the last winner.** Fires only when the newest judged test has a winner.
  - Hook won on topic T: opening test, winner against the best hook it has not faced, on the first
    idea whose topic is not T and whose pillar is T's pillar.
  - Topic won: topic test, winner against the best other topic under the same pillar, `held.hook_type` copied from that test.
  - Card style won: card test, winner against the one style that test did not include, with
    `held.hook_type` the best-ranked unskipped hook that differs from that test's held hook.
- **Rule 2, confirm a double-down.** A hook in `focus.doubleDown.hook_type` whose `hookWinTopics`
  entry has exactly one distinct topic: opening test against the current best other hook, on an idea with a different topic.
- **Rule 3, settle a maybe.** A value with 1 or 2 posts and at least 1 win, against the current best.
- **Rule 4, second chance.** A value in `endedSkips` whose skip ended in the last 28 days and that no
  later test has included, against the current best.
- **Rule 5, unexplored.** A hook type, card style, or topic in `input.topics`, with 0 posts, against the current best.
- In rules 3 to 5: hooks first (opening test on the best idea), then topics (topic test, held hook is
  the control hook), then card styles (card test, held hook is the control hook).
- **Reason, one sentence, with labels from `valueLabel` and the topic's label:**

| Rule | Text |
|---|---|
| 1, hook | `<A> won its last test on <T>. Does it still beat <B> on a different topic?` |
| 1, topic | `<A> won its last test. Does it beat <B>, with the same hook?` |
| 1, card | `<A> won its last test. Does it beat <B> under a different hook?` |
| 2 | `<A> keeps winning, but only on <T>. Does it beat <B> on a different topic?` |
| 3 | `<A> has won <won> of <total>. Is it better than <B>, your usual?` |
| 4 | `<A> is back after 90 days off. Is it better than <B> now?` |
| 5 | `You have not tried <A> in the last 90 days. Is it better than <B>, your usual?` |

- [ ] **Step 1: Write the failing tests**, table-driven over small fixture builders:
  - "after a win for hook X on topic T, the next test is an opening test of X against the next hook,
    on a different topic in T's pillar" **(Acceptance 1)**: the first question has `rule: 1`,
    `kind: "opening"`, `a: X`, `b` the best-ranked other hook, `held.topic !== T`, `held.pillar` equal to T's pillar.
  - "rule 1 does not fire when the last judged test had no clear winner".
  - "rule 1 for a topic win stays in the pillar and keeps the hook"; "rule 1 for a card win uses the remaining style and a different hook".
  - "a value under an active skip is never proposed" **(Acceptance 2)**: with a skipped hook that
    rules 3 and 5 would pick, and a skipped topic that would be held, no question contains either.
  - "the same pair is not proposed again inside 90 days, in either order": a past `open` test of
    (X, Y) 89 days ago blocks (Y, X); at 91 days it does not; a `failed` past test never blocks.
  - "an opening test never has two versions of the same hook type" **(Acceptance 6a)**: for every
    question from a broad fixture, `kind === "opening"` implies `a !== b`.
  - "a card test is proposed with no prior card win" **(Acceptance 6b)**: one fixture reaches it by
    rule 3 (a style with 1 of 2 won), one by rule 5 (a style with 0 posts).
  - "rules come out in order 1 to 5, hooks before topics before card styles": a fixture that satisfies
    all five returns `rule` values in non-decreasing order, and inside rule 5 the variables in that order.
  - "rule 2 needs every win on one topic"; "rule 4 ignores a skip that ended 29 days ago".
  - "a question with no idea to carry it is left out": a topic test with an idea on only one topic is absent.
  - "each reason matches its rule's text".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 7: Writing and gating the card

**Files:**
- Create: `engine/test-lab-card.ts`, `engine/test-lab-card.test.ts`, `data/test-lab.ts`,
  `data/test-lab.fake.ts`, `data/test-lab.test.ts`

**Interfaces:**
- Consumes: `pickQuestions`, `Question` (Task 6); `gatePiece`, `gateRecord` (`data/brand-gate.ts`);
  `ToolCaller`; `BRAND_CONTEXT` (`engine/prompts/ideas.ts`); `chicagoDayStart` (`data/recreate.ts`).
- Produces, in `engine/test-lab-card.ts`:
  - `CARD_TOOL_NAME = "record_test_card"`, `CHECK_TOOL_NAME = "record_version_check"`.
  - `type VersionDraft = { label: VersionLabel; hook: string; card_text: string; outline: string[] }`
  - `type CardOut = { why: string; versions: [VersionDraft, VersionDraft]; notes: { record_once: string; record_twice: string; cuts: string } }`
  - `cardSystemPrompt(rules: string[])`, `renderCardTurn(a: { question: Question; ideas: { title: string; hook: string; topic: string }[]; skipReasons: string[]; recentHooks: string[] })`,
    `cardToolSchema()`, `cardOutputSchema(q)` (zod: hook at most 140 characters, outline 3 to 5 lines,
    `why` at most 300). The prompt embeds `BRAND_CONTEXT`, the approved taste rules with "the brand wins", and the last 5 skip reasons.
  - `cardStyleOf(hook: string, cardText: string): "none" | "repeats-hook" | "adds-to-hook"`: empty is
    `none`; equal to the hook after lowercasing and stripping punctuation is `repeats-hook`; else `adds-to-hook`.
  - `oneDifference(kind: TestKind, a: VersionDraft, b: VersionDraft): boolean`. Opening: outlines
    equal, hooks differ. Card: hooks equal, outlines equal, card texts differ. Topic: always true.
  - `questionText(q: Question, labelOf: (v: string) => string): string`: `Does <A> beat <B>?`
  - `POSTING_NOTE = "Post both as Trial Reels, within an hour of each other, with the same caption. Link each one here within a week of posting."`
  - `versionCheckSchema(kind, allowed: string[])` (zod: `{ hook_type }` for an opening test, `{ topic }` for a topic test).
- Produces, in `data/test-lab.ts`:
  - `type TestRow`, `type VersionRow` (the columns of Task 3), `type TestView = TestRow & { versions: VersionRow[] }`.
  - `interface TestsDb` with, for this task: `expireStale(beforeIso)`, `live(): Promise<TestRow | null>`,
    `countSince(sinceIso): Promise<number>` (every status, every trigger),
    `insertProposing(trigger): Promise<string | null>` (null on the one-live index),
    `pickerInput(now): Promise<PickerInput>`, `writerContext(q): Promise<{ ideas; skipReasons; recentHooks; rules; pillarTopics: string[] }>`,
    `openTest(id, row, versions): Promise<boolean>` (conditional on `status = 'proposing'`),
    `failTest(id, error, dropped): Promise<void>` (same condition), `get(id): Promise<TestView | null>`.
  - `startProposal(db: TestsDb, trigger: "routine" | "button", now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string; reason: "open" | "cap" | "busy" }>`
  - `runProposal(db: TestsDb, caller: ToolCaller, id: string, now: Date, timeLeft: () => number): Promise<void>`. Never throws.
  - `gateVersion(caller, q: Question, v: VersionDraft, pillarTopics: string[], now): Promise<{ version: VersionDraft; gate: GateRecord } | null>`

**Flow:**
- `startProposal`: fail `proposing` rows older than 10 minutes with `Timed out`. A live `open` test:
  `A test is already open.` (`open`). A live `proposing` row: `A test is already being proposed.`
  (`busy`). Button only: `countSince(chicagoDayStart(now)) >= 3` gives `That's 3 test proposals today. Try again tomorrow.` (`cap`). Then insert.
- `runProposal`: build the questions. None: fail with `No test is left to propose.` For each question
  in order, until one opens or `MAX_DROPPED` have dropped:
  1. Stop with `Ran out of time. Try again.` when `timeLeft() < 90`.
  2. One Claude call writes the card (`maxTokens: 4000`). An invalid answer, or `oneDifference` false, drops the question.
  3. `gateVersion` on both versions in parallel. A null from either drops the question.
  4. `oneDifference` again on the gated versions. False drops it: a rewrite changed a shared part.
  5. `openTest` with `question`, `reason`, `why`, `notes`, `opened_at` and the two versions.
  After the third drop: fail with `Three proposed tests did not meet the brand standard. Nothing was proposed.`
  Every drop is pushed to `dropped` as `{ question, why }`.
- `gateVersion`: `gatePiece(caller, { format: "reel", fields }, { rewrite: true })` with fields
  `{ hook, outline }` plus `card` when `card_text` is not empty. Null unless `passed`, the gate's
  `pillar` equals `q.held.pillar`, the hook is still at most 140 characters and the outline 3 to 5
  lines. When `rewritten`, the tested value must survive:
  - card test: `cardStyleOf(hook, card)` must still equal the version's value;
  - opening or topic test: one more call (`CHECK_TOOL_NAME`, `maxTokens: 500`) names the rewritten
    version's hook type, or its topic from `pillarTopics`. A different answer, or an invalid one, is null.
- In a card test the card writer writes only the `adds-to-hook` text. The flow sets `card_text` to
  the hook for `repeats-hook` and to `""` for `none` before the gate.

- [ ] **Step 1: Write the failing engine tests** (`test-lab-card.test.ts`):
  - "the card prompt carries the brand context, the single difference and the last skip reasons";
    "cardOutputSchema rejects a 141-character hook and a 2-line outline".
  - "cardStyleOf" table: `["Stop saving.", "", "none"]`, `["Stop saving.", "stop saving", "repeats-hook"]`, `["Stop saving.", "Do this instead", "adds-to-hook"]`.
  - "oneDifference": an opening test with equal hooks is false; a card test whose outlines differ is false.
- [ ] **Step 2: Write the failing flow tests** (`test-lab.test.ts`, fake db, scripted caller):
  - "both versions pass: the test opens with two versions and their gate records" (the gate tool is called once per version).
  - "a version that fails the gate twice drops the test, and the picker's next question is tried"
    **(Acceptance 5)**: question 1's version B fails, is rewritten and fails again; the opened test is
    question 2; `dropped` has one entry.
  - "a rewrite that changes the hook type counts as a fail": the gate passes after a rewrite, the
    check call names another hook type, the question is dropped. The same for a topic.
  - "a rewrite that changes the card style counts as a fail" (no check call is made);
    "a rewrite that changes a shared part drops the test".
  - "a gate pillar that differs from the held pillar drops the test"; "a gate error drops the test".
  - "after three dropped tests the run stops and says so": the row is `failed` with the exact text.
  - "with no valid question the run fails and nothing stays proposing" **(Review focus 5)**.
  - "startProposal": refuses with an open test; refuses the fourth button press of the day (three
    rows, one `failed`, one `skipped`, one `judged`: every status counts); the routine is not capped;
    a `proposing` row 11 minutes old is failed and a new one starts.
  - "runProposal never throws": the caller throws on the first call; the row is `failed`.
- [ ] **Step 3: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 8: The adapter, the idea hold, the route and the first actions

**Files:**
- Create: `data/supabase-tests-db.ts`, `data/supabase-tests-db.test.ts`, `data/test-lab-run.ts`,
  `data/test-lab-actions.ts`, `src/app/api/content/tests/propose/route.ts`
- Modify: `data/supabase-today-db.ts` (`unclaimedInboxIdeas`), `data/supabase-today-db.test.ts`,
  `data/test-lab.ts`, `data/test-lab.test.ts`, `wiring.test.ts`

**Interfaces:**
- `supabaseTestsDb(client: SupabaseClient<Database>, userId: string): TestsDb`. Every query filters by `user_id`.
- `pickerInput(now)` builds:
  - `counts.hook_type` and `counts.topic` from `focusCounts(posts, scores, windowStart, extra)`;
    `counts.onscreen_text` from `evidenceCounts(posts, scores, windowStart, extra).onscreen_text`;
    `control` from `controlRecipe`; `posts` from the default `loadPostsForMath`; `extra` from `loadExtraOutcomes`.
  - `focus` from `loadActiveFocus(userId, today)`.
  - `hookWinTopics`: topics of eligible Reels that won, per hook type, plus hook tests that had a winner (`held.topic`).
  - `endedSkips`: `content_focus` rows with `kind = 'skip'` and `ends_on <= today` or `lifted_at` set.
  - `topics` from `content_topics`.
  - `ideas`: `content_ideas` with `status = 'inbox'`, `format = 'reel'`, `topic <> ''`, best score
    then newest, minus any idea with a `content_experiments` row (any status), minus any idea on a
    version of a `proposing` or `open` test, minus ideas `isSkipped` rejects.
  - `past`: the last 120 days of tests.
- `data/test-lab-run.ts`: `startProposalInBackground(userId: string, trigger: "routine" | "button"): Promise<{ started: boolean; reason?: "open" | "cap" | "busy" | "no_key"; error: string | null; id?: string }>`.
  Pattern: `data/taste-run.ts`. Admin client; `anthropicToolCaller({ timeoutMs: 60_000, maxRetries: 0 })`
  built before any row is inserted; `waitUntil(runProposal(..., timeLeft))` with a 280-second budget from the start.
- `data/test-lab-actions.ts`: `proposeTestAction(): Promise<{ error: string | null; message?: string }>`
  (message `A test is on the way. This takes a few minutes.`) and
  `skipTestAction(formData)` (fields `id`, `reason`: 1 to 200 characters, `Say why in a few words.`).
- `skipTest(db, id, reason): Promise<{ error: string | null }>` in `data/test-lab.ts`: only an `open`
  test; sets `skipped`, `skip_reason`, `closed_at`. `TestsDb` gains `close(id, status: "skipped" | "not_run", reason): Promise<boolean>`.
- Route: `POST`, `authorizeRoutine(req, process.env.CONTENT_ENGINE_SECRET)`, `dynamic = "force-dynamic"`,
  `maxDuration = 300`. Reply 200 `{ ok: true, started: true, id }` or `{ ok: true, started: false, reason }`;
  503 `{ ok: false, error }` when the API key is missing.

- [ ] **Step 1: Write the failing tests.**
  - `supabase-tests-db.test.ts`, "every query filters by the owner" (pattern: `supabase-today-db.test.ts`).
  - "Today leaves alone an idea held by an open test": `unclaimedInboxIdeas` drops ideas on a version of a `proposing` or `open` test.
  - `test-lab.test.ts`, "a skipped test frees its ideas": after `skipTest`, the fake's `pickerInput` lists the idea again; "skip needs an open test".
  - `wiring.test.ts`: the route is on the `authorizeRoutine` list; `test-lab-actions.ts` is on the
    owner list and its exports all match `/export async function \w+Action\b/`; `test-lab-run.ts` has no `"use server"`.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Full suite, typecheck, commit.**

### Task 9: Linking the posts and reading the result

**Files:**
- Create: `data/test-lab-cron.ts`, `data/test-lab-cron.test.ts`
- Modify: `data/test-lab.ts`, `data/test-lab.fake.ts`, `data/test-lab.test.ts`, `data/supabase-tests-db.ts`,
  `data/test-lab-actions.ts`, `src/app/api/content/cron/metrics/route.ts`, `wiring.test.ts`

**Interfaces:**
- `type PostOption = { id: string; url: string; caption: string; posted_at: string; thumbnail_url: string }`
- `type Reading = { views: number; saves: number | null; shares: number | null; at: string }`
- `TestsDb` gains: `linkable(now): Promise<PostOption[]>`, `setVersionPost(testId, label, postId | null)`,
  `setPostTest(postId, on)`, `saveTyped(testId, label, n: { views; saves; shares; link })`, `openTests()`,
  `postedAt(postIds): Promise<Map<string, string>>`, `readings(t, fromIso): Promise<Record<VersionLabel, Reading | null>>`,
  `median24h(now): Promise<number | null>`, `judge(id, patch): Promise<boolean>` (conditional on `status = 'open'`),
  `pendingEffects()` (`judged`, `effects_at` null), `useIdea(ideaId, postId | null)`, `markEffects(id, atIso)`.
- `linkVersion(db, a: { testId: string; label: VersionLabel; postId: string }, now, opts: { unlinkClearsFlag: boolean }): Promise<{ error: string | null }>` **[A+B]**
- `saveNumbers(db, deps, a: { testId; label; views; saves; shares; link }, now): Promise<{ error: string | null; judged: boolean }>` **[C]**
- `type Effects = { addTestDoubleDown: typeof import("./focus").addTestDoubleDown }`
- `judgeOpenTests(db: TestsDb, deps: Effects, userId: string, now: Date): Promise<{ judged: number; closed: number; effects: number }>`
- `runTestsCron(a: { db: TestsDb; deps: Effects; userId: string; now: Date }): Promise<{ judged: number; closed: number; effects: number } | { error: string }>`. Never throws.
- Actions: `linkVersionAction(formData)` **[A+B]**, `saveNumbersAction(formData)` **[C]**.

**Rules:**
- `linkable`: Instagram Reels posted in the last 7 days that are on no test version and on no `content_experiments` row.
- `linkVersion` refuses: a test that is not `open` (`This test is closed.`); a post not in `linkable`,
  unless it is this version's current post (`Pick one of your Reels from the last 7 days.`); the other
  version's post (`That Reel is already version <X>.`). It sets the version's `post_id` and the post's
  `is_test = true`. Replacing a link clears the old post's flag only when `unlinkClearsFlag` (outcome B).
- `judgeOpenTests`, for each `open` test:
  1. Both versions linked **[A+B]**: `readings(t, readingStart(postedA, postedB))`. Both present: judge.
     Both versions typed **[C]**: the typed numbers are the readings.
  2. Judge: `testVerdict`, `shouldPromote` per version against `median24h`, `verdictLine`; write the
     versions' `views_24h`, `saves_24h`, `shares_24h`, `read_at`, `promote`; `judge(id, …)` sets
     `judged`, `verdict`, `verdict_line`, `judged_at`.
  3. Otherwise `staleReason`: a text closes the test as `not_run`.
  Then, for each test in `pendingEffects()`:
  4. A winner on `hook_type` or `topic`: `deps.addTestDoubleDown(userId, { dimension, value: winner, day: chicagoIsoDate(now), minWeeks: 4 })`.
     A card-style winner and a `none` verdict call nothing.
  5. Ideas: `useIdea(ideaId, postId)` marks the idea `posted` when it is still `inbox` or `queued`,
     and sets the post's `idea_id` and `hook_used` when the post has no idea. Cut test: the winner's
     post, A's on `none`. Topic test: each idea with its own version's post. **[C]**: `useIdea(ideaId, null)` archives it.
  6. `markEffects`. A throw in 4 or 5 is logged and leaves `effects_at` null, so the next run retries.
     `addTestDoubleDown` extends, so a retry cannot double-apply.
- The evidence needs no write: `loadExtraOutcomes` derives it from judged tests (Task 11).
- Cron: `runTestsCron` runs after `runMetricsCron` and before `runCompetitorCron`. It makes no Claude
  call. The reply gains `tests`. In outcome C it only closes stale tests and retries effects.
- `saveNumbers` **[C]** stores one version's numbers (whole numbers, zero or more) and, when both
  versions have them, runs the same judging at once.

- [ ] **Step 1: Write the failing tests** (`test-lab.test.ts`, `test-lab-cron.test.ts`):
  - "linking a post marks it a test post" and "linking removes it from the baseline set and the
    review's per-post lists" **(Acceptance 4)**: after `linkVersion`, the fake's default post read
    (what `loadPostsForMath` returns) no longer contains the post.
  - "linking refuses the same post twice, a post in a Today experiment, a post 8 days old, and a
    closed test; a link can be changed until the verdict" **(Review focus 3)**. With
    `unlinkClearsFlag: true` the replaced post's flag is cleared; with `false` it stays.
  - "2,000 against 1,100 is judged a winner; 1,300 against 1,100 and 900 against 300 are no clear
    winner" **(Acceptance 3)**, end to end through `judgeOpenTests` with fake readings.
  - "a snapshot 10 hours after posting gives no verdict; the next day's does" **(Acceptance 7)**: the
    first run leaves the test `open`; the run a day later judges it.
  - "one version linked: no verdict"; "promote is set at 3,000 views against a 1,000 median, and not at 2,999".
  - "a hook win calls addTestDoubleDown with minWeeks 4; a topic win too; a card win and a tie do not";
    "a loss never writes a skip".
  - "an idea from a judged test is not offered again by Today or by the next test" **(Acceptance 8)**:
    after judging, the idea is `posted` (or `archived` in C), and neither the fake's `pickerInput().ideas`
    nor the Today fake's `unclaimedInboxIdeas` contains it. Topic test: each idea is linked to its own version's post.
  - "an idea Miguel passed mid-test is left as it is"; "runTestsCron never throws".
  - "a failed follow-up is retried and applied once" **(Review focus 4)**: `addTestDoubleDown` throws
    on the first run; the test is `judged` with `effects_at` null; the second run calls it once and stamps `effects_at`.
  - "a test with no post after 14 days closes as not run and frees its ideas".
  - **[C]** "typing both versions' numbers judges at once".
  - `wiring.test.ts`: `runTestsCron(` sits after `runMetricsCron(` and before `runCompetitorCron(` in the cron route.
- [ ] **Step 2: Run them and see them fail. Implement the steps your outcome keeps. Run them and see them pass.**
- [ ] **Step 3: Full suite, typecheck, commit.**

### Task 10: The two-sentence conclusion

**Files:**
- Modify: `engine/test-lab-card.ts`, `engine/test-lab-card.test.ts`, `data/test-lab.ts`,
  `data/test-lab.test.ts`, `data/test-lab-cron.ts`, `data/supabase-tests-db.ts`,
  `src/app/api/content/cron/metrics/route.ts`, `wiring.test.ts`

**Interfaces:**
- `CONCLUSION_TOOL_NAME = "record_test_conclusion"`, `conclusionSystemPrompt()`,
  `renderConclusionTurn(t: TestView, labelOf): string` (the question, each version's value, views,
  saves, shares, the verdict), `conclusionSchema` (zod: one string, at most 400 characters).
- `TestsDb` gains `withoutConclusion(): Promise<TestView[]>` (`judged`, `conclusion = ''`) and `setConclusion(id, text)`.
- `writeConclusions(db: TestsDb, caller: ToolCaller, timeLeft: () => number): Promise<number>`. Never throws.

**Rules:**
- The prompt asks for two sentences: what was tested, what won, what it suggests. It may not claim
  more than the numbers show; saves and shares may be mentioned, never called the reason.
- The answer is kept only when it has at most two sentences and `addedFigures({ turn }, { conclusion })`
  (`data/brand-gate.ts`) is empty. Otherwise `conclusion` stays `''` and the page shows `verdict_line`.
- It is analysis for Miguel, not content, so it skips `gatePiece` (as slice A's why sentences do).
- Cron: after the gate sweep and the digest, when 45 seconds or more remain, with
  `anthropicToolCaller({ timeoutMs: 30_000, maxRetries: 0 })`; a miss is retried on the next cron.
  **[C]**: `saveNumbersAction` also starts it with `waitUntil` through `test-lab-run.ts`.

- [ ] **Step 1: Write the failing tests:** "a conclusion with a number the input lacks is dropped and
  the verdict line stays"; "a three-sentence conclusion is dropped"; "a valid one is stored";
  "writeConclusions stops when under 45 seconds remain and never throws"; in `wiring.test.ts`,
  `writeConclusions(` comes after `postDigests(` in the cron route.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 11: The two seams and Today's evidence

**Files:**
- Modify: `data/review-sections.ts`, `data/review-sections.test.ts` (create if slice A left none),
  `data/supabase-today-db.ts` (only if Task 1, Step 3 found the gap)

**Interfaces (bodies replaced, signatures unchanged):**
- `loadExtraOutcomes(userId, windowStart)`: `outcomesOf` for every `judged` test with `judged_at >= windowStart`.
- `loadTestSection(userId, weekStart)`:
  - When `weekStart` is the newest finished week and a test is `open`: `{ state: "open", question, owes: owesOf(...), verdict: null, conclusion: null, href: "/content/tests" }`.
  - Otherwise the newest test judged from `weekStart` 00:00 America/Chicago up to 8 days later (so a
    verdict from the build Monday's morning cron shows that day): `{ state: "judged", question, owes: [], verdict: verdict_line, conclusion: conclusion || null, href }`.
  - Otherwise `null`. A `proposing` row gives `null`.
- Use the client Task 1, Step 3 recorded, filtered by `user_id`.

- [ ] **Step 1: Write the failing tests:**
  - "a judged hook win yields one won and one lost outcome for hook_type; a tie yields two flats; a test judged before the window is left out".
  - "a card-style win reaches Today's tally": `evidenceCounts(posts, scores, windowStart, extra).onscreen_text` shows the win.
  - "the review shows the open test with what Miguel owes"; "last week's verdict with its conclusion";
    "a verdict from the build Monday is shown"; "no test gives null".
  - "a test win puts the hook on the double-down list from a test": through slice A's `focusCounts`
    with the loader's outcomes, the winner's `won` rises by one.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: If Today's `evidence()` does not pass the extras, add it** and assert it in `supabase-today-db.test.ts`.
- [ ] **Step 4: Commit.**

### Task 12: The Tests page and tab

**Files:**
- Create: `src/app/(app)/content/tests/page.tsx`, `ui/TestCard.tsx`, `ui/TestCard.test.tsx`,
  `ui/PastTestsList.tsx`, `ui/PastTestsList.test.tsx`, `ui/ProposeTestButton.tsx`
- Modify: `ui/ContentTabs.tsx` (a `Tests` tab after `Review`), `data/supabase-tests-db.ts`, `wiring.test.ts`

**Interfaces:**
- `TestsDb.page(now): Promise<TestsPage>` with
  `type TestsPage = { open: TestView | null; proposing: boolean; lastFailed: { error: string } | null; past: TestView[]; linkable: PostOption[]; strays: PostOption[]; proposalsLeft: number; labels: Record<string, string> }`.
  `past` is `judged`, `skipped` and `not_run`, newest first, limit 50. `lastFailed` is the newest row
  when it is `failed` and from today. `strays` is test posts on no version (empty in outcome C).
- The page is routing and layout only: `requireContentOwner()`, `supabaseTestsDb(supabase, user.id).page(now)`,
  `export const maxDuration = 300`, `AutoRefresh` while `proposing`.

**What the page shows (spec Decision 8):**
- No open test: `ProposeTestButton` (`Propose next test`; at `proposalsLeft === 0` it is disabled and
  shows the cap text), the failed run's error, or `Proposing a test…` while one is being made.
- The open test: question, reason, `why`, two version columns (value label, hook, card text or
  `No card`, outline), the recording notes, `POSTING_NOTE`, and Skip with a reason box.
- Each version column **[A+B]**: a select of `linkable` Reels (date and first 60 caption characters),
  then the linked post with Change. **[C]**: views, saves and shares boxes, an optional link box, and
  `Read these a day after posting.`
- The result: each version's 24-hour views, saves and shares; `Winner` or `No clear winner`;
  `PROMOTE_LINE` under a promoted version; the conclusion, or `verdict_line` until it is written.
- Past tests: one line each with the question, the verdict (or `Skipped`, `Not run`) and the conclusion.

- [ ] **Step 1: Write the failing tests:**
  - `TestCard`: "shows both versions, the single difference and the posting note"; "shows the winner
    and the promote line only on the promoted version"; "falls back to the verdict line with no conclusion";
    "offers the post picker" **[A+B]** or "offers the three number boxes" **[C]**.
  - `PastTestsList`: "lists newest first with verdict and conclusion; renders nothing when empty".
  - `wiring.test.ts`: the page is on the owner list and the no-queries list.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: `npx next build` is clean** (it catches a server-only import in a client component). Commit.

### Task 13: [Outcome A only] The pull flags Trial Reels

**Files:**
- Modify: `data/pulls/types.ts`, `data/pulls/instagram.ts`, `data/pulls/instagram.test.ts`,
  `data/metrics.ts`, `data/metrics.test.ts`, `data/supabase-db.ts`

**Interfaces:**
- `PulledPost` gains `is_trial?: boolean`. `IgMedia` and `MEDIA_FIELDS` gain the field Task 2 recorded;
  `mapIgMedia` sets `is_trial` from it. Add a recorded fixture of the Trial Reel's raw item.
- `MetricsDb` gains `markTests(postIds: string[]): Promise<number>`. `storePull` calls it with the ids
  of pulled posts whose `is_trial` is true. It only ever sets `is_test = true`.

- [ ] **Step 1: Write the failing tests:** "mapIgMedia marks the recorded Trial Reel and not a normal
  Reel"; "storePull flags trial posts and never clears a flag"; "a re-run still changes nothing but the snapshot and the flag".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 14: [Outcome B only] The Trial switch and the stray-Reel list

**Files:**
- Create: `ui/TrialSwitch.tsx`, `ui/TrialSwitch.test.tsx`
- Modify: `data/test-lab.ts`, `data/test-lab.test.ts`, `data/test-lab-actions.ts`,
  `data/supabase-tests-db.ts`, `src/app/(app)/content/performance/[postId]/page.tsx`, `ui/TestCard.tsx` or the page

**Interfaces:**
- `setTrialFlag(db, postId: string, on: boolean): Promise<{ error: string | null }>`: turning it off
  is refused for a post on a test version (`This Reel is part of a test.`). `setTrialFlagAction(formData)`.
- `TestsPage` gains `unlinkedDuringTest: PostOption[]`: Reels that are not test posts, posted between
  `opened_at` and the close (or now) of any test from the last 30 days, and on no version.

- [ ] **Step 1: Write the failing tests:** "the switch flags a post and the default post read drops
  it"; "the switch cannot unflag a linked post"; "the Tests page lists Reels posted while a test was
  open and asks `Was this a Trial Reel?`"; "a flagged stray shows under Trial Reels not in a test with the switch".
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.** The post page
  shows `TrialSwitch` labelled `This was a Trial Reel`.
- [ ] **Step 3: Commit.**

### Task 15: The routine step, the docs and the whole-branch check

**Files:**
- Modify: `routines/content-weekly.md`, `routines/README.md`, `src/features/content/routines.test.ts`
  (or slice A's routine test), `src/features/content/CLAUDE.md`, `docs/superpowers/content-next-steps.md`,
  `docs/PRODUCT-STATUS.md` (the two tables and the route)

- [ ] **Step 1: Insert one numbered step before the routine's last step:** "Propose a test when none
  is open". It POSTs `$CONTENT_API_BASE/api/content/tests/propose` with the bearer header and no
  body, and reports `started` or the `reason`. A failure here never stops the run. Assert in the
  routine test that the file names `/api/content/tests/propose`.
- [ ] **Step 2: Update `CLAUDE.md`.** Map: every new file, the page, the route and migration `0022`.
  Invariants: one live test with two versions and one difference; both versions gated, and a rewrite
  that changes the tested value fails; `loadPostsForMath` excludes `is_test` posts by default; the
  24-hour reading from the later post; the winner and promote constants; the 3-a-day cap and
  10-minute stale rule; a held idea stays `inbox`; follow-ups retry through `effects_at`; the spike outcome.
- [ ] **Step 3: Update `content-next-steps.md`:** Trial Reel tests built; creator suggestions next.
- [ ] **Step 4: Run `npx vitest run`, `npx tsc --noEmit -p .` and `npx next build`.** All three clean.
- [ ] **Step 5: Commit, whole-branch review on the most capable model, open the PR.** The PR lists
  what waits for Miguel: applying `0022` before the merge, the merge itself, and the acceptance run below. Do not merge.
- [ ] **Step 6: After the merge, the real run (Acceptance 9).** Miguel presses **Propose next test**,
  records one cut test, posts both as Trial Reels, links them (or types the numbers). Confirm the
  verdict appears on `/content/tests` within 48 hours and in "This week's test" on the next Monday review.

---

## Acceptance, line by line

| Spec acceptance line | Test | Task |
|---|---|---|
| After a win for hook X on topic T, an opening test of X against the next hook, on another topic in T's pillar | "after a win for hook X on topic T, the next test is…" | 6 |
| A value under an active skip is never proposed | "a value under an active skip is never proposed" | 6 |
| 2,000 and 1,100 win; 1,300 and 1,100 do not; 900 and 300 do not | "testVerdict" table; "2,000 against 1,100 is judged a winner…" | 5, 9 |
| Linking a post removes it from the baseline set and the review's per-post lists | "linking removes it from the baseline set…"; "loadPostsForMath leaves test posts out unless asked" | 9, 4 |
| A version that fails the gate twice drops the test, and the next question is tried | "a version that fails the gate twice drops the test…" | 7 |
| An opening test never has two versions of one hook type; a card test needs no prior card win | "an opening test never has two versions of the same hook type"; "a card test is proposed with no prior card win" | 6 |
| A snapshot 10 hours after posting gives no verdict; the next day's does | "a snapshot 10 hours after posting gives no reading…"; "…gives no verdict; the next day's does" | 5, 9 |
| An idea from a judged test is not offered again by Today or by the next test | "an idea from a judged test is not offered again…" | 9 |
| Miguel runs one real cut test and the verdict appears in the next Monday review | the manual run | 15 |

Decisions by task: 1 in Tasks 2, 13, 14; 2 in 3, 6, 7; 3 in 6, 8; 4 in 7, 8; 5 in 7, 8, 9, 15; 6 in 4, 5, 9, 10; 7 in 9, 11; 8 in 12.
