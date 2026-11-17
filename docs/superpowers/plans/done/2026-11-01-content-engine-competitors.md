# Content engine slice 6: competitor briefs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watched creators' popular Reels are pulled weekly and become slot 2 of Today as one-variable briefs (a topic test or a format test).

**Architecture:** A pure engine (`engine/competitors.ts`, `engine/competitor-tags.ts`, additions to `engine/experiments.ts` and `engine/today-brief.ts`) and two flows over interfaces: `data/competitors.ts` (pull, collect, tag, creators) over `CompetitorsDb` and `ApifyClient`, and the existing `data/today.ts` over `TodayDb`, extended for the competitor slot. The metrics cron runs the competitor step after the pulls and before the Today tail.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres, RLS), TypeScript, Vitest, zod, `@anthropic-ai/sdk`, Composio REST or Apify REST.

**Spec:** `docs/superpowers/specs/2026-11-01-content-engine-competitors-design.md`

## Global Constraints

- Everything stays in `src/features/content` plus its routes; `src/boundaries.test.ts` must stay green.
- Every content page and action opens with `requireContentOwner()`; pages hold no `supabase.from(` (reads live in an adapter); `wiring.test.ts` lists the new page and action file.
- Every query through the admin client filters `.eq("user_id", userId)`.
- Constants, verbatim from the spec: `COMPETITOR_WEEKLY_CAP_USD = 1.00`, `resultsLimit` 30 per creator, first pull 90 days, later pulls 21 days, run failed after 48 hours pending, `COMPETITOR_FRESH_DAYS = 14`, popular at `VIRAL_FROM` (3) times the creator median, thin under `THIN_BASELINE_BELOW` (8) Reels, `WINDOW_DAYS` (90), copy check at 6 consecutive words, one competitor brief a day, in slot 2.
- Apify input: `dataDetailLevel: "detailedData"`; views are `videoPlayCount`; read results from the run's dataset; filter by `ownerUsername`, Reel type and date after the pull.
- Weekday logic uses America/Chicago (`chicagoIsoDate`); Monday starts the pull.
- A day with no competitor candidate behaves exactly as slice 5 (the existing `today.test.ts` cases pass unchanged).
- `git add` explicit paths only; never `git add src` (unrelated files sit in the working tree).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use the session's model if it differs).

**Plan rulings against the spec (argued here so the executor does not re-decide them):**
- Decision 7 says a topic brief's idea goes through `ingestPayload`. The moment brief already solved the same problem without touching the shared ingest contract: a source row plus `momentIdeaSchema` (which extends the ingest idea schema with `source_id`). The topic brief reuses that path with a `competitor` source. `competitor` is still added to the 0008 check and `SOURCE_KINDS`, so `schema.ts` accepts it automatically; the daily routine's prompt is not edited.
- The rebuttal-or-take label for a competitor source lives in `content_sources.meta.angle` (`"competitor-rebuttal" | "competitor-take"`), which is where Decision 6 reads it.

## Review Focus

1. A dataset item owned by another account (collab) or older than the window (pinned) must be dropped, not stored under the watched creator. Test in Task 2.
2. A creator with no Reels in the window has no median: no post of theirs is popular and nothing divides by zero. Test in Task 2.
3. An Apify run that fails or stays pending must be marked failed (after 48 hours) without failing the metrics cron or blocking Today. Tests in Tasks 6 and 7.
4. A competitor post whose format tags are all below `LOW_CONFIDENCE` must seed a topic brief, never a format brief. Test in Task 3.
5. If both brief attempts fail the copy check, slot 2 becomes a normal proposed brief and the post is marked used. Test in Task 8.

---

### Task 1: Migration 0017 and the constants it mirrors

**Files:**
- Create: `supabase/migrations/0017_content_competitors.sql`, `supabase/migrations/0017_content_competitors.test.ts`
- Modify: `supabase/migrations/0016_content_experiments.test.ts`, `src/shared/supabase/database.types.ts`, `src/features/content/engine/types.ts` (`SOURCE_KINDS`), `src/features/content/engine/experiments.ts` (`VARIABLES`, `EXPERIMENT_KINDS`, `VARIABLE_LABEL`, `Counted`)

**Interfaces:**
- Produces: `VARIABLES` gains `"source"`; `EXPERIMENT_KINDS` gains `"competitor"`; `SOURCE_KINDS` gains `"competitor"`; `VARIABLE_LABEL.source = "Source"`; `export const CREATOR_STATUSES = ["watching", "removed"] as const`, `export const COMPETITOR_RUN_STATUSES = ["pending", "ready", "failed"] as const` (in `engine/competitors.ts`, created here with only these two constants); `Counted` becomes `Exclude<Variable, "topic" | "source">` for now (Task 3 widens it). Tables typed in `database.types.ts`: `content_creators`, `content_competitor_posts`, `content_competitor_runs`; `content_experiments` Row/Insert/Update gain `competitor_post_id: string | null`.

- [ ] **Step 1: Write the failing migration test** (`0017_content_competitors.test.ts`, same style as the 0016 test)

```ts
it("check lists equal the engine constants", () => {
  expect(listFor(creators, "status")).toEqual([...CREATOR_STATUSES].sort());
  expect(listFor(runs, "status")).toEqual([...COMPETITOR_RUN_STATUSES].sort());
  expect(listFor(sql.slice(sql.indexOf("content_experiments_kind_check")), "kind")).toEqual([...EXPERIMENT_KINDS].sort());
  expect(listFor(sql.slice(sql.indexOf("content_experiments_variable_check")), "variable")).toEqual([...VARIABLES].sort());
  expect(listFor(sql.slice(sql.indexOf("content_sources_kind_check")), "kind")).toEqual([...SOURCE_KINDS].sort());
});
it("drops the old checks by their default names before adding the new ones", () => {
  for (const c of ["content_experiments_kind_check", "content_experiments_variable_check", "content_sources_kind_check"])
    expect(sql).toMatch(new RegExp(`drop constraint ${c}`));
});
it("creators are unique per user, platform and username; posts unique per user and shortcode", () => {
  expect(creators).toMatch(/unique \(user_id, platform, username\)/);
  expect(posts).toMatch(/unique \(user_id, shortcode\)/);
});
it("competitor_post_id sets null on delete; posts cascade from creators", () => {
  expect(sql).toMatch(/competitor_post_id uuid references public\.content_competitor_posts\(id\) on delete set null/);
  expect(posts).toMatch(/creator_id uuid not null references public\.content_creators\(id\) on delete cascade/);
});
it("enables RLS with four policies and a touch trigger on each new table", () => { /* as 0016: 3 tables × enable + select/insert/update/delete + `execute function public.touch_updated_at` */ });
```

In the 0016 test, compare against the 0016-era lists: `VARIABLES.filter((v) => v !== "source")` and `EXPERIMENT_KINDS.filter((k) => k !== "competitor")`.

- [ ] **Step 2: Run** `pnpm vitest run supabase/migrations/0017_content_competitors.test.ts` — Expected: FAIL (file not found).

- [ ] **Step 3: Write the migration and the constants.** Columns exactly as the spec's Data section, including `content_creators.last_pull_status` (check `ready`, `failed`, or null) and `content_competitor_posts.briefed_at`, `pushes_belief`, `format_note`, `hook_text`, `tag_confidence jsonb not null default '{}'`. Header comment: "Nothing to check first: three new tables; the three widened checks only add values." Constraint changes:

```sql
alter table public.content_experiments drop constraint content_experiments_kind_check,
  add constraint content_experiments_kind_check check (kind in ('proposed', 'moment', 'competitor'));
alter table public.content_experiments drop constraint content_experiments_variable_check,
  add constraint content_experiments_variable_check check (variable in ('hook_type', 'onscreen_text', 'cta_type', 'post_style', 'cover', 'message', 'topic', 'source'));
alter table public.content_experiments add column competitor_post_id uuid references public.content_competitor_posts(id) on delete set null;
alter table public.content_sources drop constraint content_sources_kind_check,
  add constraint content_sources_kind_check check (kind in ('granola','wispr','plaud','vault','url','upload','comment','scan','manual','competitor'));
```

Hand-write the `database.types.ts` entries to match.

- [ ] **Step 4: Run** `pnpm vitest run supabase/migrations && pnpm typecheck` — Expected: PASS, no type errors (fix any `Record<Variable, …>` that now needs a `source` key).

- [ ] **Step 5: Commit** `feat(content): migration 0017 for creators, competitor posts and runs`

---

### Task 2: Competitor engine: mapping, medians, popularity, copy check

**Files:**
- Modify: `src/features/content/engine/competitors.ts`
- Test: `src/features/content/engine/competitors.test.ts`

**Interfaces:**
- Consumes: `median`, `WINDOW_DAYS`, `THIN_BASELINE_BELOW`, `VIRAL_FROM` from `engine/baseline.ts`.
- Produces:
  - Constants: `COMPETITOR_WEEKLY_CAP_USD = 1`, `COMPETITOR_RESULTS_LIMIT = 30`, `FIRST_PULL_DAYS = 90`, `REPULL_DAYS = 21`, `RUN_STALE_HOURS = 48`, `COMPETITOR_FRESH_DAYS = 14`, `COPY_RUN_WORDS = 6`.
  - `normalizeUsername(raw: string): string | null` — trims, strips a leading `@` and an `instagram.com/` URL prefix, lowercases; null unless it matches `^[a-z0-9._]{1,30}$`.
  - `type CompetitorPostIn = { shortcode: string; url: string; username: string; posted_at: string; caption: string; views: number | null; likes: number | null; comments: number | null; duration_seconds: number | null; thumbnail_url: string | null }`
  - `mapApifyItems(items: unknown[], since: Map<string, Date>): CompetitorPostIn[]` — keeps an item only when `ownerUsername` (lowercased) is a key of `since`, `type === "Video"`, and `timestamp >= since.get(owner)`; maps `shortCode`, `url`, `timestamp`, `caption`, `videoPlayCount`, `likesCount`, `commentsCount`, `videoDuration`, `displayUrl`. Unknown shapes are skipped, never thrown.
  - `pullWindowDays(creators: { last_pulled_at: string | null }[]): number` — 90 if any is null, else 21.
  - `type CreatorMedian = { median: number | null; count: number; thin: boolean }`
  - `creatorMedians(posts: { creator_id: string; posted_at: string; views: number | null }[], now: Date): Map<string, CreatorMedian>`
  - `multipleOf(views: number | null, m: CreatorMedian | undefined): number | null` — null when either is null or the median is 0.
  - `isFresh(postedAt: string, day: string): boolean` — within 14 days before the Chicago `day` (inclusive).
  - `sharesCopiedRun(text: string, sources: string[], n = COPY_RUN_WORDS): boolean` — lowercase, strip punctuation, split on whitespace, true if any n-word run of `text` appears in any source.

- [ ] **Step 1: Write the failing tests**

```ts
it("drops collab items owned by another account and pinned items older than the window", () => {
  const since = new Map([["micro.investing", new Date("2026-10-11T00:00:00Z")]]);
  const items = [
    item({ ownerUsername: "micro.investing", shortCode: "A1", timestamp: "2026-10-20T12:00:00Z" }),
    item({ ownerUsername: "someone.else", shortCode: "B2", timestamp: "2026-10-20T12:00:00Z" }),
    item({ ownerUsername: "micro.investing", shortCode: "C3", timestamp: "2024-03-01T12:00:00Z" }),
    item({ ownerUsername: "micro.investing", shortCode: "D4", type: "Sidecar" }),
    { nonsense: true },
  ];
  expect(mapApifyItems(items, since).map((p) => p.shortcode)).toEqual(["A1"]);
});
it("maps videoPlayCount to views, not videoViewCount", () => {
  expect(mapApifyItems([item({ videoPlayCount: 1200, videoViewCount: 300 })], since)[0].views).toBe(1200);
});
it("a creator with no Reels in the window has a null median and no multiple", () => {
  const m = creatorMedians([], now);
  expect(m.get("c1")).toBeUndefined();
  expect(multipleOf(5000, m.get("c1"))).toBeNull();
  expect(multipleOf(5000, { median: 0, count: 3, thin: true })).toBeNull();
});
it("median over the last 90 days only; thin under 8", () => {
  const m = creatorMedians([...sevenPosts("c1", [100, 200, 300, 400, 500, 600, 700]), old("c1", 99999)], now).get("c1")!;
  expect(m).toEqual({ median: 400, count: 7, thin: true });
});
it("fresh is 14 days inclusive", () => {
  expect(isFresh("2026-10-18T15:00:00Z", "2026-11-01")).toBe(true);
  expect(isFresh("2026-10-17T15:00:00Z", "2026-11-01")).toBe(false);
});
it("flags a 6-word run copied from the caption, ignoring case and punctuation", () => {
  expect(sharesCopiedRun("Stop! You should max out your 401k now", ["you SHOULD max out your 401k, they say"])).toBe(true);
  expect(sharesCopiedRun("Maxing your 401k is slow money", ["you should max out your 401k"])).toBe(false);
});
it("normalizes usernames", () => {
  expect(normalizeUsername(" @Micro.Investing ")).toBe("micro.investing");
  expect(normalizeUsername("https://www.instagram.com/ericsfinancials/")).toBe("ericsfinancials");
  expect(normalizeUsername("bad name!")).toBeNull();
});
it("pulls 90 days when any creator is new, else 21", () => { /* pullWindowDays */ });
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/competitors.test.ts` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement** the exports above in `engine/competitors.ts`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): competitor engine: mapping, medians, popularity, copy check`

---

### Task 3: Experiments engine: the source variable and the competitor test

**Files:**
- Modify: `src/features/content/engine/experiments.ts`
- Test: `src/features/content/engine/experiments.test.ts`

**Interfaces:**
- Consumes: `LOW_CONFIDENCE` from `engine/tags.ts`.
- Produces:
  - `export const SOURCE_VALUES = ["own", "competitor-rebuttal", "competitor-take"] as const; export type SourceValue = (typeof SOURCE_VALUES)[number];`
  - `Counted = Exclude<Variable, "topic">` (now includes `source`); `COUNTED` appends `"source"`; `valuesOf("source")` returns `SOURCE_VALUES`.
  - `evidenceCounts(posts: (WinnerPost & { source?: SourceValue })[], scores, windowStart)` — a post's source tag is `p.source ?? "own"`.
  - `candidateTests` never returns a `source` test (filter it out with `topic`'s handling unchanged).
  - `export const NEW_FORMAT = "new-format";`
  - `type CompetitorTags = { hook_type: string; onscreen_text: string; cta_type: string; post_style: string; cover_face: boolean | null; cover_text: boolean | null; cover_number: boolean | null; tag_confidence: Record<string, number>; pushes_belief: string | null; format_note: string | null }`
  - `competitorTest(post: CompetitorTags, ev: Evidence, control: Control, live: LiveTest[]): Test` — the format-or-topic rule below.
  - `tagsFromRecipe` writes `post_style: ""` when `recipe.post_style === NEW_FORMAT`.
  - `tallyRows` includes a `source` row; it never lists `new-format`.

`competitorTest` rule, in order:
1. If `post.format_note` is non-null: `{ variable: "post_style", value: NEW_FORMAT, control: control.post_style }` (exempt from `live`).
2. For each variable in `HELD_STILL` order (`hook_type`, `onscreen_text`, `cta_type`, `post_style`, `cover`): the post's value (cover via `coverValue`; `post_style` ignores `carousel` and `image`); qualifies when it is non-empty, differs from `control[variable]`, its confidence (`tag_confidence[variable]`; for cover, the minimum of the three cover flags' confidences) is `>= LOW_CONFIDENCE`, its evidence row has `total < EXPLORE_BELOW`, and `${variable}:${value}` is not in `live`. First qualifier wins.
3. Else `{ variable: "source", value: post.pushes_belief ? "competitor-rebuttal" : "competitor-take", control: "own" }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("a post with a barely-tried confident post style seeds a format test", () => {
  const t = competitorTest(tags({ post_style: "text-broll", tag_confidence: { post_style: 0.9 } }), ev({ post_style: { "text-broll": 1 } }), control({ post_style: "talking-head" }), []);
  expect(t).toEqual({ variable: "post_style", value: "text-broll", control: "talking-head" });
});
it("format tags all below LOW_CONFIDENCE seed a topic test", () => {
  const t = competitorTest(tags({ post_style: "text-broll", hook_type: "paradox", tag_confidence: { post_style: 0.5, hook_type: 0.4 }, pushes_belief: "max out your 401k" }), ev({}), control({}), []);
  expect(t).toEqual({ variable: "source", value: "competitor-rebuttal", control: "own" });
});
it("a value already well tested (5+ posts) or held live does not qualify", () => { /* total 5 → topic; live post_style:text-broll → topic */ });
it("no pushed belief makes a take, not a rebuttal", () => { /* value "competitor-take" */ });
it("a format note seeds a new-format post style test even when one is live", () => {
  expect(competitorTest(tags({ format_note: "split screen, two speakers" }), ev({}), control({ post_style: "talking-head" }), [{ variable: "post_style", value: "new-format" }]))
    .toEqual({ variable: "post_style", value: "new-format", control: "talking-head" });
});
it("evidence counts source from the post, own by default; candidateTests never proposes source", () => {
  const e = evidenceCounts([post({ id: "a", source: "competitor-take" }), post({ id: "b" })], winsFor(["a", "b"]), start);
  expect(e.source.find((r) => r.value === "competitor-take")!.won).toBe(1);
  expect(e.source.find((r) => r.value === "own")!.won).toBe(1);
  expect(candidateTests(e, controlRecipe(e), []).some((t) => t.variable === "source")).toBe(false);
});
it("tagsFromRecipe leaves post_style blank for new-format", () => {
  expect(tagsFromRecipe({ post_style: "new-format", cover: "none" }, "hook", now).post_style).toBe("");
});
it("the tally has a Source row", () => { expect(tallyRows(e).map((r) => r.label)).toContain("Source"); });
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/experiments.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Adjust any exhaustive switch or `Record<Counted, …>` the widening breaks (`candidateTests`'s `controls` map gets `source: "own"`).
- [ ] **Step 4: Run** `pnpm vitest run src/features/content && pnpm typecheck` — Expected: PASS (existing slice 5 tests unchanged).
- [ ] **Step 5: Commit** `feat(content): source variable and the competitor format-or-topic rule`

---

### Task 4: Apify client

**Files:**
- Create: `src/features/content/data/pulls/apify.ts`, `src/features/content/data/pulls/apify.test.ts`

**Interfaces:**
- Consumes: `composioExecute` from `data/pulls/instagram.ts` (Composio path only); `COMPETITOR_RESULTS_LIMIT`, `COMPETITOR_WEEKLY_CAP_USD` from Task 2.
- Produces:

```ts
export type ApifyRunState = { status: "pending" | "ready" | "failed"; datasetId: string | null; costUsd: number | null; error: string };
export interface ApifyClient {
  startRun(a: { usernames: string[]; newerThanDays: number }): Promise<{ runId: string }>;
  getRun(runId: string): Promise<ApifyRunState>;
  datasetItems(datasetId: string): Promise<unknown[]>;
}
export function apifyInput(a: { usernames: string[]; newerThanDays: number }): Record<string, unknown>;
export function apifyClientFromEnv(env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): ApifyClient; // throws a named Error when its credentials are missing
```

- [ ] **Step 1: Recon (the spec's open question).** Run `composio execute APIFY_SCRAPE_INSTAGRAM_POSTS --get-schema`, then search for an async run tool and a run-status tool (`composio search "apify run actor"`, `composio search "apify get run"`). Record in a comment at the top of `apify.ts` which slugs were found and the date, as `instagram.ts` does. If Composio can start a run without waiting and read its status, implement over `composioExecute` with env `COMPOSIO_APIFY_CONNECTION_ID`. Otherwise implement over Apify's REST API with env `APIFY_TOKEN`: `POST https://api.apify.com/v2/acts/<actor>/runs` (actor id taken from the Composio schema or the spike's run), `GET /v2/actor-runs/<id>`, `GET /v2/datasets/<id>/items?clean=true`, token in an `Authorization: Bearer` header. Ledger the choice as a Ruling.
- [ ] **Step 2: Write the failing tests** against a fake `fetch`:

```ts
it("starts one run for all usernames with detailedData and the $1 cap", async () => {
  const input = apifyInput({ usernames: ["ericsfinancials", "micro.investing"], newerThanDays: 21 });
  expect(input).toMatchObject({ username: ["ericsfinancials", "micro.investing"], resultsLimit: 30, dataDetailLevel: "detailedData", maxTotalChargeUsd: 1 });
  expect(input.onlyPostsNewerThan).toBe("21 days");
});
it("maps run statuses: SUCCEEDED → ready, RUNNING/READY → pending, FAILED/ABORTED/TIMED-OUT → failed with the status as error", async () => { /* getRun over recorded bodies */ });
it("throws a clear error when credentials are missing", () => {
  expect(() => apifyClientFromEnv({} as NodeJS.ProcessEnv)).toThrow(/APIFY_TOKEN|COMPOSIO_APIFY_CONNECTION_ID/);
});
it("never sends the token in the URL", async () => { /* fake fetch records URLs; none contains the token */ });
```

(The `onlyPostsNewerThan` format follows the recon's schema; adjust the expected string to it and ledger it.)
- [ ] **Step 3: Run** `pnpm vitest run src/features/content/data/pulls/apify.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement**, with `AbortSignal.timeout(20000)` per request.
- [ ] **Step 5: Run** the same command — Expected: PASS.
- [ ] **Step 6: Commit** `feat(content): Apify client for the weekly competitor pull`

---

### Task 5: Competitor tagging (prompt, schema, image input)

**Files:**
- Create: `src/features/content/engine/competitor-tags.ts`, `src/features/content/engine/competitor-tags.test.ts`
- Modify: `src/features/content/data/claude.ts` (+ `claude.test.ts`)

**Interfaces:**
- Consumes: `HOOK_TYPES`, `ONSCREEN_TEXT`, `CTA_TYPES`, `POST_STYLES`, `MESSAGES` from `engine/tags.ts`; `CANON_MESSAGES` from `engine/recreate.ts`.
- Produces:
  - `GenerateInput` gains `image?: { url: string }`; `claudeToolCaller` sends it as `{ type: "image", source: { type: "url", url } }` before the text block.
  - `COMPETITOR_TAG_TOOL = "record_competitor_tags"`, `COMPETITOR_TAG_MODEL = "claude-sonnet-5-5"`.
  - `competitorTagSchema` (zod): `hook_type` (enum `HOOK_TYPES` or `""`), `onscreen_text` (enum or `""`), `cover_face`/`cover_text`/`cover_number` (boolean), `cta_type` (enum or `""`), `post_style` (enum of `POST_STYLES` minus `carousel`, `image`, or `""`), `message` (enum `MESSAGES` or `""`), `hook_text` (string, max 200), `tag_confidence` (record of the eight tag names to 0..1), `pushes_belief` (string max 120, or null), `format_note` (string max 160, or null). Refinement: `format_note` non-null requires `post_style === ""`.
  - `competitorTagToolSchema(): Record<string, unknown>` (JSON schema of the above), `competitorTagSystemPrompt(): string`, `renderCompetitorTagTurn(p: { username: string; caption: string; duration_seconds: number | null }): string`.
  - `type CompetitorTagsOut = z.infer<typeof competitorTagSchema>`.

The system prompt says: label from the cover image, caption and duration only; `pushes_belief` is the conventional money advice the post promotes in a few words (for example "max out your 401k"), null when it promotes none; `format_note` describes the format in one line only when no listed post style fits; confidence is honest and below 0.6 when the thumbnail cannot show it.

- [ ] **Step 1: Write the failing tests**

```ts
it("accepts a valid answer and rejects a format note beside a post style", () => {
  expect(competitorTagSchema.safeParse(valid()).success).toBe(true);
  expect(competitorTagSchema.safeParse({ ...valid(), post_style: "text-broll", format_note: "split screen" }).success).toBe(false);
});
it("the tool schema lists every hook type and excludes carousel and image styles", () => { /* inspect JSON schema enums */ });
it("the prompt names pushes_belief and format_note", () => { /* contains both */ });
it("claudeToolCaller sends an image block before the text when given an image", async () => { /* fake client records content */ });
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/competitor-tags.test.ts src/features/content/data/claude.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): competitor tagging prompt and image input`

---

### Task 6: Competitor flow and adapter (creators, pull, collect, tag)

**Files:**
- Create: `src/features/content/data/competitors.ts`, `competitors.test.ts`, `competitors.fake.ts` (in-memory `CompetitorsDb`), `supabase-competitors-db.ts`, `supabase-competitors-db.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5; `ToolCaller` from `data/claude.ts`; `chicagoIsoDate`.
- Produces:

```ts
export type CreatorRow = { id: string; username: string; status: "watching" | "removed"; last_pulled_at: string | null; last_pull_status: "ready" | "failed" | null };
export type CompetitorRunRow = { id: string; apify_run_id: string; status: "pending" | "ready" | "failed"; error: string; started_at: string; finished_at: string | null; cost_usd: number | null; items: number | null };
export type CompetitorPostRow = CompetitorPostIn & { id: string; creator_id: string; tagged_at: string | null; briefed_at: string | null } & CompetitorTagsColumns; // tag columns as in 0017
export interface CompetitorsDb {
  creators(): Promise<CreatorRow[]>;
  upsertCreator(username: string): Promise<void>;           // insert, or set status watching
  removeCreator(id: string): Promise<void>;
  setCreatorPull(ids: string[], at: string, status: "ready" | "failed"): Promise<void>;
  latestRun(): Promise<CompetitorRunRow | null>;
  pendingRuns(): Promise<CompetitorRunRow[]>;
  insertRun(apifyRunId: string, startedAt: string): Promise<string>;
  updateRun(id: string, patch: Partial<Omit<CompetitorRunRow, "id" | "apify_run_id" | "started_at">>): Promise<void>;
  upsertPosts(posts: (CompetitorPostIn & { creator_id: string })[], pulledAt: string): Promise<number>; // updates views/likes/comments/pulled_at on conflict
  postsForMedians(since: string): Promise<{ creator_id: string; posted_at: string; views: number | null }[]>;
  untaggedRecent(since: string): Promise<CompetitorPostRow[]>; // watching creators only
  saveTags(postId: string, tags: CompetitorTagsOut, at: string): Promise<void>;
  creatorsPage(now: Date): Promise<CreatorsPage>;
}
export type CreatorsPage = { creators: (CreatorRow & CreatorMedian & { popular: { id: string; url: string; posted_at: string; multiple: number; briefed: boolean }[] })[]; lastRun: CompetitorRunRow | null };

export async function addCreator(db: CompetitorsDb, raw: string): Promise<{ error: string | null }>;   // normalizeUsername, "That isn't an Instagram username."
export async function startWeeklyPull(db: CompetitorsDb, apify: ApifyClient, now: Date, force: boolean): Promise<{ started: boolean; error: string | null }>;
export async function collectRuns(db: CompetitorsDb, apify: ApifyClient, now: Date): Promise<{ stored: number; failed: number }>;
export async function tagPopular(db: CompetitorsDb, caller: ToolCaller, now: Date, timeLeft: () => number): Promise<{ tagged: number }>;
```

Rules: `startWeeklyPull` starts only when `force`, or the Chicago weekday is Monday and `latestRun()` started more than 6 days ago or is null; never with zero watching creators; never while a run is pending. `collectRuns`: per pending run, `getRun`; `ready` → read items, `mapApifyItems` with each watched creator's window (`last_pulled_at` null → 90 days, else 21), upsert, `setCreatorPull(..., "ready")`, run ready with `items` and `cost_usd`; `failed` → run failed with the error, creators `failed`; still pending and older than 48 hours → failed with "timed out". Errors from one run never stop the others. `tagPopular`: candidates are untagged posts within 14 days whose `multipleOf` against `creatorMedians(postsForMedians(90 days ago))` is `>= VIRAL_FROM`; at most 5 per call; stops when `timeLeft()` is under `TODAY_MIN_SECONDS + 45`; one call each with `image: { url: thumbnail_url }` and `model: COMPETITOR_TAG_MODEL`; an invalid answer leaves the post untagged and moves on.

- [ ] **Step 1: Write the failing flow tests** (against `competitors.fake.ts`)

```ts
it("Monday starts one run for all watching creators; Tuesday does not; force does", async () => { /* fake apify records startRun calls: usernames, newerThanDays 90 then 21 */ });
it("removed creators are not pulled and their posts are never tag candidates", async () => {});
it("a finished run stores only the creator's own Reels and marks creators ready", async () => {});
it("a failed run is recorded with its error and marks creators failed", async () => {});
it("a run pending for more than 48 hours is marked failed 'timed out'", async () => {});
it("one run throwing does not stop the next", async () => {});
it("tags only popular fresh posts, at most 5, and stops when time runs short", async () => {});
it("an invalid tag answer leaves the post untagged", async () => {});
it("addCreator normalizes and re-watches a removed creator", async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/competitors.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement the flow.**
- [ ] **Step 4: Write the adapter test** (style of `supabase-today-db.test.ts`): every query on the three tables carries `user_id`; `untaggedRecent` joins only `watching` creators; `upsertPosts` uses `onConflict: "user_id,shortcode"` and updates counts.
- [ ] **Step 5: Implement `supabaseCompetitorsDb(client, userId): CompetitorsDb`.**
- [ ] **Step 6: Run** `pnpm vitest run src/features/content/data && pnpm typecheck` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(content): competitor creators, weekly pull, collection and tagging`

---

### Task 7: The cron runs the competitor step

**Files:**
- Create: `src/features/content/data/competitor-cron.ts`, `competitor-cron.test.ts`
- Modify: `src/app/api/content/cron/metrics/route.ts`

**Interfaces:**
- Consumes: Task 6 flow; `anthropicToolCaller`; `apifyClientFromEnv`.
- Produces: `runCompetitorCron(a: { db: CompetitorsDb; apifyFor: () => ApifyClient; callerFor: (timeoutMs: number) => ToolCaller; now: Date; force: boolean; timeLeft: () => number }): Promise<CompetitorCronReport>` with `CompetitorCronReport = { started: boolean; stored: number; failed: number; tagged: number; error: string | null }`. Order: `collectRuns`, `startWeeklyPull`, `tagPopular`. It never throws: a missing Apify credential or any error becomes `error`.

Route: after `runMetricsCron` and before `runTodayCron`, in its own try/catch, call `runCompetitorCron` with `force` from `?competitors=now`, and `timeLeft` measured from `startedAt` against 280 seconds. Skip it when `?platform=` is set unless `?competitors=now` is also set. Append `competitors` to the JSON.

- [ ] **Step 1: Write the failing tests**

```ts
it("collects before starting, then tags", async () => { /* call order */ });
it("missing Apify credentials report an error and do not throw", async () => {});
it("passes force through", async () => {});
```

and in `wiring.test.ts`: the route source contains `runCompetitorCron(` before `runTodayCron(`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/competitor-cron.test.ts src/features/content/wiring.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): metrics cron pulls, collects and tags competitor posts`

---

### Task 8: Today makes the competitor brief

**Files:**
- Modify: `src/features/content/data/today.ts`, `today.fake.ts`, `today.test.ts`, `supabase-today-db.ts`, `supabase-today-db.test.ts`, `src/features/content/engine/today-brief.ts`, `today-brief.test.ts`

**Interfaces:**
- Consumes: `competitorTest`, `NEW_FORMAT`, `SourceValue` (Task 3); `sharesCopiedRun`, `creatorMedians`, `multipleOf`, `isFresh` (Task 2).
- Produces:
  - `ExperimentRow.kind` adds `"competitor"`; `ExperimentRow.competitor_post_id: string | null`; `ExperimentPatch` adds `idea_id`, `kind`, `competitor_post_id`.
  - `type CompetitorCandidate = { post: CompetitorPostRow; username: string; multiple: number; thin: boolean }`.
  - `TodayDb` adds: `competitorCandidate(day: string, now: Date): Promise<CompetitorCandidate | null>` (watching creators, tagged, `briefed_at` null, fresh, multiple `>= VIRAL_FROM`, highest multiple); `markCompetitorBriefed(postId: string, at: string): Promise<void>`; `insertCompetitorSource(c: CompetitorCandidate, angle: SourceValue): Promise<string>` (kind `competitor`, external id shortcode, url, title caption first 120 chars, status `mined`, `meta.angle`).
  - `TodayDb.evidence` sets each post's `source` from its idea's source row: kind `competitor` → `meta.angle`, else `own`.
  - `BriefSlotInput` gains `competitor?: { username: string; caption: string; hookText: string; pushesBelief: string | null; formatNote: string | null }`; `renderBriefTurn` prints it (caption quoted, labelled "Their post (do not reuse its wording)"); the topic-test line reads "The test: their topic, answered with Miguel's rebuttal" or "…with Miguel's own take"; a format test says the value comes from @username. `BRIEF_RULES` gains the three competitor rules from spec Decision 7 verbatim in substance.
  - `competitorReason(c: CompetitorCandidate, test: Test): string` in `today-brief.ts`, e.g. `From @micro.investing: 3.4× their typical views. Pushes "max out your 401k".` plus ` Thin baseline.` when thin.

`runDaily` change: before `pickDay`, if slot 2 is missing, ask `competitorCandidate`. With one: `test = competitorTest(post, ev, control, liveTests)`. Format test → claim an Inbox idea for it; topic test → no idea yet. Then `pickDay` for the remaining missing slots with `heldVariables` plus the competitor test's variable and with the competitor's claimed idea removed from `ideaIds`. One Claude call covers both slots as today. After the answer, run `sharesCopiedRun(hook + " " + say.join(" "), [caption, hook_text])` on the competitor brief; if it copies, call Claude once more for that slot alone; if it copies again, `markCompetitorBriefed` anyway and fill slot 2 as a normal proposed brief in that same run (one extra Claude call). Topic brief writes: `insertCompetitorSource` then `insertMomentIdea(momentIdea(...))` (status queued), experiment `kind: "competitor"`, `variable: "source"`. Every competitor brief sets `competitor_post_id` and calls `markCompetitorBriefed`. The moment slot (`runMoment`) and refills already avoid live variables; no change.

`runSwap` change for `kind === "competitor"`: patch `kind: "proposed"`, `competitor_post_id: null`. If `variable === "source"`: claim one `unclaimedInboxIdeas(1)` (fail "Inbox is empty" if none), `returnToInbox(old.idea_id)`, and patch `idea_id` to the claimed one together with the new test. Format briefs follow the slice 5 path.

- [ ] **Step 1: Write the failing tests** (in `today.test.ts`, with `today.fake.ts` extended)

```ts
it("a fresh popular competitor post takes slot 2; slot 1 avoids its variable", async () => {});
it("a topic brief creates a competitor-sourced idea and a source experiment", async () => {});
it("a format brief claims an Inbox idea and tests the competitor's value", async () => {});
it("no candidate: the day is exactly slice 5 (two proposed briefs)", async () => {});
it("a post never seeds a second brief", async () => {});
it("a copied brief is regenerated once; copied twice, slot 2 is a normal proposed brief and the post is used", async () => {});
it("swapping a topic brief claims a fresh Inbox idea, returns the competitor idea and clears the competitor link", async () => {});
it("swapping a format brief keeps the idea and clears the competitor link", async () => {});
```

In `today-brief.test.ts`: the turn quotes the caption under the do-not-reuse label; `competitorReason` wording including "Thin baseline."; the system prompt contains the never-reuse rule. In `supabase-today-db.test.ts`: `competitorCandidate` filters `user_id`, watching creators and `briefed_at is null`; `evidence` marks a post whose idea has a `competitor` source with `meta.angle`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/today.test.ts src/features/content/engine/today-brief.test.ts src/features/content/data/supabase-today-db.test.ts` — Expected: FAIL (new cases only; existing cases pass).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/features/content && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): Today makes one competitor brief a day`

---

### Task 9: UI: the brief card and the Creators page

**Files:**
- Modify: `src/features/content/ui/BriefCard.tsx` (+ `BriefCard.test.tsx`), `ui/ContentTabs.tsx`, `ui/VerdictsList.tsx` (+ test), `data/supabase-today-db.ts` (`page()` loads the competitor post per brief), `data/today.ts` (`BriefView.competitor`), `src/features/content/wiring.test.ts`
- Create: `src/app/(app)/content/creators/page.tsx`, `src/features/content/data/competitor-actions.ts`, `src/features/content/ui/CreatorsTable.tsx` (+ test), `ui/AddCreatorForm.tsx`

**Interfaces:**
- Consumes: `CreatorsPage`, `addCreator`, `removeCreator` (Task 6); `competitorReason` (Task 8).
- Produces: `BriefView.competitor: { username: string; url: string; multiple: number; thin: boolean; pushes_belief: string | null; format_note: string | null } | null`; Server Actions `addCreatorAction(fd: FormData): Promise<{ error: string | null }>` and `removeCreatorAction(fd: FormData): Promise<{ error: string | null }>` in `competitor-actions.ts`, each opening with `requireContentOwner()` and calling `revalidatePath("/content/creators")`.

Exact copy:
- Card line: `Inspired by @{username}, {multiple.toFixed(1)}× their typical views` linking `url` (new tab), then `Pushes: {pushes_belief}` / `New format: {format_note}` / `Thin baseline` when present.
- `testInWords`: source → `Source: rebuttal of a competitor post instead of your own topic` or `Source: a competitor's topic with your take instead of your own topic`; new format → `Post style: new format from @{username} instead of {control}`.
- Tab `Creators` after `Performance`.
- Creators page: heading "Creators"; form "Add an Instagram creator" with input placeholder `@username`; table columns Creator, Median views, Reels (90 days), Last pull, Popular posts; a removed creator shows "Removed" and an "Add back" button; empty state "No creators yet. Add one to start the weekly pull."; last run line "Last pull: {date}, {items} posts, ${cost}" or "Last pull failed: {error}".

- [ ] **Step 1: Write the failing tests**: `BriefCard.test.tsx` renders the inspired line, the link, "Pushes:" and the source wording; `CreatorsTable.test.tsx` renders a watching and a removed row and the empty state; `VerdictsList` shows the format note for a new-format verdict; `wiring.test.ts` lists `src/app/(app)/content/creators/page.tsx` and `src/features/content/data/competitor-actions.ts` in the owner and no-query lists.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/ui src/features/content/wiring.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** The page reads through `supabaseCompetitorsDb(supabase, user.id).creatorsPage(now)`.
- [ ] **Step 4: Run** `pnpm vitest run src/features/content && pnpm typecheck && pnpm build` — Expected: PASS; build lists `/content/creators`.
- [ ] **Step 5: Commit** `feat(content): competitor line on briefs and the Creators page`

---

### Task 10: Docs

**Files:**
- Modify: `src/features/content/CLAUDE.md` (map entries for the new files; invariants: one Apify run a week capped at $1, results read from the dataset and filtered by owner and date, a competitor post seeds at most one brief, slot 2 only, swap clears the competitor link, copy check at 6 words, `new-format` never written to `content_posts`), its touchpoints list (`0016`, `0017`, env `COMPOSIO_APIFY_CONNECTION_ID` or `APIFY_TOKEN`), `docs/PRODUCT-STATUS.md` (migrations through 0017, the new env var), `docs/superpowers/specs/2026-10-13-content-engine-instagram-intelligence-roadmap.md` (row 6: built, spec link, migration 0017 pending), the spec's status line.

- [ ] **Step 1: Edit the docs.**
- [ ] **Step 2: Run** `pnpm test && pnpm typecheck && pnpm build` — Expected: all green.
- [ ] **Step 3: Commit** `docs(content): slice 6 documented`
