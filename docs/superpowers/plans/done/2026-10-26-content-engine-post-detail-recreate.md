# Post Page and Recreate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page per Instagram post that shows how it did and what it shares with Miguel's winners, plus two Recreate buttons that return 3 hook-and-angle options in one Inbox card; the picked option becomes a Reel idea linked to its source post.

**Architecture:** Pure logic in `engine/` (winner counts, figures, recreate schema and prompt), one data module behind a `RecreateDb` interface with a Supabase adapter, Server Actions that start a background job with `waitUntil`, and three UI pieces (post page, Recreate controls, Inbox card). One migration adds `content_recreations` and `content_ideas.source_post_id`.

**Tech Stack:** Next.js 14.2 App Router, Supabase (Postgres + RLS), zod, `@anthropic-ai/sdk`, `@vercel/functions` (new), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-content-engine-post-detail-recreate-design.md`

## Global Constraints

- Owner-only: every page and action opens with `requireContentOwner()` (`data/owner.ts`); every mutation is a Server Action that validates its input; RLS is the boundary, and writes also filter `.eq("user_id", user.id)`.
- Feature boundaries (`src/boundaries.test.ts`): `features/content` imports only `shared/` and `features/simulator`. Pages are routing and layout only; reads live in `data/`.
- Every recreated idea: `format: "reel"`, `score: 1`, `status: "inbox"`, `batch_date` = America/Chicago date (`chicagoIsoDate` in `engine/best-times.ts`), `source_post_id` set.
- Daily cap `RECREATE_DAILY_CAP = 10` per America/Chicago day, failed and discarded runs included. Stale pending after `STALE_PENDING_MINUTES = 10`, error text `"Timed out"`.
- Winners: within media type, tagged posts in the 90-day window, source post excluded, eligible only when the views multiplier mode is `settled`, or `matched` with `day >= 7`; winners = top third by `n_views`, at most 10; block needs at least 15 eligible posts and 5 winners; "lacks" needs at least half the winners and a rest of at least 15.
- Model stays `CLAUDE_MODEL` (Opus). Generation output is exactly 3 options `{hook, angle, topic, message}`.
- Copy is short and plain with no em-dashes; buttons at least 44px tall (`min-h-11`); status never by color alone; existing Tailwind tokens (`bg-card`, `border-edge`, `text-sub`, `text-purple`).
- The shared ingest contract (`engine/schema.ts` `ingestSchema`/`ingestIdeaSchema`) and `engine/prompts/ideas.ts` do not change.
- Migration 0015 is applied by Miguel by hand; never apply it, push, merge or deploy without his go-ahead.
- `pnpm test`, `pnpm typecheck`, `pnpm build` green at the end of every task that touches code.

## Review Focus

1. A source post deleted (cascade) or re-tagged between start and job finish: the job must end `failed` with a reason, never throw unhandled inside `waitUntil`. Test in Task 6.
2. Claude returns 2 options, duplicate topics, or `message: "none"` in adjacent mode: row ends `failed` with a readable error, nothing half-written. Test in Task 4 and Task 6.
3. Pick on a row that is no longer `ready` (discarded, already picked, timed out): returns an error, inserts no idea. Test in Task 6.
4. A post whose views multiplier is `pending`/`none` opens its page: figures show "Not enough data yet" for views instead of `NaN×` or `null×`. Test in Task 3.
5. Idea insert fails after the claim: the row goes back to `ready` so Miguel can pick again. Test in Task 6.

---

### Task 1: Migration 0015 and types

**Files:**
- Create: `supabase/migrations/0015_content_recreations.sql`, `supabase/migrations/0015_content_recreations.test.ts`
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces:**
- Produces: table `content_recreations` and column `content_ideas.source_post_id`, typed in `Database["public"]["Tables"]`. Exported from `engine/recreate.ts` in Task 4: `RECREATE_MODES = ["same-recipe", "adjacent"] as const`, `RECREATE_STATUSES = ["pending", "ready", "failed", "picked", "discarded"] as const` (the migration test imports them, so write them first in Task 1 as the start of `engine/recreate.ts`).

- [ ] **Step 1: Write the failing test** `0015_content_recreations.test.ts`, in the style of `0014_content_post_tags.test.ts`:
  - `"mode check list equals RECREATE_MODES"` and `"status check list equals RECREATE_STATUSES"` (parse `check (mode in (...))`, `check (status in (...))`).
  - `"has a partial unique index on source_post_id and mode for pending and ready"`: matches `/create unique index \w+ on public\.content_recreations\s*\(source_post_id, mode\)\s*where status in \('pending', 'ready'\)/i`.
  - `"adds source_post_id to content_ideas with on delete set null"` and `"source_post_id on recreations cascades"`.
  - `"enables RLS with the four owner policies and the touch trigger"`: matches `enable row level security`, `auth.uid() = user_id` four times, `touch_updated_at`.
- [ ] **Step 2: Run** `pnpm vitest run supabase/migrations/0015_content_recreations.test.ts`. Expected: FAIL, file not found.
- [ ] **Step 3: Write the migration.** Header comment: slice 3, apply by hand in the SQL editor like 0008 to 0014. Columns exactly as the spec's Data section; `options jsonb not null default '[]'`, `error text not null default ''`, `picked_index integer`, `idea_id uuid references public.content_ideas(id) on delete set null`. Index on `(user_id, created_at)` for the cap count. Policies and trigger written out for this one table, same text as 0008's loop. Add the `RECREATE_MODES`/`RECREATE_STATUSES` constants to a new `src/features/content/engine/recreate.ts`.
- [ ] **Step 4: Update `database.types.ts`** by hand: the new table's Row/Insert/Update and `source_post_id: string | null` on `content_ideas` Row, optional on Insert/Update.
- [ ] **Step 5: Run** the test, then `pnpm typecheck`. Expected: PASS, clean.
- [ ] **Step 6: Commit** `feat(content): migration 0015 for recreations and source_post_id`.

### Task 2: Winner insights (pure)

**Files:**
- Create: `src/features/content/engine/winners.ts`, `src/features/content/engine/winners.test.ts`

**Interfaces:**
- Consumes: `PostScore`, `Multiplier` (`engine/baseline.ts`); `PostTags`, `TAG_LABELS`, `MESSAGES` (`engine/tags.ts`).
- Produces:
  ```ts
  export type WinnerPost = PostTags & { id: string; media_type: string; posted_at: string };
  export type WinnerInsights =
    | { state: "untagged" }
    | { state: "thin"; have: number; need: number }
    | { state: "ok"; winners: number; rest: number; shared: string[]; message: string | null; lacks: string | null; caveat: string };
  export const WINNERS_MAX = 10, MIN_ELIGIBLE = 15, MIN_WINNERS = 5, MIN_MATCHED_DAY = 7, LACKS_MIN_REST = 15;
  export function isEligible(m: Multiplier): boolean;
  export function winnerInsights(post: WinnerPost, posts: WinnerPost[], scores: Map<string, PostScore>, windowStart: Date): WinnerInsights;
  export const SMALL_SAMPLE = "Small sample. Read these as hints, not rules.";
  ```
  Tag values counted: `hook_type`, `onscreen_text`, `message`, `cta_type`, `post_style`, and each true cover flag (`cover_face`, `cover_text`, `cover_number`). Blank values are skipped. `message` gets its own sentence, not a `shared` line.

- [ ] **Step 1: Write failing tests** with a fixture builder `mk(id, tags, n_views, mode = "settled", day = null)`:
  - `"untagged post returns untagged"` (`tagged_at: null`).
  - `"excludes the post itself from both groups"`: 16 eligible others plus the post; `winners + rest === 16`.
  - `"ignores pending, none and matched under day 7"`: posts with those modes do not count toward eligible.
  - `"compares within media type only"`: carousels don't count for a reel.
  - `"thin under 15 eligible"`: 14 eligible returns `{ state: "thin", have: 14, need: 15 }`.
  - `"winners are the top third capped at 10"`: 18 eligible gives 6 winners; 45 eligible gives 10.
  - `"shared line uses raw counts on both sides"`: expect `"Question hooks: 6 of your top 10, 4 of the other 20."` Hook types read `"<value label> hooks: ..."` with the value label from `TAG_LABELS` ("Question hooks"); every other tag reads `"<tag label>: <value label>: 6 of your top 10, 4 of the other 20."` Pin both formats in the test.
  - `"message sentence counts posts above median"`: `"Message: velocity. 3 posts carry it, 2 above median."` (above median means `n_views > 1`).
  - `"lacks needs half the winners and a rest of 15"`: cover_number on 5 of 10 winners, rest of 20, post lacks it gives `lacks === "Not in this post: a number on the cover. 5 of your top 10 have one."`; with 4 of 10 gives `null`; with rest 14 gives `null`.
  - `"ok result carries the caveat"`: `caveat === SMALL_SAMPLE`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/winners.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Eligible set = same `media_type`, `tagged_at !== null`, `posted_at >= windowStart`, `id !== post.id`, `isEligible(score.multiplier)`. Sort by `n_views` desc then id; winners = `Math.min(WINNERS_MAX, Math.floor(n / 3))`. Lacks: among values the post does not carry, pick the one with the highest winner count that clears both thresholds; ties by label.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): winner insights for the post page`.

### Task 3: Post figures (pure)

**Files:**
- Create: `src/features/content/engine/post-figures.ts`, `src/features/content/engine/post-figures.test.ts`

**Interfaces:**
- Consumes: `NormalizedPost` (`engine/normalize.ts`), `Multiplier` (`engine/baseline.ts`).
- Produces:
  ```ts
  export type Figure = { label: string; value: string; versus: string; direction: string | null };
  export function postFigures(p: NormalizedPost, m: Multiplier): Figure[];
  export function directionWords(ratio: number | null): string | null; // "2.7× above median" | "0.6× below median" | "at median" | null
  ```
  Four figures in order: Views (`versus: "vs posts at the same age"`, or `"vs your settled median"` when `m.mode === "settled"`), Saves per 1k, Shares per 1k, Watch time (seconds, Reels only; omitted for other media types). Saves, shares and watch use `versus: "vs your 90-day median"` and ratios `n_saves`, `n_shares`, `n_watch`.

- [ ] **Step 1: Write failing tests:** `"views uses the matched label"`, `"views uses the settled label"`, `"pending multiplier shows Not enough data yet"` (value `"Not enough data yet"`, direction `null`), `"rates are per 1k with the 90-day label"` (saves_rate 0.0091 shows `"9.1"`), `"watch time only for reels"`, `"directionWords rounds to one decimal and says at median within 0.05"`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/post-figures.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match the number formatting `ui/PerformanceTable.tsx` uses for the same ratios so acceptance 1 holds.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): figures for the post page`.

### Task 4: Recreate schema, prompt and idea mapping (pure)

**Files:**
- Modify: `src/features/content/engine/recreate.ts` (started in Task 1)
- Create: `src/features/content/engine/recreate.test.ts`

**Interfaces:**
- Consumes: `MESSAGES`, `PostTags` (`engine/tags.ts`), `CONTENT_POSITIONING`, `IDEAS_PROMPT` (`engine/prompts/ideas.ts`), `ingestIdeaSchema` (`engine/schema.ts`), `WinnerInsights` (Task 2).
- Produces:
  ```ts
  export type RecreateMode = (typeof RECREATE_MODES)[number];
  export type RecreateStatus = (typeof RECREATE_STATUSES)[number];
  export const RECREATE_DAILY_CAP = 10, STALE_PENDING_MINUTES = 10, RECENT_HOOK_DAYS = 60;
  export const RECREATE_TOOL_NAME = "record_options";
  export type RecreateOption = { hook: string; angle: string; topic: string; message: string };
  export function recreateOutputSchema(mode: RecreateMode, sourceMessage: string): z.ZodType<{ options: RecreateOption[] }>;
  export function recreateToolSchema(): Record<string, unknown>; // JSON schema for the tool input
  export type RecreateSource = PostTags & { caption: string; media_type: string; figures: string[] };
  export function canRecreate(p: Pick<PostTags, "tagged_at">): boolean;
  export function recreateSystemPrompt(): string; // CONTENT_POSITIONING + the hook rules section of IDEAS_PROMPT + the option rules
  export function renderRecreateTurn(a: { mode: RecreateMode; source: RecreateSource; insights: WinnerInsights; winnerHooks: string[]; recentHooks: string[] }): string;
  export const recreatedIdeaSchema; // ingestIdeaSchema.omit({ source_ref: true, from_hook_backlog: true }).extend({ source_post_id: z.string().uuid() })
  export function recreatedIdea(o: RecreateOption, source: { id: string; hook_type: string; pillar: string }, today: string): z.infer<typeof recreatedIdeaSchema>;
  ```

- [ ] **Step 1: Write failing tests:**
  - `"accepts exactly 3 options"`, `"rejects 2 or 4 options"`.
  - `"rejects duplicate topics, case and spacing insensitive"`.
  - `"adjacent rejects none, blank, the source message, and values outside MESSAGES"`.
  - `"same-recipe requires message equal to the source message"`; and `"same-recipe with a blank or none source accepts any MESSAGES value or none"`.
  - `"tool schema requires options with hook, angle, topic, message"`.
  - `"turn names the mode rule, the source hook, the caption when hooks are empty, and recent hooks to avoid"`: for a carousel with blank `hook_spoken` and `hook_onscreen`, the turn contains the caption.
  - `"turn includes winner sentences only when insights are ok"`.
  - `"recreatedIdea is a reel at score 1 with source_post_id and passes recreatedIdeaSchema"`: title = angle (sliced to 200), hook = option hook, `why_it_stops` = `Topic: <topic>`, hook_type and pillar from the source, `batch_date` = `today`.
  - `"ingestIdeaSchema is unchanged"`: `Object.keys(ingestIdeaSchema.shape)` does not contain `source_post_id`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/recreate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mode rules in the turn, as plain text: same-recipe "Keep the hook type <x>, the post style <y> and the message <m>. Choose 3 different topics." Adjacent: "Keep the hook type and post style. Use a canon message other than <m>, one per option, and say which." Hooks must not repeat the source hook or any recent hook. Pull the hook-rule text from `IDEAS_PROMPT` by slicing between the `## What makes an idea good here` and `## Brand guardrails` headings, and include the guardrails section too; a test asserts both headings are found so a prompt edit fails loudly.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): recreate schema, prompt and idea mapping`.

### Task 5: Generalize the Claude call

**Files:**
- Modify: `src/features/content/data/claude.ts`, `src/features/content/data/claude.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ToolSpec = { name: string; description: string; schema: Record<string, unknown> };
  export type ToolCallInput = GenerateInput & { tool: ToolSpec; maxTokens?: number; model?: string };
  export interface ToolCaller { call(input: ToolCallInput): Promise<unknown> }
  export function claudeToolCaller(client: MessagesClient): ToolCaller;
  export function anthropicToolCaller(): ToolCaller; // throws MissingApiKeyError
  ```
  `claudeIdeaGenerator` and `anthropicIdeaGenerator` keep their signatures and become thin wrappers that pass the found-content tool and `max_tokens: 8000`.

- [ ] **Step 1: Write failing tests:** `"claudeToolCaller forces the given tool and model"` (asserts `tool_choice: { type: "tool", name: "record_options" }`, `model: CLAUDE_MODEL` by default), `"maxTokens defaults to 8000"`, `"truncated answer rejects with the readable message"`. Existing tests stay untouched and must still pass.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/claude.test.ts`. Expected: new tests FAIL, old pass.
- [ ] **Step 3: Implement** by moving the body of `claudeIdeaGenerator.generate` into `claudeToolCaller.call`.
- [ ] **Step 4: Run** the file and `pnpm vitest run src/features/content/data` for the found tests. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(content): Claude call takes its tool as a parameter`.

### Task 6: Recreate data flow behind an interface

**Files:**
- Create: `src/features/content/data/recreate.ts`, `src/features/content/data/recreate.test.ts`, `src/features/content/data/supabase-recreate-db.ts`, `src/features/content/data/supabase-recreate-db.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5; `chicagoIsoDate`.
- Produces:
  ```ts
  export type RecreationRow = { id: string; source_post_id: string; mode: RecreateMode; status: RecreateStatus; options: RecreateOption[]; error: string; idea_id: string | null; created_at: string };
  export interface RecreateDb {
    expireStale(postId: string, before: string): Promise<void>;           // pending -> failed "Timed out"
    countSince(since: string): Promise<number>;                           // rows created since, any status
    live(postId: string, mode: RecreateMode): Promise<RecreationRow | null>;
    insertPending(postId: string, mode: RecreateMode): Promise<string>;  // returns id
    get(id: string): Promise<RecreationRow | null>;
    finish(id: string, patch: { status: "ready"; options: RecreateOption[] } | { status: "failed"; error: string }): Promise<void>; // only when status = pending
    claim(id: string, index: number): Promise<RecreationRow | null>;      // ready -> picked, returns row or null
    unclaim(id: string): Promise<void>;                                   // picked -> ready, picked_index null
    linkIdea(id: string, ideaId: string): Promise<void>;
    insertIdea(idea: z.infer<typeof recreatedIdeaSchema>): Promise<string>;
    discard(id: string): Promise<boolean>;                                // ready|failed -> discarded
    sourceContext(postId: string, now: Date): Promise<RecreateContext | null>; // post, insights, winner hooks, recent hooks
  }
  export type StartResult = { ok: true; id: string } | { ok: false; error: string; liveId?: string };
  export async function startRecreation(db: RecreateDb, postId: string, mode: RecreateMode, now: Date): Promise<StartResult>;
  export async function runRecreation(db: RecreateDb, caller: ToolCaller, id: string, now: Date): Promise<void>; // never throws
  export async function pickOption(db: RecreateDb, id: string, index: number, now: Date): Promise<{ ideaId: string } | { error: string }>;
  export async function regenerate(db: RecreateDb, id: string, now: Date): Promise<StartResult>; // discard, then start same post+mode
  ```
  Cap boundary: start of the current America/Chicago day, as an ISO instant.

- [ ] **Step 1: Write failing tests** against an in-memory fake `RecreateDb`:
  - `"start expires stale pending rows first, then inserts"`: a pending row 11 minutes old becomes failed "Timed out" and a new pending row exists.
  - `"start refuses when a live row exists and returns its id"`.
  - `"start refuses at the daily cap with a plain message"`: 10 rows today returns `{ ok: false, error: "That's 10 recreations today. Try again tomorrow." }`; rows from yesterday Chicago time don't count.
  - `"start refuses an untagged post"`.
  - `"run writes ready with 3 valid options"`.
  - `"run writes failed when Claude returns invalid options"` (2 options) with an error naming the problem; `"run writes failed when the source post is gone"`; `"run writes failed on MissingApiKeyError with its message"`; `"run never throws"` when the caller rejects.
  - `"pick claims, inserts a reel idea at score 1 and links it"`.
  - `"pick on a non-ready row returns an error and inserts nothing"`.
  - `"double pick makes one idea"`: two concurrent `pickOption` calls; one idea inserted.
  - `"pick unclaims when the idea insert fails"`.
  - `"regenerate discards then starts and counts toward the cap"`.
  Adapter test (`supabase-recreate-db.test.ts`, fake query builder in the style of `supabase-tags-db.test.ts`): `claim` filters `.eq("status", "ready")` and `.select()`s the row; `finish` filters `.eq("status", "pending")`; every query filters `user_id`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/recreate.test.ts src/features/content/data/supabase-recreate-db.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `recreate.ts`, then the adapter `supabaseRecreateDb(client: SupabaseClient<Database>, userId: string, deps: { loadPosts: ... }): RecreateDb`. `sourceContext` uses `loadPostsForMath`, `scorePosts`, `normalizePosts` and `winnerInsights`; winner hooks are the `hook_spoken || hook_onscreen || hook_used` of the winners; recent hooks come from `content_ideas` (status inbox or queued, created in the last 60 days) and `content_posts` posted in the last 60 days.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): recreate flow with stale, cap and atomic pick`.

### Task 7: Server Actions and the background job

**Files:**
- Create: `src/features/content/data/recreate-actions.ts`
- Modify: `src/features/content/wiring.test.ts`, `package.json` (add `@vercel/functions`), `pnpm-lock.yaml`

**Interfaces:**
- Produces (all `"use server"`, each opens with `requireContentOwner()`, inputs validated with zod):
  ```ts
  export type RecreateActionResult = { error: string | null; message?: string; liveId?: string };
  export async function startRecreate(formData: FormData): Promise<RecreateActionResult>;   // fields: postId (uuid), mode
  export async function pickRecreateOption(formData: FormData): Promise<{ error: string | null; ideaId?: string }>; // id, index 0..2
  export async function regenerateRecreate(formData: FormData): Promise<RecreateActionResult>; // id
  export async function retryRecreate(formData: FormData): Promise<RecreateActionResult>;      // id of a failed row: discard + start
  ```
  After a successful start, call `waitUntil(runRecreation(supabaseRecreateDb(createAdminClient(), user.id, ...), anthropicToolCaller(), id, new Date()))`. If `anthropicToolCaller()` throws `MissingApiKeyError` before the job, mark the row failed with its message and return that error. Success message: `"3 options on the way to your Inbox."` Each action calls `revalidatePath("/content")` and the post page path.

- [ ] **Step 1:** `pnpm add @vercel/functions`, then add `recreate-actions.ts` to the wiring test's action list so it asserts `"use server"` and `requireContentOwner()`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/wiring.test.ts`. Expected: FAIL, file missing.
- [ ] **Step 3: Implement** the actions. Background writes use `createAdminClient()` with every query filtered by `user.id` (the adapter does this).
- [ ] **Step 4: Run** the wiring test, `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): recreate actions run in the background with waitUntil`.

### Task 8: The post page

**Files:**
- Create: `src/app/(app)/content/performance/[postId]/page.tsx`, `src/features/content/data/post-detail.ts`, `src/features/content/ui/PostFigures.tsx`, `src/features/content/ui/WinnersBlock.tsx`, `src/features/content/ui/RecreateControls.tsx`, `src/features/content/ui/RecreationsList.tsx`, tests `WinnersBlock.test.tsx`, `RecreateControls.test.tsx`
- Modify: `src/features/content/ui/PerformanceTable.tsx` (row title links to `/content/performance/<id>?back=<encodeURIComponent("?" + current query)>`), `src/app/(app)/content/performance/page.tsx` (pass the query string down), `src/features/content/wiring.test.ts` (route listed)

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 6, 7.
- Produces: `loadPostDetail(supabase, userId, postId, now): Promise<PostDetail | null>` in `data/post-detail.ts`, returning the post (series stripped), `figures: Figure[]`, `insights: WinnerInsights`, `live: { "same-recipe": RecreationRow | null; adjacent: RecreationRow | null }`, `recreations: { ideaId; hook; status; postedMultiplier: number | null }[]`, `sourceMultiplier: number | null`.

- [ ] **Step 1: Write failing component tests:**
  - `WinnersBlock`: `"untagged shows Not tagged yet"`, `"thin shows have and need"` (`"Needs 15 tagged posts like this one. You have 9."`), `"ok shows shared lines, the message line, the lacks line and the caveat"`.
  - `RecreateControls`: `"hides buttons for an untagged post"`, `"shows both buttons for a tagged post"`, `"a live row shows a link to the Inbox instead of the button"`, `"after start shows the message in a role=status region"`, `"buttons disable while pending"` (mock the action, assert `disabled`).
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/ui/WinnersBlock.test.tsx src/features/content/ui/RecreateControls.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the components and the loader; `RecreateControls` is a client component using `useFormState`/`useFormStatus` from `react-dom` like `FoundContentForm`. Page: `export const maxDuration = 300`; `notFound()` when the post is missing; back link `href={"/content/performance" + (searchParams.back ?? "")}`; thumbnail `alt` = caption's first line; existing `TagChips` and `TagEditor`. `RecreationsList` ends with: "Results show for ideas marked as posted from the Queue."
- [ ] **Step 4: Run** the tests, `pnpm test`, `pnpm typecheck`, `pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): post page with figures, winners and Recreate`.

### Task 9: The Inbox card

**Files:**
- Create: `src/features/content/ui/RecreateCard.tsx`, `src/features/content/ui/RecreateCard.test.tsx`
- Modify: `src/features/content/data/queries.ts` (add `loadOpenRecreations`), `src/app/(app)/content/page.tsx` (render cards above the list)

**Interfaces:**
- Produces: `loadOpenRecreations(db, userId, now): Promise<(RecreationRow & { source: { id; thumbnail_url; caption } })[]>`: rows with status `pending`, `ready` or `failed` created in the last 7 days, newest first; a `pending` row older than 10 minutes is returned as `failed` with "Timed out" (display only; the next start fixes the database).

- [ ] **Step 1: Write failing tests:** `"pending shows Writing 3 options with when it started"`, `"ready shows 3 options each with a Use this button and topic"`, `"adjacent options show their message chip"`, `"failed shows the reason in role=alert and Try again"`, `"Regenerate asks Replace these 3? before calling the action"` (a two-step inline confirm, no `window.confirm`), `"card shows the source thumbnail and mode label"` (`"Same recipe, new topic"` / `"Adjacent topic"`).
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/ui/RecreateCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the card and loader; render cards in the Inbox above `InboxFilter`.
- [ ] **Step 4: Run** the tests, `pnpm test`, `pnpm typecheck`, `pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): Recreate card in the Inbox`.

### Task 10: Docs

**Files:**
- Modify: `src/features/content/CLAUDE.md`, `docs/PRODUCT-STATUS.md`, `docs/superpowers/specs/2026-10-13-content-engine-instagram-intelligence-roadmap.md` (slice 3 row), the spec's status line

- [ ] **Step 1:** CLAUDE.md map gains `engine/winners.ts`, `engine/post-figures.ts`, `engine/recreate.ts`, `data/recreate.ts` and the invariants: one live recreation per post and mode; the pick claims before it inserts; background writes use the admin client filtered by owner id; the shared ingest contract never carries `source_post_id`. PRODUCT-STATUS lists migration 0015. Roadmap row: built, migration 0015 pending.
- [ ] **Step 2: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 3: Commit** `docs(content): slice 3 documented; migration 0015 noted`.
