# Today: Daily Briefs as One-Variable Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/content/today` page with three Instagram briefs a day (two proposed, one from a moment Miguel types), each a one-variable test with a stated control and a reason with counts, judged a week after posting against his median, with a running tally per variable; plus the slice 2 cloud tagging proof.

**Architecture:** Pure logic in `engine/experiments.ts` (evidence counts, control recipe, picker, reason, verdict, tally) and `engine/today-brief.ts` (prompt, tool schema, idea patch). One data module behind a `TodayDb` interface with a Supabase adapter; the daily metrics cron calls judge, expire and generate after the pulls under a time budget; Server Actions start background jobs with `waitUntil` as Recreate does. One migration adds `content_experiments` and `content_today_runs`.

**Tech Stack:** Next.js 14.2 App Router, Supabase (Postgres + RLS), zod, `@anthropic-ai/sdk`, `@vercel/functions`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-27-content-engine-today-design.md`

## Global Constraints

- Owner-only: every page and action opens with `requireContentOwner()`; mutations are Server Actions; RLS is the boundary and writes also filter `.eq("user_id", user.id)`. Cron and background jobs use the admin client with every query filtered by the owner id.
- Feature boundaries (`src/boundaries.test.ts`): `features/content` imports only `shared/` and `features/simulator`. Pages are routing and layout; reads live in `data/`.
- Evidence is Instagram Reels only (`media_type === "reel"`), tagged, in the 90-day window, passing `isEligible` from `engine/winners.ts`. Win = status Promising or Viral at matched age, loss = Lagging, flat = Normal (`statusOf` in `engine/baseline.ts`).
- Held-still variables: `hook_type`, `onscreen_text`, `cta_type`, `post_style`, `cover`. Carried by the idea: `message`, `topic`. `cover` values are flag combinations written `face`, `face+text`, `face+number`, `face+text+number`, `text`, `text+number`, `number`, `none`; a post with any null flag is left out of cover counts.
- Constants, all exported from `engine/experiments.ts` with a one-line comment: `EXPLORE_BELOW = 5`, `TALLY_THIN_BELOW = 3`, `UNJUDGED_AFTER_DAYS = 14`, `TODAY_DAILY_CAP = 5`, `TODAY_MIN_SECONDS = 90`, `JUDGE_DAY = 7`.
- A (variable, value) pair held by a live experiment (`open` or `posted`) is never proposed. Two slots on one day never share a variable or an idea.
- A proposed brief rewrites its claimed Inbox idea in place (status `queued`, new `hook`, `hook_type`, `outline`, `score` 1, old hook in `hook_alt`). The moment brief inserts a `content_sources` row of kind `manual` then a new idea. Unposted briefs are skipped by the next cron.
- Tags from a brief are written at Mark posted only for Instagram URLs and only when the post's `tagged_at` is null; all three cover flags explicit; `tag_confidence` 0.8 each; `hook_spoken` = the brief's hook; no locks.
- Generation is one Claude call inside the metrics cron after judging, timeout = min(200, secondsLeft − 20) seconds, no retry, skipped with a failed run "ran out of time" when under `TODAY_MIN_SECONDS` remain. Model stays `CLAUDE_MODEL`.
- Dates are America/Chicago days via `chicagoDayStart` (`data/recreate.ts`) and `chicagoIsoDate` (`engine/best-times.ts`).
- Copy is short and plain with no em-dashes, no exclamation marks, no "AI"; buttons `min-h-11`; status never by color alone; existing tokens (`bg-card`, `border-edge`, `text-sub`, `text-purple`).
- The shared ingest contract (`engine/schema.ts`), `engine/prompts/ideas.ts`, the daily routine prompt and `vercel.json` do not change. `wiring.test.ts` keeps asserting one cron.
- Migration 0016 is applied by Miguel by hand; never apply it, push, merge or deploy without his go-ahead.
- `pnpm test`, `pnpm typecheck`, `pnpm build` green at the end of every task that touches code.

## Review Focus

1. A fresh window where no value of any variable reaches `EXPLORE_BELOW`: the control falls back to the most-used value, candidates fall back to zero-post values, and the picker still returns two slots on different variables without throwing. Test in Task 2.
2. The claimed Inbox idea is archived or deleted between the pick and Claude's return: the job ends `failed` with a reason, the idea is not rewritten, nothing half-written. Test in Task 6.
3. Claude returns two briefs on the same slot, a `say` with two lines, or a hook over 140 characters: the run ends `failed` with a readable error, no idea changes. Test in Task 4 and Task 6.
4. Mark posted with the URL of a post the routine already tagged: tags untouched, the experiment still gets `post_id`, `judge_at` and status `posted`. Test in Task 8.
5. The cron has under 90 seconds left after the pulls, or the key is unset: the run row is `failed` with the reason, the page shows "Not made yet" with Make now, and Make now at `TODAY_DAILY_CAP` is refused with the cap message. Test in Task 7 and Task 9.

---

### Task 1: Migration 0016 and types

**Files:**
- Create: `supabase/migrations/0016_content_experiments.sql`, `supabase/migrations/0016_content_experiments.test.ts`
- Create: `src/features/content/engine/experiments.ts` (constants only, for the migration test to import)
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `content_experiments` and `content_today_runs`, typed in `Database["public"]["Tables"]`. From `engine/experiments.ts`: `VARIABLES = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover", "message", "topic"] as const`, `HELD_STILL = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover"] as const`, `EXPERIMENT_KINDS = ["proposed", "moment"] as const`, `EXPERIMENT_STATUSES = ["open", "posted", "judged", "unjudged", "skipped", "discarded"] as const`, `VERDICTS = ["won", "lost", "flat"] as const`, `RUN_KINDS = ["cron", "swap", "moment"] as const`, `RUN_STATUSES = ["pending", "ready", "failed"] as const`, types `Variable`, `ExperimentStatus`, `Verdict`, `RunKind`.

- [ ] **Step 1: Write the failing test** `0016_content_experiments.test.ts`, in the style of `0015_content_recreations.test.ts`:
  - `"variable, kind, status and verdict check lists equal the engine constants"` (parse `check (variable in (...))`, `check (kind in (...))`, `check (status in (...))`, `check (verdict in (...))`; verdict allows null).
  - `"idea_id is unique and cascades; post_id sets null"`.
  - `"has a partial unique index on (user_id, day, slot) for live statuses"`: matches `/create unique index \w+ on public\.content_experiments\s*\(user_id, day, slot\)\s*where status in \('open', 'posted', 'judged', 'unjudged'\)/i`.
  - `"today_runs has a partial unique on (user_id, day) for the cron kind and a status check"`.
  - `"both tables enable RLS with the four owner policies and the touch trigger"`.
- [ ] **Step 2: Run** `pnpm vitest run supabase/migrations/0016_content_experiments.test.ts`. Expected: FAIL, file not found.
- [ ] **Step 3: Write the migration.** Header comment: slice 5, apply by hand like 0008 to 0015, nothing to check first. `content_experiments` columns exactly as the spec's Data section (`slot smallint not null check (slot between 1 and 3)`, `moment text not null default ''`, `recipe jsonb not null default '{}'`, `reason text not null default ''`, `judge_metrics jsonb not null default '{}'`, `verdict text check (verdict is null or verdict in ('won','lost','flat'))`, `judge_at timestamptz`, `judged_at timestamptz`). Index `(user_id, day)`. `content_today_runs`: `id`, `user_id`, `day date not null`, `kind`, `status`, `experiment_id uuid references content_experiments(id) on delete set null`, `error text not null default ''`, timestamps; index `(user_id, created_at)` for the cap. Policies and trigger per table, same text as 0015.
- [ ] **Step 4: Update `database.types.ts`** by hand: both tables' Row/Insert/Update.
- [ ] **Step 5: Run** the test, then `pnpm typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat(content): migration 0016 for experiments and today runs`.

### Task 2: Evidence, control recipe and the picker (pure)

**Files:**
- Modify: `src/features/content/engine/experiments.ts`
- Create: `src/features/content/engine/experiments.test.ts`

**Interfaces:**
- Consumes: `WinnerPost`, `isEligible` (`engine/winners.ts`); `PostScore`, `statusOf`, `Status` (`engine/baseline.ts`); `HOOK_TYPES`, `ONSCREEN_TEXT`, `CTA_TYPES`, `POST_STYLES`, `MESSAGES`, `TAG_LABELS`, `PostTags` (`engine/tags.ts`).
- Produces:
  - `EXPLORE_BELOW = 5`, `TALLY_THIN_BELOW = 3`.
  - `type Outcome = "won" | "lost" | "flat"`; `outcomeOf(status: Status | null): Outcome | null` (Pending and null give null).
  - `coverValue(t: Pick<PostTags, "cover_face" | "cover_text" | "cover_number">): string | null` (null when any flag is null; parts joined with `+` in the order face, text, number; `"none"` when all false).
  - `COVER_VALUES: readonly string[]` (the eight combinations, `"none"` last).
  - `valuesOf(variable: Exclude<Variable, "topic">): readonly string[]` from the tag lists; for `post_style` without `carousel` and `image`.
  - `type ValueCount = { value: string; won: number; lost: number; flat: number; total: number; share: number }` (`share` = won / total, 0 when total is 0).
  - `type Evidence = Record<Exclude<Variable, "topic">, ValueCount[]>` with every value from `valuesOf` present, zero counts included.
  - `evidenceCounts(posts: WinnerPost[], scores: Map<string, PostScore>, windowStart: Date): Evidence`.
  - `type HeldStill = (typeof HELD_STILL)[number]`; `type Control = Record<HeldStill, string>`; `controlRecipe(ev: Evidence): Control`.
  - `type Test = { variable: Variable; value: string; control: string }` (`control` is `""` for topic; for `message` it is the best-share message).
  - `type LiveTest = { variable: string; value: string }`.
  - `candidateTests(ev: Evidence, control: Control, live: LiveTest[]): Test[]` ranked per the spec's Decision 4 (steps 2 to 4), ending with the single `topic` candidate only when nothing else exists.
  - `type PlannedSlot = { slot: 1 | 2; test: Test; ideaId: string }`; `pickDay(ev: Evidence, live: LiveTest[], ideaIds: string[]): { control: Control; slots: PlannedSlot[] }` (as many slots as `min(2, ideaIds.length, distinct-variable candidates)`).
  - `pickMoment(ev: Evidence, live: LiveTest[]): { control: Control; test: Test } | null`.
  - `renderReason(test: Test, ev: Evidence): string` (the counts in words; `"No post in the last 90 days has tried this."` for zero-post values; topic: `"Every form choice has enough evidence; a fresh topic is the open question."`).
  - `type TallyRow = { variable: Exclude<Variable, "topic">; label: string; values: (ValueCount & { thin: boolean })[] }`; `tallyRows(ev: Evidence): TallyRow[]` (values with total 0 omitted; `thin` when total < `TALLY_THIN_BELOW`).

- [ ] **Step 1: Write the failing tests** with a `post(over)` helper building a `WinnerPost` with `media_type: "reel"`, tags and `tagged_at`, and a `score(id, n_views, mode, day)` helper:
  - `coverValue`: `{true,false,true}` → `"face+number"`; all false → `"none"`; one null → `null`.
  - `evidenceCounts` counts only Reels, tagged, eligible, in window: a carousel winner and a matched-day-5 post are excluded; a Promising reel counts as won, Lagging as lost, Normal as flat; share is won / total.
  - `controlRecipe`: with hook_type question 4 won of 5 and belief-attacking 6 of 6, control is belief-attacking (share tie-break by count when shares tie); a variable with no value at 5 posts takes the most-used value.
  - `candidateTests`: a value with 1 win and 3 posts outranks one with 2 wins of 4 only if its share is higher; thinner first on equal share; the control's own value is never a candidate; a pair in `live` is removed; when every value is at `EXPLORE_BELOW` or more, zero-post values come in list order; when none, the only candidate is `{ variable: "topic", value: "new", control: "" }`.
  - `pickDay`: two slots on different variables and different ideas; one idea gives one slot; no candidates at all gives zero slots and still a control. **Review Focus 1:** an evidence set of 4 reels, none at 5, yields two slots without throwing.
  - `renderReason` returns a sentence containing the won and total numbers.
  - `tallyRows` omits zero-total values and marks `thin` under 3.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/experiments.test.ts`. Expected: FAIL, exports missing.
- [ ] **Step 3: Implement** the functions above. `evidenceCounts` reads each post's tag value (cover via `coverValue`), skips empty strings, and tallies `outcomeOf(statusOf(scores.get(id).multiplier))`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): experiment evidence, control recipe and picker`.

### Task 3: Verdict (pure)

**Files:**
- Modify: `src/features/content/engine/experiments.ts`, `src/features/content/engine/experiments.test.ts`

**Interfaces:**
- Consumes: `Multiplier`, `statusOf` (`engine/baseline.ts`); `NormalizedPost` (`engine/normalize.ts`); `isEligible`.
- Produces: `UNJUDGED_AFTER_DAYS = 14`, `JUDGE_DAY = 7`; `type JudgeMetrics = { multiplier: number; day: number | null; mode: string; n_saves: number | null; n_watch: number | null }`; `judgeExperiment(a: { postedAt: string; multiplier: Multiplier; normalized: Pick<NormalizedPost, "n_saves" | "n_watch"> | null; now: Date }): { status: "judged"; verdict: Verdict; judge_metrics: JudgeMetrics } | { status: "unjudged"; reason: string } | null` (null means wait).

- [ ] **Step 1: Write the failing tests**: matched day 7 at 1.6 → judged won; settled at 0.4 → lost; matched day 9 at 1.0 → flat with `n_saves` and `n_watch` copied; matched day 5 → null; pending at day 16 → unjudged with reason `"No day-7 figure after 14 days."`; mode none (thin baseline) at day 15 → unjudged.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** `judgeExperiment`: judged when `isEligible(multiplier)`; unjudged when `now - postedAt >= UNJUDGED_AFTER_DAYS` days; else null.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): experiment verdict`.

### Task 4: Brief prompt, tool schema and idea mapping (pure)

**Files:**
- Create: `src/features/content/engine/today-brief.ts`, `src/features/content/engine/today-brief.test.ts`

**Interfaces:**
- Consumes: `CONTENT_POSITIONING`, `IDEAS_PROMPT` (`engine/prompts/ideas.ts`); `recreateSystemPrompt`'s `between` approach and `MESSAGE_MEANING` (export `CANON_MESSAGES` from `engine/recreate.ts` in this task; it is currently module-private); `Test`, `Control` (Task 2); `ingestIdeaSchema`, `outlineBeatSchema` (`engine/schema.ts`); `TAG_LABELS`.
- Produces:
  - `BRIEF_TOOL_NAME = "record_briefs"`, `HOOK_MAX = 140`, `SAY_MIN = 3`, `SAY_MAX = 5`.
  - `type BriefOut = { slot: number; title: string; hook: string; say: string[]; message: string }`; `briefOutputSchema(slots: number[]): z.ZodType<{ briefs: BriefOut[] }>` (exactly one brief per requested slot, each slot once, hook ≤ 140, say 3 to 5 non-empty lines, message in `MESSAGES`; `message` must equal the test value when that slot tests `message`, enforced by the caller through `briefOutputSchema(slots, fixedMessages?: Record<number, string>)`).
  - `briefToolSchema(): Record<string, unknown>`.
  - `type BriefSlotInput = { slot: number; test: Test; held: Control; idea: { title: string; hook: string; pillar: string } | null; moment: string }`.
  - `briefSystemPrompt(): string` (intro line, positioning, the ideas rules slice, canon messages, BRIEF_RULES: one brief per slot, written for the form in `post_style`, say-lines are spoken beats for talking-head styles and on-screen cards for `text-broll`/`animation`/`screen-recording`, hook under 140 characters, never repeat a recent hook, no return promises).
  - `renderBriefTurn(a: { slots: BriefSlotInput[]; winnerHooks: string[]; recentHooks: string[] }): string` (per slot: the test in words with the control value, the held-still recipe with labels, the idea's title and hook or the moment text, the instruction to carry the idea's message unless the test is `message`).
  - `briefIdeaPatch(b: BriefOut, test: Test, held: Control, oldHook: string): { hook: string; hook_alt: string; hook_type: string; title: string; outline: { beat: string }[]; status: "queued"; score: 1 }` (`hook_type` = tested value when the test is `hook_type`, else `held.hook_type`).
  - `momentIdeaSchema` = `ingestIdeaSchema.omit({ source_ref: true, from_hook_backlog: true }).extend({ source_id: z.string().uuid() })`; `momentIdea(b: BriefOut, test: Test, held: Control, sourceId: string, today: string): MomentIdea` (format reel, score 1, status queued set by the adapter, `why_it_stops: "Moment: " + moment` is the caller's).
  - `recipeFor(test: Test, held: Control, message: string, topic: string): Record<string, string>` (held values with the tested one replaced, plus message and topic).

- [ ] **Step 1: Write the failing tests**: output schema rejects a missing slot, a duplicate slot, a 2-line say, a 141-char hook, a message outside the list, and a message other than the fixed one; accepts a valid pair. System prompt contains "## What makes an idea good here", every `MESSAGE_MEANING` key and "Answer only" is not required (the caller adds it). Turn render names the variable label, both values, the held-still labels, the idea hook, and "Moment:" for a moment slot. `briefIdeaPatch` keeps the old hook in `hook_alt` and sets `hook_type` from the test. `momentIdeaSchema` requires `source_id`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/today-brief.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, exporting `CANON_MESSAGES` from `engine/recreate.ts` and importing it.
- [ ] **Step 4: Run** the test and `pnpm vitest run src/features/content/engine`. Expected: PASS, existing recreate tests untouched.
- [ ] **Step 5: Commit** `feat(content): brief prompt, schema and idea mapping`.

### Task 5: A timeout parameter on the Claude caller

**Files:**
- Modify: `src/features/content/data/claude.ts`, `src/features/content/data/claude.test.ts`

**Interfaces:**
- Produces: `anthropicToolCaller(opts?: { timeoutMs?: number; maxRetries?: number }): ToolCaller`; `CLAUDE_CLIENT_OPTIONS(apiKey, opts?)` merges `opts` over `{ timeout: 240_000, maxRetries: 1 }`.

- [ ] **Step 1: Write the failing test**: `CLAUDE_CLIENT_OPTIONS("k", { timeoutMs: 180_000, maxRetries: 0 })` equals `{ apiKey: "k", timeout: 180_000, maxRetries: 0 }`; with no opts it equals the current values.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Recreate's calls keep the defaults.
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(content): Claude caller takes a timeout`.

### Task 6: Today data flow behind an interface

**Files:**
- Create: `src/features/content/data/today.ts`, `src/features/content/data/today.test.ts`, `src/features/content/data/supabase-today-db.ts`, `src/features/content/data/supabase-today-db.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 5; `chicagoDayStart` (`data/recreate.ts`); `chicagoIsoDate`; `loadPostsForMath`, `scorePosts`, `normalizePosts`, `winnerInsights` pattern from `data/post-detail.ts` and `data/supabase-recreate-db.ts` (winner and recent hooks); `ToolCaller`, `MissingApiKeyError`.
- Produces in `data/today.ts`:
  - `type ExperimentRow = { id: string; idea_id: string; day: string; slot: number; kind: "proposed" | "moment"; moment: string; variable: Variable; value: string; recipe: Record<string, string>; reason: string; status: ExperimentStatus; post_id: string | null; judge_at: string | null; verdict: Verdict | null; judge_metrics: JudgeMetrics | Record<string, never>; created_at: string }`.
  - `type RunRow = { id: string; day: string; kind: RunKind; status: "pending" | "ready" | "failed"; experiment_id: string | null; error: string; created_at: string }`.
  - `type BriefView = ExperimentRow & { idea: { id: string; title: string; hook: string; outline: { beat: string }[]; status: string } ; post: { id: string; url: string } | null }`.
  - `type TodayPage = { day: string; briefs: BriefView[]; cronRun: RunRow | null; pendingRuns: RunRow[]; verdicts: BriefView[]; tally: TallyRow[]; youtube: { id: string; title: string }[] }`.
  - `interface TodayDb` with: `evidence(now): Promise<{ ev: Evidence; winnerHooks: string[]; recentHooks: string[] }>`; `liveTests(): Promise<LiveTest[]>`; `unclaimedInboxIdeas(limit): Promise<{ id: string; title: string; hook: string; pillar: string }[]>`; `ideasById(ids): Promise<Map<string, {...}>>`; `insertExperiment(row: Omit<ExperimentRow, "id" | "created_at">): Promise<string>`; `updateExperiment(id, patch: Partial<ExperimentRow>): Promise<void>`; `patchIdea(id, patch): Promise<boolean>` (false when the idea is gone or not `inbox`/`queued`); `insertMomentSource(moment, day): Promise<string>`; `insertMomentIdea(idea: MomentIdea): Promise<string>`; `runFor(day, kind): Promise<RunRow | null>`; `insertRun(row): Promise<string | null>` (null on the cron unique conflict); `updateRun(id, patch): Promise<void>`; `countRunsSince(since): Promise<number>`; `openBefore(day): Promise<ExperimentRow[]>`; `postedToJudge(): Promise<(ExperimentRow & { posted_at: string; postId: string })[]>`; `postMath(postIds, now): Promise<Map<string, { multiplier: Multiplier; normalized: Pick<NormalizedPost, "n_saves" | "n_watch"> | null }>>`; `page(day, now): Promise<TodayPage>`.
  - `expireUnposted(db, now): Promise<number>` (open experiments with `day` before today → `skipped`, idea → `inbox`, `queue_rank` null).
  - `judgeDue(db, now): Promise<{ judged: number; unjudged: number }>`.
  - `generateDaily(db, caller, now): Promise<{ made: number; error: string | null }>`: inserts or reuses the day's `cron` run as `pending`; picks; one Claude call; validates with `briefOutputSchema`; for each slot `patchIdea` then `insertExperiment` with `recipeFor` and `renderReason`; run → `ready`; any failure → run `failed` with the message, no partial experiments (insert experiments only after all idea patches succeeded; on a failed patch, revert the earlier one by restoring `hook`, `hook_alt`, `status: "inbox"`).
  - `startMoment(db, moment, now): Promise<{ ok: true; runId: string } | { ok: false; error: string }>` (cap check with `TODAY_DAILY_CAP` over `swap` and `moment` runs since `chicagoDayStart`; empty moment refused; slot 3 live already → error "Today already has a moment brief. Skip it first.").
  - `runMoment(db, caller, runId, now): Promise<void>` (never throws).
  - `swapTest(db, experimentId, now): Promise<{ ok: true; runId: string } | { ok: false; error: string }>` and `runSwap(db, caller, runId, now)`: old experiment → `discarded`; new test = first candidate on a variable not held by the day's live slots; same idea.
  - `skipBrief(db, experimentId): Promise<{ error: string | null }>`.
  - `makeNow(db, now)`: reuses the failed cron run (`updateRun` to pending) and returns its id for the background job that calls `generateDaily`'s body.
  - `STALE_RUN_MINUTES = 10`: `page()` treats a pending run older than that as failed "Timed out".

- [ ] **Step 1: Write the failing tests** in `today.test.ts` with an in-memory `TodayDb` fake and a scripted `ToolCaller`:
  - `expireUnposted` skips yesterday's open briefs and returns their ideas to inbox; today's stay.
  - `judgeDue` judges a posted experiment at matched day 7 and leaves a day-5 one.
  - `generateDaily` makes two experiments on different variables and ideas, patches both ideas, run ready; with one Inbox idea makes one; with no key error (`MissingApiKeyError` thrown by the caller factory) records a failed run and makes nothing.
  - **Review Focus 2:** `patchIdea` returns false for the second idea → run failed, first idea restored, zero experiments.
  - **Review Focus 3:** caller returns one brief for two slots → run failed with the zod message, no idea patched.
  - `startMoment` at the cap → error naming the cap; `runMoment` inserts source, idea, experiment with `kind: "moment"` and `moment` text, test not held live.
  - `swapTest` discards the old row and the new one has a different variable; `skipBrief` sets skipped and idea inbox.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/today.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `data/today.ts`.
- [ ] **Step 4: Write the adapter** `supabase-today-db.ts` with `supabaseTodayDb(client, userId): TodayDb`; every query filters `user_id`. `evidence` uses `loadPostsForMath`, `scorePosts`, `evidenceCounts`; winner hooks and recent hooks as `supabase-recreate-db.ts` does. `page` builds `TodayPage`: today's experiments with status in (open, posted, judged, unjudged) joined to their ideas, verdicts = judged or unjudged with `judged_at` in the last 7 days, tally via `tallyRows`, youtube = `loadQueued` filtered to format `youtube`, first two. Adapter test like `supabase-recreate-db.test.ts`: a `vi.mock("server-only")` and a chainable fake asserting `user_id` filters on each query and the cron unique conflict (code `23505`) returning null from `insertRun`.
- [ ] **Step 5: Run** both files and `pnpm typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat(content): Today data flow and Supabase adapter`.

### Task 7: The cron runs judge, expire and generate

**Files:**
- Modify: `src/app/api/content/cron/metrics/route.ts`
- Create: `src/features/content/data/today-cron.ts`, `src/features/content/data/today-cron.test.ts`

**Interfaces:**
- Consumes: Task 6 functions; `anthropicToolCaller(opts)`.
- Produces: `runTodayCron(a: { db: TodayDb; callerFor: (timeoutMs: number) => ToolCaller; startedAt: Date; now: Date; budgetSeconds?: number }): Promise<TodayCronReport>` with `type TodayCronReport = { expired: number; judged: number; unjudged: number; briefs: number; error: string | null }`; `budgetSeconds` defaults to 280. The route appends `today: TodayCronReport` to the JSON it returns.

- [ ] **Step 1: Write the failing tests**: with 200 seconds left the caller is built with `timeoutMs = 180_000`; with 250 left, `200_000`; **Review Focus 5:** with 60 left, no caller is built, the cron run is `failed` with error `"ran out of time"` and `briefs` is 0; expire and judge always run first; a thrown `MissingApiKeyError` becomes `error` in the report and a failed run, not a 500.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** `runTodayCron` and call it from the route after `runMetricsCron`, with `startedAt` captured at the top of `GET`; the route's status stays driven by the metrics report.
- [ ] **Step 4: Run** the test, `pnpm vitest run src/features/content/wiring.test.ts` and `pnpm typecheck`. Expected: PASS, clean, crons assertion unchanged.
- [ ] **Step 5: Commit** `feat(content): metrics cron judges, expires and makes the day's briefs`.

### Task 8: Mark posted writes the brief's tags and links the experiment

**Files:**
- Modify: `src/features/content/data/actions.ts` (`markPosted`), `src/features/content/engine/experiments.ts`
- Create: `src/features/content/data/mark-posted-brief.test.ts`

**Interfaces:**
- Produces: `tagsFromRecipe(recipe: Record<string, string>, hook: string): Partial<PostTags> & { tagged_at: string }` (pure, in `engine/experiments.ts`: the five held fields from the recipe, `message` from the recipe, cover flags from the cover value, `hook_spoken` = hook, `hook_onscreen` = "", `tag_confidence` 0.8 on each set field). In `actions.ts`, after the idea is set to posted: `linkExperiment(supabase, userId, ideaId, postId, postedAt, platform)` updates the experiment with `post_id`, `status: "posted"`, `judge_at = posted_at + 7 days`, and writes `tagsFromRecipe` to the post only when `platform === "instagram"` and the post's `tagged_at` is null.

- [ ] **Step 1: Write the failing tests**: `tagsFromRecipe` on `cover: "face+number"` sets `cover_face true, cover_text false, cover_number true` and confidence keys for each field; the action path with a chainable fake: an untagged Instagram post gets the tags and the experiment is posted with `judge_at` 7 days after `posted_at`; **Review Focus 4:** a post with `tagged_at` set keeps its tags and the experiment is still linked; a YouTube URL links without tags; an idea with no experiment changes nothing new.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** The experiment lookup and writes go through the user's cookie client (RLS applies).
- [ ] **Step 4: Run** the file and the existing `actions` tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): Mark posted links the experiment and writes the brief's tags`.

### Task 9: Server Actions, the Today page and its components

**Files:**
- Create: `src/features/content/data/today-actions.ts` (`submitMoment`, `swapBrief`, `skipBriefAction`, `makeBriefsNow`), `src/app/(app)/content/today/page.tsx`, `src/features/content/ui/BriefCard.tsx`, `src/features/content/ui/MomentForm.tsx`, `src/features/content/ui/VerdictsList.tsx`, `src/features/content/ui/TallyTable.tsx`, `src/features/content/ui/YouTubeSlots.tsx`, tests `BriefCard.test.tsx`, `TallyTable.test.tsx`, `VerdictsList.test.tsx`
- Modify: `src/app/(app)/content/page.tsx` (one-line link "Today" above the tabs), `src/features/content/wiring.test.ts` (list `today-actions.ts` and the page among server-only files), `src/features/content/ui/ContentTabs.tsx` only if the tabs component is the natural home for the link (builder's choice; the spec asks for a one-line link, not a nav change).

**Interfaces:**
- Consumes: `TodayPage`, `BriefView` (Task 6); `markPosted` form from `QueueCard.tsx` (reuse its URL field and action); `RecreateCard.tsx` for the pending-poll pattern.
- Produces: actions that mirror `recreate-actions.ts`: check the key first (`anthropicToolCaller` inside try), start with the cookie client, run with `waitUntil(run…(supabaseTodayDb(createAdminClient(), userId), caller, runId, new Date()))`, `revalidatePath("/content/today")`.

- [ ] **Step 1: Write the failing component tests**:
  - `BriefCard` shows the recipe line with labels, the hook, each `say` line, "The test: Hook type: Belief-attacking instead of Question", "Held still: …" with the four other labels, the reason, "Judged on <date>" when `judge_at` is set, the three actions when `open`, and the verdict pill text ("Won") plus figures when `judged`; a `kind: "moment"` card shows "From today: <moment>".
  - `TallyTable` renders one row per variable, "thin" text on thin values, no zero-total values.
  - `VerdictsList` shows "Unjudged" with its reason and links to `/content/performance/<post_id>`.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Build** the components and the page. Page: `requireContentOwner()`, `supabaseTodayDb(supabase, user.id).page(chicagoIsoDate(now), now)`, `export const maxDuration = 300`, title "Today" with the date, sections in the spec's order. Slots with no brief: cron run failed or stale → "Not made yet" + Make now button (error text under it); cron ready but fewer briefs than slots → "Inbox is empty. Recreate a winner, or wait for tomorrow's ideas."; pending → "Making your briefs…" with the poll. Slot 3 empty → `MomentForm` (one text input, placeholder "What is happening today?", button "Make a brief", `min-h-11`). Buttons: "Mark as posted" (QueueCard's URL form), "Swap the test", "Skip". `makeBriefsNow` calls `makeNow` then `waitUntil` over the same body `generateDaily` runs. `YouTubeSlots.tsx` carries a top comment: "Later: fed by Instagram winners (spec Decision 9)."
- [ ] **Step 4: Run** the tests, `pnpm typecheck`, `pnpm build`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(content): Today page with briefs, verdicts, tally and YouTube slots`.

### Task 10: Routine proof and docs

**Files:**
- Modify: `routines/content-tag.md` (step 1 and the transcription snippet), `routines/README.md`, `src/features/content/CLAUDE.md`, `docs/PRODUCT-STATUS.md`, `docs/superpowers/specs/2026-10-13-content-engine-instagram-intelligence-roadmap.md` (row 5), the spec's Status line.

- [ ] **Step 1: Routine.** In `content-tag.md` step 1, prefix both commands with `HF_HUB_DISABLE_XET=1` and add one sentence saying why (Xet hosts are blocked on the cloud allowlist). In the Python transcription snippet, set `os.environ.setdefault("HF_HUB_DISABLE_XET", "1")` before the import. In `README.md` step 3 list the hosts exactly: `amplificawealth.com`, `*.cdninstagram.com`, `*.fbcdn.net`, `pypi.org`, `files.pythonhosted.org`, `huggingface.co`, `cdn-lfs.huggingface.co`; replace the "Whether … is still untested" paragraph with a "Proof" line to be filled after the next cloud run: date, tools line, `hook_spoken` count, hosts added.
- [ ] **Step 2: Docs.** `CLAUDE.md` in the feature: add `experiments.ts`, `today-brief.ts`, `today.ts`, `today-cron.ts`, `today-actions.ts`, `supabase-today-db.ts`, the page and the five components to the map; add invariants: evidence is eligible Reels only; no repeated live tests; brief tags only on untagged Instagram posts; generation inside the metrics cron with the time budget. `PRODUCT-STATUS.md`: migrations through 0016. Roadmap row 5: "**Built <date>** (migration 0016 pending). Spec `2026-10-27-content-engine-today-design.md`." and a line under slice 7 that its experiment half is absorbed. Spec Status: approved and built, branch name.
- [ ] **Step 3: Run** `pnpm vitest run src/features/content/wiring.test.ts src/features/content/engine/prompts` (the routine prompt tests) and `pnpm test`. Expected: PASS.
- [ ] **Step 4: Commit** `docs(content): slice 5 documented; routine sets HF_HUB_DISABLE_XET`.
