# Content engine 4c: Sharpen and the taste loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Sharpen button turns an unfinished idea into three sharper rewrites; every note becomes evidence for rules Miguel approves on a Taste page, and approved rules reach the daily routine, Today's briefs and Sharpen.

**Architecture:** Pure engine modules (`engine/sharpen.ts`, `engine/taste.ts`) for prompts, schemas, the idea patch and the proposal merge; two flows over interfaces copied from Recreate's shape (`data/sharpen.ts` over `SharpenDb`, `data/taste.ts` over `TasteDb`) with in-memory fakes; Supabase adapters; Server Actions that run generation after the response with `waitUntil` through the admin client.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres, RLS), TypeScript, Vitest, zod, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-11-01-content-engine-taste-sharpen-design.md`

## Global Constraints

- Everything stays in `src/features/content` plus its routes; `src/boundaries.test.ts` stays green.
- Every content page and action opens with `requireContentOwner()`; pages hold no `supabase.from(`; `wiring.test.ts` lists the new page and action files.
- Background jobs use the admin client and every query filters `.eq("user_id", userId)`.
- Constants verbatim from the spec: chips `Hook too weak`, `Too vague`, `No numbers`, `No opinion`; free text up to 500 characters; 3 rewrites; outline 3 to 6 beats; sharpen daily cap 10 per Chicago day (every status counts); stale pending after 10 minutes; a proposal after 5 unused notes; at most 3 proposals per Chicago day.
- The four marks, verbatim: "a specific hook that challenges a belief, with a clear angle, clear numbers and an opinion".
- Rule statuses `proposed`, `active`, `off`, `rejected`; `active` boolean is true exactly when status is `active`. Proposed rules never reach a prompt.
- `engine/prompts/ideas.ts` and the ingest contract are not edited; the only routine change is one sentence in `routines/content-daily.md`.
- `git add` explicit paths only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use the session's model if it differs).

## Review Focus

1. A Pick on an idea that changed since the sharpen started (now drafted, posted, passed, or claimed by a Today brief) must not overwrite it; the sharpen is discarded with a reason. Test in Task 4.
2. A proposal returning a rule that repeats a rejected, off or active rule (different case or punctuation) must not create a new proposed rule. Test in Task 3.
3. A failed proposal must leave its notes unused so the next proposal reads them. Test in Task 5.
4. Migrating 0018 must keep the existing positioning rule active and visible to the context endpoint. Test in Task 1.
5. Double-clicking Pick must write the idea once. Test in Task 4.

---

### Task 1: Migration 0018 and the constants it mirrors

**Files:**
- Create: `supabase/migrations/0018_content_taste_sharpen.sql`, `supabase/migrations/0018_content_taste_sharpen.test.ts`, `src/features/content/engine/taste.ts` (constants only in this task)
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces:**
- Produces, in `engine/taste.ts`: `SHARPEN_CHIPS = ["Hook too weak", "Too vague", "No numbers", "No opinion"] as const`, `SHARPEN_STATUSES = ["pending", "ready", "failed", "picked", "discarded"] as const`, `RULE_STATUSES = ["proposed", "active", "off", "rejected"] as const`, `NOTE_SOURCES = ["sharpen", "pass"] as const`, `PROPOSAL_STATUSES = ["pending", "ready", "failed"] as const`, `PROPOSAL_KINDS = ["auto", "manual"] as const`, `SHARPEN_DAILY_CAP = 10`, `PROPOSE_AFTER_NOTES = 5`, `PROPOSALS_DAILY_CAP = 3`, `NOTE_TEXT_MAX = 500`, and their element types. Types for `content_taste_notes`, `content_sharpens`, `content_taste_proposals`; `content_taste_rules` gains `status`, `proposal_id`, `note_ids`.

- [ ] **Step 1: Write the failing migration test** (style of `0017_content_competitors.test.ts`)

```ts
it("check lists equal the engine constants", () => {
  expect(listFor(rulesAlter, "status")).toEqual([...RULE_STATUSES].sort());
  expect(listFor(notes, "source")).toEqual([...NOTE_SOURCES].sort());
  expect(listFor(sharpens, "status")).toEqual([...SHARPEN_STATUSES].sort());
  expect(listFor(proposals, "status")).toEqual([...PROPOSAL_STATUSES].sort());
  expect(listFor(proposals, "kind")).toEqual([...PROPOSAL_KINDS].sort());
});
it("backfills status from active before enforcing that they agree", () => {
  const backfill = sql.indexOf("update public.content_taste_rules set status");
  expect(backfill).toBeGreaterThan(-1);
  expect(sql).toMatch(/case when active then 'active' else 'off' end/);
  expect(sql.indexOf("check (active = (status = 'active'))")).toBeGreaterThan(backfill);
});
it("one live sharpen per idea; sharpens cascade with the idea; notes keep their text when the idea goes", () => {
  expect(sql).toMatch(/create unique index \w+ on public\.content_sharpens\s*\(idea_id\)\s*where status in \('pending', 'ready'\)/);
  expect(sharpens).toMatch(/idea_id uuid not null references public\.content_ideas\(id\) on delete cascade/);
  expect(notes).toMatch(/idea_id uuid references public\.content_ideas\(id\) on delete set null/);
});
it("rules gain note_ids and proposal_id", () => {
  expect(sql).toMatch(/add column note_ids uuid\[\] not null default '\{\}'/);
  expect(sql).toMatch(/add column proposal_id uuid/);
});
it("three new tables enable RLS with the four owner policies and the touch trigger", () => { /* counts 3 / >=15 / 3 */ });
```

- [ ] **Step 2: Run** `pnpm vitest run supabase/migrations/0018_content_taste_sharpen.test.ts` — Expected: FAIL (file missing).
- [ ] **Step 3: Write the migration** exactly as the spec's Data section, with this order for rules: add `status` nullable, backfill with `case when active then 'active' else 'off' end`, set not null and default `'active'`, add the status check, then `check (active = (status = 'active'))`, then `proposal_id` and `note_ids`. `content_sharpens` also has `chips text[] not null default '{}'` and `text text not null default ''` (Try again reuses them without a second note). Header: "Nothing to check first: three new tables; existing rules keep their active flag." Hand-write the types.
- [ ] **Step 4: Run** `pnpm vitest run supabase/migrations && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): migration 0018 for notes, sharpens, proposals and rule status`

---

### Task 2: Sharpen engine (prompt, schema, idea patch)

**Files:**
- Create: `src/features/content/engine/sharpen.ts`, `src/features/content/engine/sharpen.test.ts`

**Interfaces:**
- Consumes: `HOOK_TYPES` (`engine/tags.ts`), `CANON_MESSAGES` (`engine/recreate.ts`), `SHARPEN_CHIPS`.
- Produces:
  - `SHARP_MARKS = "a specific hook that challenges a belief, with a clear angle, clear numbers and an opinion"`.
  - `SHARPEN_TOOL_NAME = "record_rewrites"`.
  - `type SharpenOption = { title: string; hook: string; hook_type: HookType; belief_attacked: string; value_to_listener: string; why_it_stops: string; outline: string[]; what_changed: string }`.
  - `sharpenOutputSchema` (zod: `{ options: SharpenOption[] }` of length exactly 3; hook 1 to 140 characters; outline 3 to 6 non-empty strings; `what_changed` 1 to 160 characters).
  - `sharpenToolSchema(): Record<string, unknown>`, `sharpenSystemPrompt(rules: string[]): string`, `renderSharpenTurn(a: { idea: SharpenIdea; chips: string[]; text: string }): string` where `SharpenIdea = { title: string; hook: string; belief_attacked: string; value_to_listener: string; why_it_stops: string; outline: string[]; pillar: string; format: string }`.
  - `sharpenIdeaPatch(o: SharpenOption, oldHook: string)` returning `{ title, hook, hook_alt: oldHook, hook_type, belief_attacked, value_to_listener, why_it_stops, outline: { beat: string }[] }` — no status, score, format, pillar or rank.

- [ ] **Step 1: Write the failing tests**

```ts
it("accepts exactly three valid rewrites and rejects two, a 141-character hook and a 2-beat outline", () => {});
it("the system prompt states the four marks, keeps the topic, and lists the approved rules under their heading", () => {
  const p = sharpenSystemPrompt(["Open on the belief, never on a question."]);
  expect(p).toContain(SHARP_MARKS);
  expect(p).toContain("Keep the idea's topic and format");
  expect(p).toContain("Miguel's approved rules");
  expect(p).toContain("- Open on the belief, never on a question.");
  expect(sharpenSystemPrompt([])).not.toContain("Miguel's approved rules");
});
it("the turn carries the idea and what is off", () => {
  const t = renderSharpenTurn({ idea, chips: ["Hook too weak", "No numbers"], text: "too generic" });
  expect(t).toContain(idea.hook);
  expect(t).toContain("What is off: Hook too weak; No numbers");
  expect(t).toContain("Miguel adds: too generic");
});
it("the patch moves the old hook to hook_alt and touches nothing else", () => {
  expect(Object.keys(sharpenIdeaPatch(option, "old")).sort()).toEqual(["belief_attacked", "hook", "hook_alt", "hook_type", "outline", "title", "value_to_listener", "why_it_stops"]);
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/sharpen.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** The system prompt also carries `CANON_MESSAGES` and the instruction to answer by calling the tool.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): sharpen prompt, schema and idea patch`

---

### Task 3: Taste engine (proposal prompt and merge)

**Files:**
- Modify: `src/features/content/engine/taste.ts`
- Test: `src/features/content/engine/taste.test.ts`

**Interfaces:**
- Produces:
  - `PROPOSAL_TOOL_NAME = "record_rules"`.
  - `type RuleLite = { id: string; rule: string; status: RuleStatus }`, `type NoteLite = { id: string; chips: string[]; text: string; source: NoteSource; idea: { title: string; hook: string } | null }`.
  - `proposalOutputSchema` (zod): `{ new_rules: { rule: string (1..200); note_ids: string[] (min 1) }[]; evidence: { rule_id: string; note_ids: string[] (min 1) }[] }`.
  - `proposalToolSchema()`, `proposalSystemPrompt(): string`, `renderProposalTurn(a: { notes: NoteLite[]; rules: RuleLite[] }): string` (rules grouped by status under headings "Active", "Waiting for review", "Turned off", "Rejected").
  - `normalizeRule(text: string): string` — lowercase, punctuation to spaces, whitespace collapsed, trimmed.
  - `mergeProposal(out: ProposalOutput, rules: RuleLite[], noteIds: string[]): { inserts: { rule: string; note_ids: string[] }[]; evidence: { rule_id: string; note_ids: string[] }[] }` — the algorithm below.

`mergeProposal`: keep only cited note ids that are in `noteIds`; drop entries left with none. For each new rule: if its normalized text equals an existing rule's, add its notes to that rule's evidence when the rule is `active` or `proposed`, and drop it otherwise; else insert it (two new rules with the same normalized text merge into one insert). Evidence for an unknown rule id, or a rule that is `off` or `rejected`, is dropped. Evidence entries for the same rule merge, note ids deduplicated.

- [ ] **Step 1: Write the failing tests**

```ts
it("a new rule that repeats a rejected or off rule, in other case and punctuation, is dropped", () => {
  const rules = [{ id: "r1", rule: "Open on the belief, never a question.", status: "rejected" as const }];
  expect(mergeProposal({ new_rules: [{ rule: "open on the belief never a question", note_ids: ["n1"] }], evidence: [] }, rules, ["n1"]))
    .toEqual({ inserts: [], evidence: [] });
});
it("a repeat of an active rule becomes evidence for it", () => {
  const rules = [{ id: "r2", rule: "Name one real number in the hook", status: "active" as const }];
  expect(mergeProposal({ new_rules: [{ rule: "Name one real number in the hook.", note_ids: ["n1", "n2"] }], evidence: [] }, rules, ["n1", "n2"]))
    .toEqual({ inserts: [], evidence: [{ rule_id: "r2", note_ids: ["n1", "n2"] }] });
});
it("note ids not in this proposal, and unknown or rejected rule ids, are dropped", () => {});
it("duplicate new rules merge into one insert with both notes", () => {});
it("the turn lists notes with their idea and rules by status", () => {
  const t = renderProposalTurn({ notes: [note], rules });
  expect(t).toContain("Rejected:");
  expect(t).toContain(`[${note.id}]`);
});
it("the prompt forbids re-proposing rejected or off rules and formatting rules", () => {
  expect(proposalSystemPrompt()).toMatch(/never re-propose a rejected or turned-off rule/i);
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/engine/taste.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): taste proposal prompt and merge`

---

### Task 4: Sharpen flow

**Files:**
- Create: `src/features/content/data/sharpen.ts`, `sharpen.fake.ts`, `sharpen.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `chicagoDayStart` (`data/recreate.ts`); `STALE_PENDING_MINUTES` (`engine/recreate.ts`); `ToolCaller`.
- Produces:

```ts
export type SharpenRow = { id: string; idea_id: string; note_id: string | null; status: SharpenStatus; options: SharpenOption[]; error: string; chips: string[]; text: string; created_at: string };
export type IdeaForSharpen = SharpenIdea & { id: string; status: string; drafted: boolean; heldByBrief: boolean };
export interface SharpenDb {
  idea(id: string): Promise<IdeaForSharpen | null>;
  expireStale(ideaId: string, before: string): Promise<void>;
  countSince(since: string): Promise<number>;
  live(ideaId: string): Promise<SharpenRow | null>;
  insertNote(n: { ideaId: string; chips: string[]; text: string; source: "sharpen" }): Promise<string>;
  insertPending(ideaId: string, noteId: string | null, chips: string[], text: string): Promise<string | null>; // null on the live unique index
  get(id: string): Promise<SharpenRow | null>;
  finish(id: string, patch: { status: "ready"; options: SharpenOption[] } | { status: "failed"; error: string }): Promise<void>;
  claim(id: string, index: number): Promise<SharpenRow | null>;  // ready to picked
  unclaim(id: string): Promise<void>;
  discard(id: string): Promise<boolean>;                          // pending, ready or failed to discarded
  patchIdea(id: string, patch: ReturnType<typeof sharpenIdeaPatch>): Promise<boolean>; // only while inbox or queued
  activeRules(): Promise<string[]>;
}
export type SharpenStart = { ok: true; id: string; noteId: string } | { ok: false; error: string };
export async function startSharpen(db: SharpenDb, ideaId: string, input: { chips: string[]; text: string }, now: Date): Promise<SharpenStart>;
export async function runSharpen(db: SharpenDb, caller: ToolCaller, id: string): Promise<void>; // never throws
export async function pickSharpen(db: SharpenDb, id: string, index: number): Promise<{ ideaId: string; queued: boolean } | { error: string }>;
export async function retrySharpen(db: SharpenDb, id: string, now: Date): Promise<SharpenStart>; // same chips and text, no new note (noteId of the old row)
export async function cancelSharpen(db: SharpenDb, id: string): Promise<{ error: string | null }>;
export function sharpenBlock(idea: IdeaForSharpen | null): string | null; // the refusal text, or null
```

Refusal copy (exact): no chip and no text → "Say what's off first."; idea missing → "That idea was not found."; not inbox or queued → "Only Inbox and queued ideas can be sharpened."; drafted → "Already drafted."; held by a brief → "This idea is in today's brief."; live exists → "This idea is already being sharpened."; cap → "That's 10 sharpens today. Try again tomorrow." Chips outside `SHARPEN_CHIPS` are dropped; text is trimmed and cut at 500 characters. `startSharpen` order: input, idea check (`sharpenBlock`), `expireStale`, live, cap, `insertNote`, `insertPending`. `pickSharpen` re-checks with `sharpenBlock` after `claim` (Review Focus 1: on refusal it discards and returns the refusal text), then `patchIdea`; on a failed write it unclaims.

- [ ] **Step 1: Write the failing tests** (against `sharpen.fake.ts`)

```ts
it("starts with a note and a pending row; refuses an empty request, a drafted idea, a briefed idea and the 11th of the day", async () => {});
it("drops unknown chips and cuts text at 500 characters", async () => {});
it("runSharpen writes three options with the approved rules in the prompt; a bad answer fails the row; never throws", async () => {});
it("pick rewrites the idea in place, old hook to hook_alt, and reports whether it was queued", async () => {});
it("pick on an idea drafted since the sharpen started discards it and says so", async () => {
  // f.ideas.get("i1")!.drafted = true after start; expect { error: "Already drafted." } and row discarded, idea unchanged
});
it("a double pick writes the idea once", async () => {
  // two concurrent pickSharpen calls; patchIdea called once; second returns "These rewrites are no longer available."
});
it("retry discards the card and starts a new one with the same chips and text and no new note", async () => {});
it("a pending row older than 10 minutes no longer blocks a new sharpen", async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/sharpen.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): sharpen flow`

---

### Task 5: Taste flow (notes, proposals, approval)

**Files:**
- Create: `src/features/content/data/taste.ts`, `taste.fake.ts`, `taste.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3; `chicagoDayStart`; `STALE_PENDING_MINUTES`.
- Produces:

```ts
export type RuleRow = { id: string; rule: string; status: RuleStatus; origin: "derived" | "manual"; evidence_count: number; last_evidence_at: string | null; note_ids: string[]; created_at: string };
export type NoteRow = NoteLite & { idea_id: string | null; proposal_id: string | null; created_at: string };
export interface TasteDb {
  insertNote(n: { ideaId: string | null; chips: string[]; text: string; source: NoteSource }): Promise<string>;
  unusedNotes(): Promise<NoteRow[]>;
  rules(): Promise<RuleRow[]>;
  proposalsSince(since: string): Promise<number>;
  livePending(before: string): Promise<{ id: string } | null>;      // a pending proposal created after `before`
  insertProposal(kind: ProposalKind): Promise<string>;
  finishProposal(id: string, patch: { status: "ready" } | { status: "failed"; error: string }): Promise<void>;
  /** Inserts, evidence and marking the notes used, in one call so a failure leaves the notes unused. */
  applyProposal(id: string, merged: ReturnType<typeof mergeProposal>, noteIds: string[], at: string): Promise<void>;
  setRule(id: string, patch: { status?: RuleStatus; rule?: string }): Promise<boolean>;   // keeps active in step with status
  insertManualRule(rule: string): Promise<string>;
  page(): Promise<TastePage>;
}
export type TastePage = { proposed: (RuleRow & { notes: NoteRow[] })[]; active: (RuleRow & { notes: NoteRow[] })[]; off: RuleRow[]; notes: NoteRow[]; waiting: number; proposalsLeft: number };
export async function recordPassNote(db: TasteDb, ideaId: string, reason: string): Promise<{ due: boolean }>;  // no note for empty reason
export async function proposalDue(db: TasteDb): Promise<boolean>;    // unused notes >= 5
export async function startProposal(db: TasteDb, kind: ProposalKind, now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
export async function runProposal(db: TasteDb, caller: ToolCaller, id: string, now: Date): Promise<void>; // never throws
export async function approveRule(db: TasteDb, id: string, editedText?: string): Promise<{ error: string | null }>; // proposed only
export async function rejectRule(db: TasteDb, id: string): Promise<{ error: string | null }>;                 // proposed only
export async function setRuleOn(db: TasteDb, id: string, on: boolean): Promise<{ error: string | null }>;      // active <-> off
export async function addManualRule(db: TasteDb, text: string): Promise<{ error: string | null }>;
```

`applyProposal` is implemented in the adapter as one Postgres function call (Task 6) so inserts, evidence and `proposal_id` on the notes commit together. Refusals: manual with no unused note → "No new notes to learn from yet."; cap → "That's 3 proposals today. Try again tomorrow."; a live pending proposal younger than 10 minutes → "Rules are already being proposed." Approve with edited text trims it and refuses empty or over 200 characters.

- [ ] **Step 1: Write the failing tests**

```ts
it("a pass with a reason stores a pass note; an empty reason stores none; the fifth unused note makes a proposal due", async () => {});
it("runProposal inserts proposed derived rules with their cited notes and marks the notes used", async () => {});
it("a failed proposal leaves its notes unused for the next one", async () => {
  // caller throws; expect proposal failed, unusedNotes still 5, no rules inserted
});
it("refuses a manual proposal with no notes, the fourth proposal of the day, and a second while one is pending", async () => {});
it("approve makes a proposed rule active (with edited text); reject sets rejected; neither works on an active rule", async () => {});
it("turning a rule off and on keeps active in step with status; a manual rule is active at once", async () => {});
```

- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/taste.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): taste notes, proposals and approval`

---

### Task 6: Adapters

**Files:**
- Create: `src/features/content/data/supabase-sharpen-db.ts` (+ test), `src/features/content/data/supabase-taste-db.ts` (+ test)
- Modify: `supabase/migrations/0018_content_taste_sharpen.sql` (+ test) for the `content_apply_taste_proposal` function

**Interfaces:**
- Consumes: Tasks 4 and 5.
- Produces: `supabaseSharpenDb(client, userId): SharpenDb & { liveForIdeas(ideaIds: string[], now: Date): Promise<Map<string, SharpenRow>> }`, `supabaseTasteDb(client, userId): TasteDb`. SQL function `content_apply_taste_proposal(p_user uuid, p_proposal uuid, p_inserts jsonb, p_evidence jsonb, p_notes uuid[], p_at timestamptz) returns void`, `security invoker`, every statement filtered by `p_user`.

Rules: `idea()` derives `drafted` from a row in `content_drafts` for the idea or a non-null `obsidian_path`, and `heldByBrief` from an `open` or `posted` row in `content_experiments`. `patchIdea` updates only where status in (`inbox`, `queued`) and returns whether a row matched. `activeRules()` and the Today rules read `status = 'active'`. `liveForIdeas` returns pending (not stale) and ready rows, stale pending shown as failed "Timed out" (the Recreate rule).

- [ ] **Step 1: Write the failing tests**: every select and update on the three new tables and on rules carries `user_id` (count equality, as in `supabase-competitors-db.test.ts`); `insertPending` returns null on `23505`; `patchIdea` filters status in inbox/queued; `applyProposal` calls the RPC with the six named arguments; the migration test asserts the function exists, is `security invoker`, and filters by `p_user`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/data/supabase-sharpen-db.test.ts src/features/content/data/supabase-taste-db.test.ts supabase/migrations/0018_content_taste_sharpen.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same plus `pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): sharpen and taste adapters`

---

### Task 7: Rules reach Today; Today wins over Sharpen; actions

**Files:**
- Modify: `src/features/content/engine/today-brief.ts` (+ test), `src/features/content/data/today.ts` (+ `today.fake.ts`, `today.test.ts`), `src/features/content/data/supabase-today-db.ts` (+ test), `src/features/content/data/actions.ts` (`passIdea`), `routines/content-daily.md`
- Create: `src/features/content/data/sharpen-actions.ts`, `src/features/content/data/taste-actions.ts`

**Interfaces:**
- Consumes: Tasks 4 to 6; `syncQueuedIdeasToClickUp` (already in `data/actions.ts`'s imports).
- Produces:
  - `briefSystemPrompt(rules: string[] = [])` adds "Miguel's approved rules" with one `- rule` line each when non-empty.
  - `TodayDb.activeRules(): Promise<string[]>` and `TodayDb.discardSharpen(ideaId: string): Promise<void>`; `askClaude` in `today.ts` passes the rules; `runDaily` (each claimed idea), `runSwap` (a newly claimed idea) call `discardSharpen` before patching the idea.
  - Actions (each `requireContentOwner()` first, zod input, the API key checked before any row): `startSharpenAction(fd)`, `pickSharpenAction(fd)`, `retrySharpenAction(fd)`, `cancelSharpenAction(fd)` in `sharpen-actions.ts`; `proposeRulesAction()`, `approveRuleAction(fd)`, `rejectRuleAction(fd)`, `setRuleOnAction(fd)`, `addRuleAction(fd)` in `taste-actions.ts`. Generation runs with `waitUntil` through the admin client. After a stored note, when `proposalDue`, the action also starts an `auto` proposal with `waitUntil` (silently skipped if refused). `pickSharpenAction` re-syncs ClickUp when the idea was queued. All revalidate `/content` as layout.
  - `passIdea` calls `recordPassNote` after the update and starts an `auto` proposal when due (best effort; a failure never fails the Pass).
  - `routines/content-daily.md`: one sentence that `taste_rules` with origin `derived` are rules Miguel approved.

- [ ] **Step 1: Write the failing tests**: `today-brief.test.ts` — the prompt lists approved rules under the heading and omits it when empty; `today.test.ts` — "claiming an idea discards its live sharpen" (fake records `discardSharpen("i1")` before the patch), "the brief prompt carries the active rules"; `supabase-today-db.test.ts` — `activeRules` filters `status = 'active'` and `user_id`; `wiring.test.ts` lists `sharpen-actions.ts` and `taste-actions.ts`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content` — Expected: the new cases FAIL, the rest pass.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/features/content && pnpm typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): approved rules reach Today; Today cancels a sharpen it overrides; sharpen and taste actions`

---

### Task 8: UI (Sharpen on cards, the Taste page)

**Files:**
- Create: `src/features/content/ui/SharpenPanel.tsx` (+ test), `src/features/content/ui/TasteRules.tsx` (+ test), `src/app/(app)/content/taste/page.tsx`
- Modify: `ui/IdeaCard.tsx`, `ui/QueueCard.tsx`, `ui/ContentTabs.tsx`, `src/app/(app)/content/page.tsx`, `src/app/(app)/content/queue/page.tsx`, `src/app/(app)/content/ideas/[id]/page.tsx`, `data/queries.ts` (no new `supabase.from` in pages: loaders call `supabaseSharpenDb(...).liveForIdeas`)

**Interfaces:**
- Consumes: Task 7 actions; `SharpenRow`; `TastePage`.
- Produces: `SharpenPanel({ ideaId, sharpen, blocked }: { ideaId: string; sharpen: SharpenRow | null; blocked: string | null })`; `IdeaCard` and `QueueCard` take `sharpen?: SharpenRow | null` and `sharpenBlocked?: string | null`.

Exact copy:
- Button "Sharpen"; when blocked, the block text in place of the button ("Already drafted." / "This idea is in today's brief.").
- Open panel: the four chips as toggle buttons, a text box with placeholder "Anything else?", "Sharpen" submit, "Cancel".
- Pending: "Sharpening… about a minute." Failed: "Couldn't sharpen: {error}" with "Try again".
- Ready: three options, each with its hook, title, `what_changed` and "Pick"; under them "Try again" and "Cancel".
- Taste tab after Creators, page heading "Taste". Sections "Proposed rules", "Active rules", "Turned off", "Notes". Empty states: "No proposed rules. They appear after 5 notes." / "No active rules yet." / "No notes yet. Sharpen or pass an idea to add one." Header line "{waiting} notes waiting · {proposalsLeft} proposals left today" and the "Propose rules" button (disabled with no waiting notes). Proposed rule actions "Approve", "Edit", "Reject"; active "Turn off"; off "Turn on"; "Add a rule" form.

- [ ] **Step 1: Write the failing tests**: `SharpenPanel.test.tsx` renders the chips and the submit, the pending line, the three ready options with Pick, the failed line, and the blocked text instead of the button; `TasteRules.test.tsx` renders a proposed rule with its notes and three actions, an active rule with Turn off, the empty states and the header line; `wiring.test.ts` lists `src/app/(app)/content/taste/page.tsx` in the owner and no-query lists.
- [ ] **Step 2: Run** `pnpm vitest run src/features/content/ui src/features/content/wiring.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/features/content && pnpm typecheck && pnpm build` — Expected: PASS; build lists `/content/taste`.
- [ ] **Step 5: Commit** `feat(content): Sharpen on idea cards and the Taste page`

---

### Task 9: Docs

**Files:**
- Modify: `src/features/content/CLAUDE.md` (map entries; invariants: proposed rules never reach a prompt, `active = (status = 'active')`, one live sharpen per idea, Pick re-checks and claims, Today discards a sharpen on an idea it claims, a note feeds at most one proposal, a failed proposal leaves notes unused; touchpoints `0018`), `docs/PRODUCT-STATUS.md` (migrations through 0018), `docs/superpowers/specs/2026-09-17-content-engine-design.md` (Taste loop section points to the new spec), the spec's status line.

- [ ] **Step 1: Edit the docs.**
- [ ] **Step 2: Run** `pnpm test && pnpm typecheck && pnpm build` — Expected: all green.
- [ ] **Step 3: Commit** `docs(content): Sharpen and the taste loop documented`
