# Content engine brand gate: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every idea the content engine produces is checked against the brand standard, and rewritten
once if it fails, before Miguel sees it. Ideas that still fail are listed on Performance. Today's
`message` variable becomes the five personal pillars.

**Architecture:** A pure `engine/brand.ts` holds the standard, the prompt and the schemas. A small flow,
`data/brand-gate.ts`, runs one check-and-rewrite call plus one re-check over `ToolCaller`. New ideas
are inserted with a new status, `gating`. Every existing list filters on `inbox` or `queued`, so they
stay hidden until a sweep moves them to `inbox` or `gate_failed`. Today, Sharpen, Recreate and drafts
call the gate inline. A backfill and a ClickUp digest ride the daily metrics cron.

**Tech stack:** Next.js 14 App Router, Supabase (Postgres plus RLS, admin client in cron and
background jobs), `@anthropic-ai/sdk` through `data/claude.ts` (`ToolCaller`, `CLAUDE_MODEL`), Vitest,
zod.

**Spec:** `docs/superpowers/specs/2026-11-10-content-engine-brand-gate-design.md`. Read it first.
`src/features/content/CLAUDE.md` holds the feature's map and invariants.

## Global constraints

- Everything the engine produces is **Amplifica**: the personal-brand test in full, then the Amplifica layer.
- Personal pillars, stored as slugs and shown by name:
  `freedom-paradox` "The Freedom Paradox",
  `expensive-tuition` "Expensive Tuition",
  `physics-of-wealth` "The Physics of Wealth",
  `w2-advantage` "The W-2 Advantage",
  `life-by-design` "Life by Design".
- Amplifica pillars, by slug: `amplifica-the-brand`, `the-numbers`, `investment-strategies`, `living-in-the-margin`.
- Readers: `daniel`, `stephen`. Neither is a fail.
- Retired words fail the piece: "waiting room", "the floor", "the loop", "velocity banking". Also the
  saver-ICP phrases "steady savers" and "$1,000-$2,000 monthly".
- An idea never reaches `inbox` or `queued` unchecked. A gate error leaves it `gating`.
- Owner-only, with every admin-client query filtered by the owner id. Ingest stays all-or-nothing, and
  the ingest zod contract (`engine/schema.ts`) is unchanged. `known_titles` still covers every status.
  New GET routes export `fetchCache = "force-no-store"`.
- The rules in code say that `~/.claude/skills/brand-writing/SKILL.md` is the source, and that a change
  to one is copied into the other by hand.
- No engine math is touched. Build in a git worktree. No merge, push, migration apply or deploy
  without Miguel's go-ahead.
- `git add` explicit paths only.

## Review focus

1. **The gate errors** (API down, timeout, invalid tool output) during the sweep or a background run.
   The idea stays `gating` with `gate_attempts` incremented, and never becomes `inbox`. Test in Task 4.
2. **A rewrite invents a figure** that isn't among the verified founder figures. That is a fail, not a
   pass. Pinned by the prompt in Task 1 and by Task 2's test that a second-pass `fail` is final.
3. **A found-content ingest** (url or upload sources only) posts no ClickUp digest. A routine batch
   that mixes in found ideas lists only the routine's ideas. Test in Task 5.
4. **Locked post tags with an old canon `message`** (for example `velocity`) still render in
   TagEditor and TagChips. The tally and winners skip them, and nothing throws. Test in Task 6.
5. **A Today brief whose own pillar differs from the gate's pillar** is treated as a fail, and the
   slot falls back. Test in Task 8.

---

### Task 1: The brand standard (`engine/brand.ts`)

**Files:**
- Create: `src/features/content/engine/brand.ts`, `src/features/content/engine/brand.test.ts`

**Interfaces (produces):**
- `PILLARS: readonly { slug: PillarSlug; name: string; question: string }[]`, and
  `PILLAR_SLUGS`, `type PillarSlug`, `pillarName(slug: string): string` (an unknown slug returns
  itself).
- `AMPLIFICA_PILLARS`, `type AmplificaPillar`, `READERS` (`["daniel","stephen"]`), `type Reader`.
- `GATE_ITEMS`, the checkable items with a plain label each: `reader`, `situation`, `respect`,
  `why-before-how`, `downside`, `plain-terms`, `voice`, `pillar`, `guardrails`, `amplifica-layer`,
  `retired-words`.
- `VERIFIED_FIGURES: string[]`, moved verbatim from `CONTENT_POSITIONING` in
  `engine/prompts/ideas.ts` together with their qualifiers.
- `retiredWordHits(text: string): string[]`, a case-insensitive match against the retired list.
- `type GateFields = Record<string, string | string[]>`, the text fields of a piece, such as
  `{ title, hook, outline }`.
- `type GateResult = { verdict: "pass" | "fail"; reader: Reader | null; pillar: PillarSlug | null;
  amplifica_pillar: AmplificaPillar | null; failed: { item: GateItem; reason: string }[] }`.
- `gateSystemPrompt(): string`. This is the standard: the readers' profiles, the six-line test, the
  five voice pairs, the pillars with their questions, the guardrails, the Amplifica layer (the we
  say / we don't say table and the "we will not" list), the retired words, `VERIFIED_FIGURES` as the
  only real numbers allowed, and the short-card rule ("downside on the page" may live in the outline).
  The header comment names the skill as its source.
- `renderGateTurn(a: { format: string; fields: GateFields; rewrite: boolean }): string`.
- `gateToolSchema(keys: string[], rewrite: boolean)` and
  `gateOutputSchema(keys: string[], rewrite: boolean)` (zod). The output is a `GateResult` plus
  `rewrite?: GateFields`, using the same keys and types as the input. `rewrite` is required when
  `rewrite && verdict === "fail"`.
- `GATE_TOOL_NAME = "record_brand_check"`.
- `pillarBalance(rows: { pillar: string; at: string }[], now: Date): Record<PillarSlug, number>`
  counts the current America/Chicago week, Monday first, the engine's weekday convention.

- [ ] **Step 1: Write the failing tests** in `brand.test.ts`:
  - `PILLAR_SLUGS` equals the five slugs in order, and `pillarName("w2-advantage") === "The W-2 Advantage"`.
  - `retiredWordHits("Get out of the waiting room with velocity banking")` returns both phrases.
    `retiredWordHits("A plain sentence")` returns `[]`.
  - `gateSystemPrompt()` contains "Daniel", "Stephen", every pillar name, every Amplifica pillar name,
    "investing capacity", "optionality", each verified figure, and the skill path.
  - `gateOutputSchema(["title","hook","outline"], true)` rejects
    `{ verdict: "fail", failed: [...], ... }` with no `rewrite`, accepts it with a full `rewrite`, and
    rejects a `rewrite` missing `outline`.
  - `pillarBalance` counts only rows inside the current Chicago week. Use a Sunday 23:30 Chicago row
    against a Monday `now`.
- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/features/content/engine/brand.test.ts`
- [ ] **Step 3: Implement `brand.ts`** to the interfaces above, modelled on `engine/sharpen.ts`.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit.** `git add src/features/content/engine/brand.ts src/features/content/engine/brand.test.ts`

### Task 2: The gate flow (`data/brand-gate.ts`)

**Files:**
- Create: `src/features/content/data/brand-gate.ts`, `src/features/content/data/brand-gate.test.ts`

**Interfaces:**
- Consumes: Task 1, and `ToolCaller` from `data/claude.ts`.
- Produces:
  - `type GateOutcome =
    | { status: "passed"; fields: GateFields; rewritten: boolean; result: GateResult; original: GateFields }
    | { status: "failed"; result: GateResult; original: GateFields }
    | { status: "error"; error: string }`
  - `gatePiece(caller: ToolCaller, piece: { format: string; fields: GateFields }, opts: { rewrite: boolean }): Promise<GateOutcome>`

**Flow:** call 1 checks, and when `opts.rewrite` is set it also rewrites on a fail. Then
`retiredWordHits` runs over the joined fields. A hit forces `fail` and adds a `retired-words` item.
- A pass with no hits returns `passed` with `rewritten: false`.
- A fail without `rewrite` returns `failed`.
- A fail with `rewrite` sends call 2, a check only, on the rewritten fields. A pass there returns
  `passed` with `rewritten: true`. Any fail there returns `failed` with the call-2 result.
- A throw or a schema-invalid response, on either call, returns `error`.
- Use `maxTokens: 4000` and the default model.

- [ ] **Step 1: Write the failing tests** with a scripted fake `ToolCaller` that returns queued responses:
  - A pass on call 1 makes 1 call and returns `passed` with `rewritten: false`.
  - A fail with a rewrite, then a pass, makes 2 calls and returns `passed` with `rewritten: true`, the
    rewritten fields and the original preserved.
  - A fail with a rewrite, then a fail, returns `failed` with the call-2 reasons.
  - `rewrite: false` with a fail makes 1 call and returns `failed`.
  - A model pass whose hook contains "velocity banking" returns `failed` with a `retired-words` item.
  - The caller throwing, or returning `{}`, gives `error`, on call 1 and on call 2.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `gatePiece`.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit.**

### Task 3: Migration and types

**Files:**
- Create: `supabase/migrations/0019_content_brand_gate.sql`, `supabase/migrations/0019_content_brand_gate.test.ts`
  (follow the pattern of `0018_content_taste_sharpen.test.ts`)
- Modify: `src/shared/supabase/database.types.ts`, and `IDEA_STATUSES` in `src/features/content/engine/types.ts`

**Interfaces (produces):** on `content_ideas`:
- `status` check extended with `'gating'` and `'gate_failed'`.
- `gate jsonb`. Null means never checked, which is pre-gate legacy. When set it holds
  `{ result: GateResult, rewritten: boolean, checked_at: string, prior_status?: string }`.
- `gate_original jsonb` (null unless a rewrite was applied).
- `gate_attempts integer not null default 0`.
- `ingest_batch uuid` (null for anything that isn't ingest).
- `digest_posted_at timestamptz`.
- Partial index `(user_id, created_at) where status = 'gating'`.

On `content_posts`, the `message` check is replaced so it allows `''`, `'none'`, the eight old canon
values (history and locked tags) and the five pillar slugs.

- [ ] **Step 1: Write the migration test.** It asserts the SQL adds both statuses, all five columns,
  the index, and a `message` check containing every pillar slug and still containing `'velocity'`.
- [ ] **Step 2: Run it and see it fail. Write the SQL. Run it and see it pass.**
- [ ] **Step 3: Update the types.** Add the columns to `database.types.ts`, and append `"gating"` and
  `"gate_failed"` to `IDEA_STATUSES`. Run `npx tsc --noEmit -p .`. Fix every exhaustive switch or
  record over statuses (status badges, `actions.ts` transitions). A `gating` idea allows no action;
  a `gate_failed` idea allows only Archive.
- [ ] **Step 4: Run the full suite and commit.** The migration is **not applied**; that waits for Miguel.

### Task 4: Ingest holds ideas and the sweep releases them

**Files:**
- Create: `src/features/content/data/gate-sweep.ts`, `gate-sweep.test.ts`,
  `src/features/content/data/supabase-gate-db.ts`, `src/features/content/data/gate.fake.ts`
- Modify: `data/ingest.ts` (insert as `gating` with `ingest_batch`), `src/app/api/content/ingest/route.ts`
  and `data/found.ts` (start a background sweep with `waitUntil` after the response),
  `src/app/api/content/cron/metrics/route.ts` (sweep before the competitor step), `data/ingest.test.ts`

**Interfaces:**
- Consumes: `gatePiece` from Task 2.
- Produces:
  - `interface GateDb { gatingIdeas(limit: number): Promise<GatingIdea[]>; applyPass(id: string, o: Extract<GateOutcome, {status:"passed"}>): Promise<void>; applyFail(id: string, o: Extract<GateOutcome, {status:"failed"}>): Promise<void>; bumpAttempt(id: string, error: string): Promise<void> }`
  - `type GatingIdea = { id: string; format: string; title: string; hook: string; belief_attacked: string; value_to_listener: string; why_it_stops: string; outline: string[] }`
  - `runGateSweep(db: GateDb, caller: ToolCaller, a: { limit: number; timeLeft: () => number }): Promise<{ passed: number; failed: number; errors: number }>`
  - `ingestPayload(db, payload, userId, opts?: { batch?: string })`. Rows are always `status: "gating"`,
    and `ingest_batch = opts.batch ?? null`.
- The gate fields for an idea are `title`, `hook`, `belief_attacked`, `value_to_listener`,
  `why_it_stops` and `outline`.
- `applyPass` writes the fields (the old hook goes to `hook_alt` when it changed), sets
  `pillar = result.pillar`, sets `gate` and `gate_original`, and sets `status = 'inbox'`. All of it is
  conditional on `status = 'gating'`.
- `applyFail` sets `gate` and `status = 'gate_failed'`.
- `bumpAttempt` increments `gate_attempts` and leaves the status alone.
- The sweep processes the oldest ideas first, one at a time, and stops when `timeLeft() < 120`.
- Cron limit: 20. Background limit after ingest: the batch's own ideas.

- [ ] **Step 1: Write the failing tests** (`gate-sweep.test.ts` with `gate.fake.ts` and a scripted caller):
  - A pass moves the idea to `inbox`, with the rewritten fields, `pillar` set and `gate` stored.
  - A fail moves it to `gate_failed`.
  - An error leaves it `gating` with `gate_attempts` 1. **(Review focus 1)**
  - The sweep stops when `timeLeft` drops under 120.
  - In `ingest.test.ts`: inserted rows carry `status: "gating"` and the batch id. The returned shape is
    unchanged.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Wiring.**
  - The ingest route creates `batch = crypto.randomUUID()`, passes it in, and after the response does
    `waitUntil(runGateSweep(...))`.
  - The metrics cron calls the sweep with limit 20 before the competitor step, and its reply gains `gate`.
  - Add a `wiring.test.ts` assertion that the gate sweep runs before `runCompetitorCron`.
  - Check that `buildContext` still selects every status, so `known_titles` includes `gating` and `gate_failed`.
- [ ] **Step 4: Run the full suite, typecheck, and commit.**

### Task 5: ClickUp digest of passed ideas

**Files:**
- Create: `src/features/content/data/gate-digest.ts`, `gate-digest.test.ts`
- Modify: `data/supabase-gate-db.ts` (digest reads and writes), the metrics cron route (digest after
  the sweep), and `routines/content-daily.md` step 7 (drop the idea lines; keep the date, recordings
  read, pending sources, sources read and the failure message; add a line saying the app posts the
  ideas that passed)
- Env: `CLICKUP_WORKSPACE_ID`. Add it to `features/content/CLAUDE.md` touchpoints and to
  `docs/PRODUCT-STATUS.md`. Channel constant: `DIGEST_CHANNEL = "7-9011777568-8"`.

**Interfaces:**
- `renderDigest(a: { date: string; passed: { format: string; hook: string; id: string }[]; failed: number; siteUrl: string }): string`.
  The first line is `**Content ideas for <date>**: <n> passed the brand gate`. Then one numbered line
  per passed idea, `[<FORMAT_LABEL>] <hook>: <site>/content/ideas/<id>`, and when `failed > 0` the
  line `<k> didn't pass: <site>/content/performance`.
- `postDigests(db: DigestDb, post: (markdown: string) => Promise<void>, now: Date): Promise<number>`.
  It handles batches where no idea is `gating` and `digest_posted_at` is null. The ideas counted are
  only those whose source kind is not `url` or `upload`, and a batch with none is marked posted
  without posting. **(Review focus 3)** On a successful post it stamps `digest_posted_at` on the
  batch's rows. A failed post stays unstamped, so the next cron retries.
- `clickUpChatPoster(env): (markdown) => Promise<void>` posts to ClickUp API v3
  `POST /api/v3/workspaces/{CLICKUP_WORKSPACE_ID}/chat/channels/{DIGEST_CHANNEL}/messages` with
  `{ type: "message", content_format: "text/md", content }`, using the existing ClickUp token.

- [ ] **Step 1: Write the failing tests:**
  - `renderDigest` gives the exact text for 2 passed and 1 failed, and for 0 failed (no failed line).
  - `postDigests` skips a batch that still has a `gating` idea.
  - It posts once per settled batch and stamps it.
  - A url-only batch is stamped and not posted.
  - A thrown post leaves the batch unstamped.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass.**
- [ ] **Step 3: Edit the routine's step 7.** Then make one manual call to the ClickUp endpoint with a
  test message, to confirm `CLICKUP_WORKSPACE_ID`. Ask Miguel before posting.
- [ ] **Step 4: Commit.**

### Task 6: `message` becomes the personal pillar

**Files:**
- Modify: `engine/tags.ts` (`MESSAGES` becomes `[...PILLAR_SLUGS, "none"]`; add
  `LEGACY_MESSAGES` = the old seven), `engine/experiments.ts`, `engine/winners.ts`, `ui/TagEditor.tsx`,
  `ui/TagFilters.tsx`, `ui/TagChips.tsx`, `ui/BriefCard.tsx`, `ui/RecreateControls.tsx`,
  `data/tag-form.ts`, `engine/competitor-tags.ts`, `engine/recreate.ts` (replace `CANON_MESSAGES` with
  pillar questions from `PILLARS`), `routines/content-tag.md` (the message is the pillar), and their tests.

**Behaviour:**
- Labels everywhere come from `pillarName`. A legacy value shows its raw text, marked "(old)".
- `experiments.ts` evidence, the tally and `winners.ts` count only `MESSAGES` values. Legacy values
  are skipped as unclassified.
- Any zod schema that validated `message` against `MESSAGES` for reading stored rows accepts
  `MESSAGES` plus `LEGACY_MESSAGES` (and `""`). Writes accept only `MESSAGES`.

- [ ] **Step 1: Write the failing tests:**
  - TagEditor renders a post whose `message` is `"velocity"`, showing "velocity (old)", without throwing.
  - The tally given one `"velocity"` row and one `"w2-advantage"` row counts only the latter.
    **(Review focus 4)**
  - The competitor-tags and recreate schemas enumerate the pillar slugs.
  - The tag correction form rejects `"velocity"` on write.
- [ ] **Step 2: Run them and see them fail. Implement. Run the full suite and typecheck.**
- [ ] **Step 3: Write the retag SQL into the PR description, to be run after merge with Miguel's go-ahead:**
  `update content_posts set tagged_at = null where platform = 'instagram' and not ('message' = any(tag_locks));`
  Check the tag-locks column type in 0014 before finalizing it.
- [ ] **Step 4: Commit.**

### Task 7: Generation prompts speak the brand

**Files:**
- Modify: `engine/prompts/ideas.ts` (remove `CONTENT_POSITIONING`; keep the permission rules as
  their own block; name the two readers, the five pillars by slug and name, and the voice pairs; ask
  for `pillar` as a slug), `engine/sharpen.ts`, `engine/today-brief.ts` (a brief argues a pillar, and
  the `message` field's description is "the personal pillar this Reel serves"), `engine/recreate.ts`,
  `engine/prompts/draft.ts`, `routines/content-daily.md` step 5 (check hooks against the readers and
  pillars, not the positioning), and the tests that assert prompt contents (`ideas.test.ts`,
  `drafting.test.ts`, the sharpen, today-brief and recreate tests).
- Each prompt gets a short brand block, `brandBrief()`, exported from `brand.ts`: readers in one line
  each, the pillars, the voice pairs and "Amplifica layer applies". It does not carry the full gate
  standard. Where a prompt also lists approved taste rules, it adds this line: "If a taste rule
  conflicts with the brand, the brand wins."

- [ ] **Step 1: Write the failing assertions.** Each prompt contains "Daniel", "Stephen" and every
  pillar name, and none contains "steady savers", "Content positioning" or "canon message".
  `ideas.ts` still contains the permission rules ("never open denied or pending sources").
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 8: Today briefs are gated

**Files:**
- Modify: `data/today.ts` (`runDaily`, `runMoment`, `runSwap`; the competitor slot too), `data/today.test.ts`,
  `data/today-cron.ts` (the Today guard rises from 90 to 150 seconds)

**Behaviour:**
- After `briefOutputSchema` parses, each `BriefOut` goes through
  `gatePiece(caller, { format: "reel", fields: { title, hook, say } }, { rewrite: true })`.
- On `passed`, the rewritten fields replace the brief's. If `result.pillar !== brief.message`, treat
  it as failed. **(Review focus 5)**
- On `failed` or `error`, the slot gets no brief, exactly as a generation failure does today. The
  claimed idea is released untouched.
- `patchIdea` additionally writes `gate` (and `gate_original` when rewritten). The idea's `pillar`
  becomes `result.pillar`.

- [ ] **Step 1: Write the failing tests** (`today.fake.ts`, scripted caller):
  - A passing brief is saved with `gate` set.
  - A failing brief leaves its slot empty and its idea in `inbox`, unchanged.
  - A pillar mismatch is treated as failed.
  - A gate error is treated as failed for that slot only, and the other slots are still saved.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 9: Sharpen and Recreate options are gated

**Files:**
- Modify: `data/sharpen.ts` (`runSharpen`), `engine/sharpen.ts` (`SharpenOption` gains
  `gate?: GateResult`), `data/sharpen.test.ts`, `data/recreate.ts` (`runRecreation`, `pickOption`),
  `engine/recreate.ts`, `data/recreate.test.ts`, `data/supabase-sharpen-db.ts` and
  `data/supabase-recreate-db.ts` (pick writes `gate` and `pillar` onto the idea)

**Behaviour:**
- Each parsed option goes through `gatePiece(..., { rewrite: false })`. Options that pass are kept
  with `gate` attached. The rest are dropped.
- Zero kept means the run finishes `failed` with the error text exactly
  `None of the rewrites met the brand standard.` The Sharpen note is kept, since it is already stored
  at start.
- An `error` from the gate counts as dropped.
- A Recreate pick inserts the idea as `inbox` with `gate` and `pillar` from the option.

- [ ] **Step 1: Write the failing tests:**
  - 3 options, 1 passing: the row is `ready` with 1 option.
  - 0 passing: the row is `failed` with the exact text.
  - A picked Sharpen option writes `gate` and `pillar`.
  - A Recreate pick inserts with `gate`.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 10: Drafts are checked on post

**Files:**
- Modify: `data/drafts.ts` (`postDraft`, and `DraftsDb` gains `gateFail(ideaId: string, result: GateResult, final: boolean): Promise<number>`, which returns the attempts so far), `data/supabase-drafts-db.ts`, `data/drafts.test.ts`, `src/app/api/content/drafts/route.ts` (pass a caller), `.claude/skills/content-draft/SKILL.md` (on a 422 with `brand_gate`, fix the draft against the listed items, resubmit once, and tell Miguel if the second attempt fails)

**Behaviour:**
- Before `storeDraft`, run `gatePiece(caller, { format, fields: { title, hook, draft: humanized } }, { rewrite: false })`.
- On `passed`, store as today and add `gate` to the idea.
- On `failed` with fewer than 1 prior gate fail: return
  `422 { ok: false, error: "brand_gate", failed: result.failed }` and increment `gate_attempts`.
- On `failed` with 1 prior fail: return the same 422 with `final: true`, set the idea's status to
  `gate_failed` (`prior_status: "queued"`) and clear `queue_rank`. Nothing is stored.
- On `error`: return `503 { ok: false, error: "brand_gate_unavailable" }`. Nothing changes.

- [ ] **Step 1: Write the failing tests** for each of the four outcomes, with exact status codes and bodies.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 11: What Miguel sees

**Files:**
- Modify: `ui/IdeaCard.tsx` (a `Daniel · The W-2 Advantage` line from `gate.result`, in place of the
  raw pillar; legacy ideas with no `gate` show the raw pillar as today), the idea page under
  `src/app/(app)/content/ideas/[id]/` (the full check: each `GATE_ITEMS` label with ✓, the Amplifica
  pillar, and "Rewritten by the brand gate" with the original when `gate_original` is set),
  `data/queries.ts` (`loadGateFailed(userId)`: `gate_failed` ideas, newest first, limit 50),
  `src/app/(app)/content/performance/page.tsx` plus a new `ui/GateFailedList.tsx` ("Didn't pass the
  brand gate": title, format, source, failed items in plain words, and an Archive button), `data/actions.ts`
  (`archiveGateFailed(id)`, conditional on `status = 'gate_failed'`), and a one-line pillar balance on
  Performance from `pillarBalance`.

- [ ] **Step 1: Write the failing tests:**
  - IdeaCard shows "Stephen · Expensive Tuition" for a gated idea and the raw pillar for a legacy one.
  - GateFailedList renders reasons and an Archive button, and shows nothing when empty.
  - Archive changes only `gate_failed` rows.
  - `wiring.test.ts` still passes, so pages hold no queries.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 12: Backfill, dry run first

**Files:**
- Create: `src/features/content/data/gate-backfill.ts`, `gate-backfill.test.ts`
- Modify: `data/supabase-gate-db.ts`, and the metrics cron route (`?backfill=dry` or `?backfill=run`
  runs only the backfill and returns its report)

**Interfaces:**
- `runBackfill(db: BackfillDb, caller: ToolCaller, a: { dryRun: boolean; limit: number; timeLeft: () => number }): Promise<BackfillReport>`
- `type BackfillReport = { checked: number; passed: number; rewritten: number; failed: number; skipped: number; errors: number; samples: { id: string; title: string; outcome: string; reasons: string[] }[] }`
  holds up to 5 samples per outcome.
- Candidates are `inbox` and `queued` ideas with `gate is null`.
- Skipped (marked passed without a check, but **not** in a dry run): ideas with a draft, an
  `obsidian_path`, or an open or posted Today experiment.
- In a real run:
  - A pass applies the result. A queued idea keeps its rank and gets `refreshClickUpTask`.
  - A fail sets `gate_failed` with `prior_status` and clears `queue_rank`.
- A dry run writes nothing at all.
- Limit 25 per call.

- [ ] **Step 1: Write the failing tests:**
  - A dry run reports the counts and makes no `apply*` calls.
  - In a real run, a queued pass keeps its `queue_rank` and calls the ClickUp refresh.
  - A real fail clears the rank.
  - A drafted idea is skipped.
  - The limit is respected.
- [ ] **Step 2: Run them and see them fail. Implement. Run them and see them pass. Commit.**

### Task 13: Docs and the whole-branch check

**Files:**
- Modify: `src/features/content/CLAUDE.md` (map entries for `brand.ts`, `brand-gate.ts`, the sweep,
  digest and backfill; invariants: the gate statuses, "never unchecked", the digest rules, `message`
  being the pillar), `docs/superpowers/content-next-steps.md` (brand gate built; the weekly review is
  next and takes over the "Didn't pass" list), `~/.claude/skills/brand-writing/SKILL.md` (one line:
  the engine copy lives in `engine/brand.ts` and changes by hand alongside this skill)

- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Run the full suite, `npx tsc --noEmit -p .` and `npx next build`.** All three must be clean.
- [ ] **Step 3: Commit, then whole-branch review on the most capable model, then open the PR.**
  - The PR lists what waits for Miguel: applying migration 0019, setting `CLICKUP_WORKSPACE_ID` in
    Vercel, the retag SQL, and the backfill dry run (`?backfill=dry`), whose report he sees before
    `?backfill=run`.
  - Do not merge.
