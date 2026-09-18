# Content Engine PR 2: Daily Routine, ClickUp, Plaud — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every morning a cloud Claude routine reads Miguel's new Granola, Wispr Flow, and Plaud recordings, writes up to 10 ranked ideas into the inbox, and posts a ClickUp digest; liking an idea creates a ClickUp task; the Sources page shows Plaud recordings with a "Mine this" kickoff; a local companion mines one Plaud recording on demand.

**Architecture:** The app side is small: the ingest endpoint now returns the rows it wrote, the context endpoint adds the sources the routine already knows about, the Sources page gains a Plaud section and a `requestMining` action, and `likeIdea` creates a ClickUp task through the REST API. The intelligence is two prompt files checked into the repo: `engine/prompts/ideas.ts` (the generation rules, reused in PR 4 for found content) and `routines/content-daily.md` (the routine's step-by-step instructions). The cloud routine has a git checkout, Bash, and the Granola, Wispr-Flow, Plaud, and ClickUp connectors; it reads the two prompt files from the checkout, calls the endpoints with `curl`, and posts the digest through the ClickUp connector. A repo-local skill runs the same instructions on the Mac for one Plaud recording.

**Tech Stack:** Next.js 14 Server Actions and route handlers, Supabase, zod, Vitest; ClickUp REST v2 (task creation from the app); claude.ai cloud routines with MCP connectors (Granola, Wispr-Flow, Plaud, ClickUp).

**Spec:** `docs/superpowers/specs/2026-09-17-content-engine-design.md` (sections "The daily idea run", "Kicking off a Plaud pull", "ClickUp", Rollout item 2).

## Global Constraints

- The three rules from `src/boundaries.test.ts`: `features/content` imports only from `shared/` and itself; nothing imports `app/`.
- Every page and Server Action calls `requireContentOwner()`; writes carry `.eq("user_id", user.id)` on top of RLS.
- Ingest stays all-or-nothing and insert-ignore on sources; a source carrying `mined_at` becomes `mined`; everything else keeps its status.
- Confidentiality: the routine never opens a recording whose source status is `denied` or `pending`. Deny rules win over allow rules. A recording matching no rule is written as `pending` and not read.
- Plaud: read `mark_memo` highlights first, then `transaction_polish`; ideas from a highlighted moment rank above the rest. Requested sources (`requested_at` set, not yet mined) are opened first.
- ClickUp: digest goes to chat channel `7-9011777568-8` ("Amplifica Wealth"); tasks go to list `901113803092` (Task Tracking), named `[Format] hook`, with the idea URL in the description. Task creation failure never fails the Like; it is logged and retried on the next Like.
- Routine credentials: `CONTENT_ENGINE_SECRET` and `CONTENT_API_BASE` are environment variables on the cloud environment, never literals in a prompt or a committed file.
- Formats: reel, youtube, newsletter, story, x. Brand guardrails in every generated idea: no "guaranteed", no "low risk", no return promises, say "borrow capital" not "leverage", never number episodes ("Part 2 of 5").
- Routine schedule: 06:00 America/Chicago daily. Cron is UTC and fixed, so use `0 11 * * *` (CDT); it drifts to 07:00 local in winter, which is acceptable.
- Commit after every task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. `pnpm test && pnpm typecheck` before each commit; `pnpm build` at the end.
- Out of scope (later PRs): metric crons, drafting, lint, taste distillation, found content, weekly review, vault and IG companions.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/features/content/data/ingest.ts` | `IngestDb.insertIdeas` returns written rows; `ingestPayload` returns `{ sources, ideas }` rows |
| `src/features/content/data/context.ts` | `ContextDb.knownSources`; context gains `known_sources` and `requested_sources`; dedupe titles include every status |
| `src/features/content/data/supabase-db.ts` | adapters for the above |
| `src/app/api/content/ingest/route.ts` | response shape `{ ok, sources: [...], ideas: [...] }` |
| `src/features/content/data/actions.ts` | `requestMining`; `likeIdea` calls the ClickUp sync |
| `src/features/content/data/clickup.ts` | `createClickUpTask`, `syncQueuedIdeasToClickUp` |
| `src/features/content/ui/PlaudSection.tsx` | Plaud rows with Mine this |
| `src/app/(app)/content/sources/page.tsx` | renders `PlaudSection` |
| `src/features/content/engine/prompts/ideas.ts` | the generation rules as a string |
| `routines/content-daily.md` | the routine's instructions |
| `routines/README.md` | how the routine is configured and run |
| `.claude/skills/content-plaud/SKILL.md` | local: mine one Plaud recording now |
| `.claude/skills/content-daily/SKILL.md` | local: run the daily routine from the Mac |
| `src/features/content/CLAUDE.md`, `.env.example`, `docs/PRODUCT-STATUS.md` | docs |

---

### Task 1: Ingest returns rows; context knows sources

**Files:**
- Modify: `src/features/content/data/ingest.ts`
- Modify: `src/features/content/data/ingest.test.ts`
- Modify: `src/features/content/data/context.ts`
- Modify: `src/features/content/data/context.test.ts`
- Modify: `src/features/content/data/supabase-db.ts`
- Modify: `src/app/api/content/ingest/route.ts`

**Interfaces:**
- Produces: `IngestDb.insertIdeas(rows): Promise<{ id: string; format: string; title: string; hook: string }[]>`; `ingestPayload(...)` returns `{ sources: { id; kind; external_id }[]; ideas: { id; format; title; hook }[] }`; `ContextDb.knownSources(sinceIso): Promise<KnownSource[]>` with `KnownSource = { kind: string; external_id: string; title: string; status: string; requested_at: string | null; mined_at: string | null }`; `ContentContext.known_sources: KnownSource[]` and `ContentContext.requested_sources: KnownSource[]`.

- [ ] **Step 1: Update the ingest tests to expect rows**

In `src/features/content/data/ingest.test.ts`, change the fake's `insertIdeas` to:

```ts
    async insertIdeas(rows) {
      ideas.push(...rows);
      return rows.map((r, i) => ({ id: `idea-${i}`, format: r.format, title: r.title, hook: r.hook }));
    },
```

Change the first test's assertion from `expect(result).toEqual({ sources: 2, ideas: 2 })` to:

```ts
    expect(result.sources).toEqual([
      { id: "src-0", kind: "granola", external_id: "830179d0-d2b4-40d4-9d3f-bfd2adf32f50" },
      { id: "src-1", kind: "granola", external_id: "7110b1e1-c279-465c-b04b-55a19e5287a1" },
    ]);
    expect(result.ideas.map((i) => i.id)).toEqual(["idea-0", "idea-1"]);
    expect(result.ideas[0]).toMatchObject({ format: "reel", title: "A W-2 is a runway, not a cage" });
```

- [ ] **Step 2: Run to verify the test fails**

Run: `pnpm vitest run src/features/content/data/ingest.test.ts`
Expected: FAIL on the changed assertion (result is still counts).

- [ ] **Step 3: Change ingest.ts and the adapter**

In `src/features/content/data/ingest.ts`:
- `IngestDb.insertIdeas` signature becomes `insertIdeas(rows: ContentIdeaInsert[]): Promise<{ id: string; format: string; title: string; hook: string }[]>;` with the doc comment "Returns the written rows in insert order; the routine needs ids for deep links."
- `ingestPayload`'s return type becomes `Promise<{ sources: { id: string; kind: string; external_id: string }[]; ideas: { id: string; format: string; title: string; hook: string }[] }>`.
- The last lines become:

```ts
  const ideas = ideaRows.length > 0 ? await db.insertIdeas(ideaRows) : [];
  return { sources: written, ideas };
```

In `src/features/content/data/supabase-db.ts`, `insertIdeas` becomes:

```ts
    async insertIdeas(rows) {
      const { data, error } = await client
        .from("content_ideas")
        .insert(rows)
        .select("id, format, title, hook");
      if (error) throw new Error(`content_ideas insert: ${error.message}`);
      return data ?? [];
    },
```

In `src/app/api/content/ingest/route.ts`, the success response becomes:

```ts
    return NextResponse.json({
      ok: true,
      sources: result.sources,
      ideas: result.ideas,
      counts: { sources: result.sources.length, ideas: result.ideas.length },
    });
```

- [ ] **Step 4: Run the ingest tests to verify they pass**

Run: `pnpm vitest run src/features/content/data/ingest.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing context tests**

In `src/features/content/data/context.test.ts`, add to `fakeDb`'s defaults:

```ts
    knownSources: async () => [
      { kind: "plaud", external_id: "p1", title: "Walk with Jackie", status: "allowed", requested_at: "2026-09-16T20:00:00Z", mined_at: null },
      { kind: "plaud", external_id: "p2", title: "Old one", status: "mined", requested_at: "2026-09-10T20:00:00Z", mined_at: "2026-09-11T11:00:00Z" },
      { kind: "granola", external_id: "g1", title: "Client call", status: "denied", requested_at: null, mined_at: null },
    ],
```

and two tests:

```ts
  it("passes known sources through and derives the requested ones", async () => {
    const ctx = await buildContext(fakeDb(), now);
    expect(ctx.known_sources).toHaveLength(3);
    expect(ctx.requested_sources.map((s) => s.external_id)).toEqual(["p1"]);
  });

  it("asks for 90 days of known sources", async () => {
    const seen: string[] = [];
    const db = fakeDb({
      knownSources: async (iso) => {
        seen.push(iso);
        return [];
      },
    });
    await buildContext(db, now);
    expect(seen).toEqual(["2026-06-19T12:00:00.000Z"]);
  });
```

- [ ] **Step 6: Run to verify they fail**

Run: `pnpm vitest run src/features/content/data/context.test.ts`
Expected: FAIL: `knownSources` is not in `ContextDb` / `requested_sources` undefined.

- [ ] **Step 7: Extend context.ts and the adapter**

In `src/features/content/data/context.ts`:

```ts
export type KnownSource = {
  kind: string;
  external_id: string;
  title: string;
  status: string;
  requested_at: string | null;
  mined_at: string | null;
};
```

Add to `ContextDb`: `knownSources(iso: string): Promise<KnownSource[]>;`

Add to `ContentContext`: `known_sources: KnownSource[]; requested_sources: KnownSource[];`

In `buildContext`, add `db.knownSources(since(90))` to the `Promise.all` (destructure as `known_sources`) and set:

```ts
    known_sources,
    requested_sources: known_sources.filter(
      (s) => s.status === "allowed" && s.requested_at !== null && s.mined_at === null
    ),
```

Update the doc comment on `ContextDb`: add "which recordings it has already seen, so it never re-sends a denied or mined one and opens requested ones first."

In `src/features/content/data/supabase-db.ts`, add to `supabaseContextDb`:

```ts
    async knownSources(iso) {
      const { data, error } = await client
        .from("content_sources")
        .select("kind, external_id, title, status, requested_at, mined_at")
        .eq("user_id", userId)
        .gte("created_at", iso)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw fail("known sources", error.message);
      return data ?? [];
    },
```

And change `ideaTitlesSince` to drop the status filter (remove the `.in("status", [...])` line) so rejected and archived titles also dedupe. Update its comment: "every status: a passed idea must not come back as new."

- [ ] **Step 8: Run context tests, then the full suite and typecheck**

Run: `pnpm vitest run src/features/content/data/context.test.ts && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/content/data/ingest.ts src/features/content/data/ingest.test.ts src/features/content/data/context.ts src/features/content/data/context.test.ts src/features/content/data/supabase-db.ts src/app/api/content/ingest/route.ts
git commit -m "feat(content): ingest returns written rows; context lists known and requested sources

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Plaud section and the Mine-this action

**Files:**
- Modify: `src/features/content/data/actions.ts`
- Create: `src/features/content/ui/PlaudSection.tsx`
- Modify: `src/app/(app)/content/sources/page.tsx`

**Interfaces:**
- Produces: `requestMining(formData)` Server Action (sets `status = allowed`, `requested_at = now()` on a source the owner has, unless already mined); `PlaudSection({ sources, lastSweep })`.

- [ ] **Step 1: Add the action**

Append to `src/features/content/data/actions.ts`:

```ts
/**
 * "Mine this": open a recording to the next daily run and put it first in
 * line. Idempotent; a mined recording is left alone.
 */
export async function requestMining(formData: FormData) {
  const { supabase, user } = await requireContentOwner();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("content_sources")
    .update({ status: "allowed", requested_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .neq("status", "mined");
  if (error) throw new Error(error.message);
  revalidate();
}
```

- [ ] **Step 2: Write PlaudSection**

`src/features/content/ui/PlaudSection.tsx`:

```tsx
import type { ContentSource } from "@/shared/supabase/database.types";
import { requestMining } from "@/features/content/data/actions";
import Card from "@/shared/ui/Card";
import { fmtDate } from "@/shared/format";

type Meta = { has_highlights?: boolean; duration_s?: number };

// Plaud recordings the routine has discovered. "Mine this" puts one first in
// line for the next run; the immediate path is the /content-plaud companion.
export default function PlaudSection({ sources, lastSweep }: { sources: ContentSource[]; lastSweep: string | null }) {
  return (
    <Card title="Plaud recordings">
      <p className="text-xs text-sub mb-3">
        Last sweep: {lastSweep ? fmtDate(lastSweep) : "never"}. A recording made today shows up after tomorrow's run.
        For ideas right now, run <code>/content-plaud</code> from Claude Code.
      </p>
      {sources.length === 0 ? (
        <p className="text-sm text-sub">No Plaud recordings seen yet.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {sources.map((s) => {
            const meta = (s.meta ?? {}) as Meta;
            const mins = meta.duration_s ? Math.round(meta.duration_s / 60) : null;
            const canRequest = s.status !== "mined" && !s.requested_at;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{s.title || s.external_id}</span>
                {meta.has_highlights && <span className="text-[10px] uppercase text-purple">highlights</span>}
                {mins !== null && <span className="text-xs text-sub">{mins} min</span>}
                <span className="text-xs text-sub">{s.occurred_at ? fmtDate(s.occurred_at) : ""}</span>
                <span className="text-xs text-sub w-16 text-right">
                  {s.status === "mined" ? "mined" : s.requested_at ? "requested" : s.status}
                </span>
                {canRequest && (
                  <form action={requestMining}>
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className="text-xs text-purple hover:underline">Mine this</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Render it on the Sources page**

In `src/app/(app)/content/sources/page.tsx`:
- Import `PlaudSection from "@/features/content/ui/PlaudSection"`.
- Add a fourth query to the `Promise.all`: `supabase.from("content_sources").select("*").eq("user_id", user.id).eq("kind", "plaud").order("occurred_at", { ascending: false }).limit(50)` destructured as `{ data: plaud }`.
- Render `<PlaudSection sources={plaud ?? []} lastSweep={lastRun.plaud ?? null} />` right after `<PendingSourcesStrip ... />`.

- [ ] **Step 4: Typecheck and test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS (the privacy test still finds `requireContentOwner()` in the page and in actions).

- [ ] **Step 5: Commit**

```bash
git add src/features/content/data/actions.ts src/features/content/ui/PlaudSection.tsx "src/app/(app)/content/sources/page.tsx"
git commit -m "feat(content): Plaud section with Mine-this kickoff on the Sources page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: ClickUp task on Like

**Files:**
- Create: `src/features/content/data/clickup.ts`
- Create: `src/features/content/data/clickup.test.ts`
- Modify: `src/features/content/data/actions.ts` (`likeIdea`)
- Modify: `.env.example`

**Interfaces:**
- Produces:
  - `createClickUpTask(input: { name: string; markdown: string }, env: ClickUpEnv, fetchImpl?: typeof fetch): Promise<{ id: string; url: string } | null>` where `ClickUpEnv = { token?: string; listId?: string }`.
  - `taskFor(idea: IdeaForTask, siteUrl: string): { name: string; markdown: string }` (pure).
  - `syncQueuedIdeasToClickUp(supabase: SupabaseClient<Database>, userId: string): Promise<number>`.

- [ ] **Step 1: Write the failing tests**

`src/features/content/data/clickup.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createClickUpTask, taskFor } from "./clickup";

const idea = {
  id: "abc",
  format: "reel" as const,
  title: "A W-2 is a runway, not a cage",
  hook: "I took a new W-2 job this month.",
  belief_attacked: "You must quit to build FI",
  value_to_listener: "A rule for raises",
  why_it_stops: "Contradicts the pitch",
  outline: [{ beat: "Offer letter on screen" }, { beat: "The rule" }],
};

describe("taskFor", () => {
  it("names the task [Format] hook and links the idea", () => {
    const t = taskFor(idea, "https://amplificawealth.com");
    expect(t.name).toBe("[Reel] I took a new W-2 job this month.");
    expect(t.markdown).toContain("https://amplificawealth.com/content/ideas/abc");
    expect(t.markdown).toContain("Offer letter on screen");
    expect(t.markdown).toContain("You must quit to build FI");
  });
  it("truncates a long hook in the name", () => {
    const t = taskFor({ ...idea, hook: "x".repeat(300) }, "https://a.b");
    expect(t.name.length).toBeLessThanOrEqual(200);
  });
});

describe("createClickUpTask", () => {
  const env = { token: "pk_test", listId: "901113803092" };

  it("posts to the list with the token and returns id and url", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "t1", url: "https://app.clickup.com/t/t1" }), { status: 200 })
    );
    const out = await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ id: "t1", url: "https://app.clickup.com/t/t1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.clickup.com/api/v2/list/901113803092/task");
    expect((init.headers as Record<string, string>).Authorization).toBe("pk_test");
    expect(JSON.parse(init.body as string)).toEqual({ name: "n", markdown_content: "m" });
  });

  it("returns null without throwing when the env is missing", async () => {
    const fetchImpl = vi.fn();
    expect(await createClickUpTask({ name: "n", markdown: "m" }, {}, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/features/content/data/clickup.test.ts`
Expected: FAIL, cannot resolve `./clickup`.

- [ ] **Step 3: Write clickup.ts**

`src/features/content/data/clickup.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { FORMAT_LABEL, type Format, type OutlineBeat } from "@/features/content/engine/types";

// ClickUp task creation for liked ideas. Best effort by design: the Like is
// the point, the task is a mirror. Failures return null and are logged; the
// next Like sweeps up anything still missing a task.

export type ClickUpEnv = { token?: string; listId?: string };

export type IdeaForTask = {
  id: string;
  format: Format;
  title: string;
  hook: string;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: OutlineBeat[] | Json;
};

export function taskFor(idea: IdeaForTask, siteUrl: string): { name: string; markdown: string } {
  const label = `[${FORMAT_LABEL[idea.format]}] `;
  const name = (label + idea.hook).slice(0, 200);
  const beats = (Array.isArray(idea.outline) ? idea.outline : []) as OutlineBeat[];
  const markdown = [
    `**${idea.title}**`,
    "",
    `[Open in the content engine](${siteUrl}/content/ideas/${idea.id})`,
    "",
    `- Attacks: ${idea.belief_attacked}`,
    `- Listener gets: ${idea.value_to_listener}`,
    `- Stops the scroll because: ${idea.why_it_stops}`,
    "",
    ...beats.map((b, i) => `${i + 1}. ${b.beat}${b.note ? ` (${b.note})` : ""}`),
  ].join("\n");
  return { name, markdown };
}

export async function createClickUpTask(
  input: { name: string; markdown: string },
  env: ClickUpEnv,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string; url: string } | null> {
  if (!env.token || !env.listId) {
    console.warn("clickup: CLICKUP_API_TOKEN / CLICKUP_TASK_LIST_ID not set; skipping task");
    return null;
  }
  try {
    const res = await fetchImpl(`https://api.clickup.com/api/v2/list/${env.listId}/task`, {
      method: "POST",
      headers: { Authorization: env.token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, markdown_content: input.markdown }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`clickup: create task failed with ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { id?: string; url?: string };
    if (!data.id) return null;
    return { id: data.id, url: data.url ?? "" };
  } catch (e) {
    console.error("clickup: create task threw", e);
    return null;
  }
}

/**
 * Create tasks for queued ideas that do not have one yet, newest first, a
 * few at a time. Called after every Like so an earlier failure heals.
 */
export async function syncQueuedIdeasToClickUp(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number> {
  const env: ClickUpEnv = { token: process.env.CLICKUP_API_TOKEN, listId: process.env.CLICKUP_TASK_LIST_ID };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!env.token || !env.listId) return 0;

  const { data: ideas, error } = await supabase
    .from("content_ideas")
    .select("id, format, title, hook, belief_attacked, value_to_listener, why_it_stops, outline")
    .eq("user_id", userId)
    .eq("status", "queued")
    .is("clickup_task_id", null)
    .order("feedback_at", { ascending: false })
    .limit(5);
  if (error || !ideas) return 0;

  let created = 0;
  for (const idea of ideas) {
    const task = await createClickUpTask(taskFor(idea, siteUrl), env);
    if (!task) continue;
    const { error: updateError } = await supabase
      .from("content_ideas")
      .update({ clickup_task_id: task.id })
      .eq("id", idea.id)
      .eq("user_id", userId);
    if (!updateError) created += 1;
  }
  return created;
}
```

- [ ] **Step 4: Run the clickup tests to verify they pass**

Run: `pnpm vitest run src/features/content/data/clickup.test.ts`
Expected: PASS, 6 tests. The warn line in the "env missing" test is expected output from that test only; if it prints, silence it in that test with `vi.spyOn(console, "warn").mockImplementation(() => {})` so the suite stays pristine.

- [ ] **Step 5: Call the sync from likeIdea**

In `src/features/content/data/actions.ts`, import `{ syncQueuedIdeasToClickUp } from "@/features/content/data/clickup"` and, in `likeIdea`, after the `update` succeeds and before `revalidate()`, add:

```ts
  // Mirror to ClickUp. Awaited, because fire-and-forget work can be killed
  // after the response on Vercel; never throws.
  await syncQueuedIdeasToClickUp(supabase, user.id);
```

- [ ] **Step 6: Document the env vars**

Append to `.env.example`:

```
# ClickUp mirror for liked ideas. Personal API token (Settings → Apps in
# ClickUp) and the list that receives one task per liked idea.
CLICKUP_API_TOKEN=<pk_...>
CLICKUP_TASK_LIST_ID=901113803092
```

- [ ] **Step 7: Full test, typecheck, commit**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

```bash
git add src/features/content/data/clickup.ts src/features/content/data/clickup.test.ts src/features/content/data/actions.ts .env.example
git commit -m "feat(content): create a ClickUp task for every liked idea

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The generation prompt and the routine instructions

**Files:**
- Create: `src/features/content/engine/prompts/ideas.ts`
- Create: `src/features/content/engine/prompts/ideas.test.ts`
- Create: `routines/content-daily.md`
- Create: `routines/README.md`

**Interfaces:**
- Produces: `IDEAS_PROMPT: string` (the generation rules; PR 4 passes it as a Claude system prompt for found content). The routine reads it from the checkout.

- [ ] **Step 1: Write the failing prompt-contract test**

`src/features/content/engine/prompts/ideas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IDEAS_PROMPT } from "./ideas";
import { ingestIdeaSchema } from "../schema";
import { FORMATS } from "../types";

// The prompt and the schema must not drift: every field a routine has to
// produce is named in the rules it reads.
describe("IDEAS_PROMPT", () => {
  it("names every ingest idea field", () => {
    for (const key of Object.keys(ingestIdeaSchema.shape)) {
      expect(IDEAS_PROMPT, key).toContain(`\`${key}\``);
    }
  });
  it("names every format and the brand guardrails", () => {
    for (const f of FORMATS) expect(IDEAS_PROMPT).toContain(`\`${f}\``);
    for (const banned of ["guaranteed", "low risk", "leverage", "Part 2 of 5"]) {
      expect(IDEAS_PROMPT).toContain(banned);
    }
  });
});

describe("routines/content-daily.md", () => {
  const md = readFileSync("routines/content-daily.md", "utf8");
  it("points at both endpoints, the digest channel, and the Plaud highlight block", () => {
    for (const s of ["/api/content/context", "/api/content/ingest", "7-9011777568-8", "mark_memo", "transaction_polish"]) {
      expect(md).toContain(s);
    }
  });
  it("states the confidentiality rule and reads the prompt file", () => {
    expect(md).toContain("never open");
    expect(md).toContain("src/features/content/engine/prompts/ideas.ts");
    expect(md).toContain("CONTENT_ENGINE_SECRET");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/features/content/engine/prompts/ideas.test.ts`
Expected: FAIL, modules and file missing.

- [ ] **Step 3: Write the generation prompt**

`src/features/content/engine/prompts/ideas.ts`:

```ts
// The rules for turning a source (a transcript, a note, an article) into
// content ideas. The daily routine reads this file from its checkout; PR 4
// passes the same string as a Claude system prompt for found content. One
// definition, so the inbox looks the same whichever path produced an idea.

export const IDEAS_PROMPT = `
You turn one source into content ideas for Amplifica Wealth. Miguel Graf teaches
a system for turning consistent savings and borrowed capital into monthly
investment income ("Amplicons", the CYCLE method: Credit, Yield, Collect,
Liberate, Expand). The audience is a saver who wants to improve their investing
skill and gain personal freedom. Every idea must do two things: add real value
to the listener, and open with a hook that stops the scroll.

## What an idea is

Produce a JSON array of ideas. Each idea has exactly these fields:

- \`source_ref\`: { "kind", "external_id" } of the source this came from. Never null
  unless \`from_hook_backlog\` is true and \`format\` is "newsletter".
- \`from_hook_backlog\`: true only for a newsletter idea taken from the standing hook backlog.
- \`format\`: one of \`reel\`, \`youtube\`, \`newsletter\`, \`story\`, \`x\`.
- \`title\`: a working title, under 80 characters, the thesis in plain words.
- \`hook\`: the first line the audience sees or hears. Under 140 characters for
  reel, story, x; under 200 for youtube and newsletter. It states the belief
  being attacked or the surprising claim; it never asks the reader to "read that again".
- \`hook_alt\`: for reels only, a second hook for a Trial Reel test; null otherwise.
- \`belief_attacked\`: the widely held belief this idea knifes, named plainly
  ("You must quit your job to build financial independence").
- \`value_to_listener\`: what the listener walks away able to do or decide.
- \`why_it_stops\`: one sentence on why the hook stops a cold scroller.
- \`outline\`: 3 to 6 beats, each { "beat": "...", "note": "on-screen or asset" }.
  Reels: hook on screen within 3 seconds, one idea, a loop ending. YouTube:
  show the end chart in the first 15 seconds, sectioned. Newsletter: concede
  the orthodoxy's merit, isolate the mis-specified variable, prove it with
  Miguel's real dollars, close with one exact calculator instruction. Story:
  at most 5 slides, one interactive sticker. X: one post or a thread of at most 5.
- \`quote\`: the verbatim words from the source that sparked this, under 300 characters.
- \`quote_ref\`: where it was said: source title, date, and a timestamp or speaker.
- \`pillar\`: one of "method", "funding", "income-assets", "optionality", "real-numbers".
- \`hook_type\`: one of "belief-attacking", "paradox", "failure-lesson", "ranking",
  "identity", "question", "real-numbers".
- \`chain_key\`: a short string shared by ideas from the same source and thesis
  (a reel, its story sequence, a newsletter section) so they appear as one
  recording; omit when the idea stands alone.
- \`score\`: 0 to 1, your confidence that Miguel will like it, using the taste
  rules and recent feedback you were given.
- \`batch_date\`: today's date, YYYY-MM-DD.

## What makes an idea good here

- Belief-attacking hooks outperform everything else on this audience. Prefer
  ideas that name a framework people defend (the 4% rule, "buy term and invest
  the difference", "time in the market", the emergency fund) and knife one
  variable it mis-specifies.
- Failure-to-lesson is the best performing content type: Miguel's own losses
  and wrong turns, told as credibility, ending in the system.
- Judge by saves and shares, not views: the idea should be worth keeping or
  sending to a friend.
- Every episode stands alone. Never number episodes ("Part 2 of 5").
- Carousels are dead weight; do not propose them.
- Spread formats across the batch. Chain when one recording naturally yields a
  reel, a story sequence, and a newsletter section.

## Brand guardrails, non-negotiable

- No return promises. Never "guaranteed", "guarantee", "low risk", "risk-free",
  "you will earn", or a stated return anyone will get.
- Say "borrow capital", not "leverage".
- No hype, no "this changes everything", no "let that sink in".
- Client work is never a source. If the source is a client engagement, produce nothing.

## Ranking and dedupe

- Rank by expected value to the listener times scroll-stopping power, adjusted
  by the taste rules and the recent feedback (a rejected idea's reason is a
  rule until told otherwise).
- Drop anything whose thesis already appears in the known titles you were given.
- Ideas from a highlighted moment (Plaud button press) rank above the rest.
- Return at most 10 ideas per run, best first.
`.trim();
```

- [ ] **Step 4: Write the routine instructions**

`routines/content-daily.md`:

```markdown
# Content engine: daily idea run

You are the daily routine for Miguel Graf's content engine. You run in a cloud
session with a checkout of this repository, Bash, and these connectors:
Granola, Wispr-Flow, Plaud, ClickUp. Nothing here needs a browser.

Environment variables (set on the cloud environment, never in this file):
- `CONTENT_API_BASE`, e.g. https://amplificawealth.com
- `CONTENT_ENGINE_SECRET`, the bearer token for the two endpoints below

If either is missing, stop and post the ClickUp message in step 7 saying so.

## 1. Read the context

```bash
curl -sS "$CONTENT_API_BASE/api/content/context" -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" > /tmp/context.json
```

It contains: `taste_rules`, `recent_feedback` (14 days, with `feedback_reason`),
`queue_depth` per format, `known_titles` (do not propose these again),
`source_rules` (allow and deny patterns), `known_sources` (recordings already
seen, with `status`), `requested_sources` (open these first),
`last_run_by_kind` (when each source kind was last written), `voice_summary`.

## 2. Read the generation rules

Read `src/features/content/engine/prompts/ideas.ts` from the checkout. The
string it exports is the complete rule set for what an idea is and how to rank
it. Follow it exactly; the ingest endpoint rejects anything off-shape.
`routines/examples/daily-ingest.json` is a valid example body.

## 3. List new recordings

Take `since` = `last_run_by_kind[kind]` for each kind, or 7 days ago when a
kind has never run. List:

- Granola: `list_meetings` with `time_range` "this_week" (or "last_30_days"
  if `since` is older than 7 days); keep meetings whose date is after `since`.
  Participants come from `known_participants`.
- Wispr-Flow: `search_meetings` with `since`. Participants come from `attendees`.
- Plaud: `list_files` with `date_from` = the date of `since`. Plaud has no
  participants; classify on title only. Note `has_highlights` if the listing or
  a later `get_transcript` with block `mark_memo` shows marks, and duration.

Skip any recording whose `(kind, external_id)` is already in `known_sources`
with status `denied`, `mined`, or `pending`; those are decided. A known source
with status `allowed` and no `mined_at` is still open: include it.

## 4. Classify every new recording

Apply the `source_rules` as case-insensitive substring matches on the title
(field "title") or on any participant name or email (field "participant"):

- If any deny rule matches: status `denied`. Deny wins over allow.
- Else if any allow rule matches: status `allowed`.
- Else: status `pending`.

You never open a `denied` or `pending` recording. Not its transcript, not its
notes, not its summary. Client engagements are confidential and the deny list
exists so they never reach this step; when in doubt, `pending`.

## 5. Read the allowed recordings and generate ideas

Order: `requested_sources` first, then allowed recordings newest first. Stop
opening recordings once you have read 6, or 90 minutes of audio; the rest wait
for tomorrow (leave them `allowed` without `mined_at`).

- Granola: `get_meeting_transcript` (verbatim), then `get_meetings` for the
  notes if the transcript is thin.
- Wispr-Flow: `get_meeting` with `view_transcript: {}`; page with
  `start_char` when truncated.
- Plaud: `get_transcript` with block `mark_memo` first (the moments Miguel
  flagged with the button), then block `transaction_polish` (paged with
  `next_cursor`), then `get_note` for the summary. Ideas from a flagged moment
  rank above the rest.

Generate ideas per the rules file: at most 10 in total across all sources,
ranked, spread across formats, each with provenance. Drop anything matching
`known_titles`. If nothing allowed was new, produce zero ideas and still do
steps 6 and 7.

## 6. Write everything in one request

Build the body:

- `sources`: every recording you listed in step 3, with its classification
  from step 4 (`status`), `title`, `occurred_at`, `url` when the connector gave
  a link, and `meta` (`participants`, and for Plaud `has_highlights`,
  `duration_s`). For each recording you actually read, add
  `mined_at` = now (ISO 8601). Never add `mined_at` to one you did not read.
- `ideas`: the generated ideas, each `source_ref` naming a source in this body.
- `run`: { "kind": "daily", "started_at": <ISO 8601 when you started> }.

```bash
curl -sS -X POST "$CONTENT_API_BASE/api/content/ingest" \
  -H "Authorization: Bearer $CONTENT_ENGINE_SECRET" \
  -H "Content-Type: application/json" \
  --data @/tmp/ingest.json > /tmp/ingest-result.json
```

A 422 means the body is off-shape; read `issues`, fix the body, and retry once.
Any other failure: skip to step 7 and report it. On success the response lists
`ideas` with their `id`s and `sources` with their `id`s.

## 7. Post the digest to ClickUp

Send one message to chat channel `7-9011777568-8` with the ClickUp connector
(`clickup_send_chat_message`, markdown), in this shape:

```
**Content ideas for <date>** — <n> new, <m> recordings read

1. [Reel] <hook> — <CONTENT_API_BASE>/content/ideas/<id>
2. [Newsletter] <hook> — …

Waiting for a decision (not read): <k> — <CONTENT_API_BASE>/content/sources
<one line per pending title>

Sources read: <titles>
```

When the run failed at any step, post instead:
`**Content run failed** — <step> — <one-line error>` and stop.

Do not post anything else, do not create tasks (the app does that on Like),
and do not modify the repository.
```

- [ ] **Step 5: Write routines/README.md**

```markdown
# Routines

Prompts for the cloud routines that feed the content engine. Each file is
self-contained; the routine's only other inputs are the two environment
variables named at its top and the connectors it lists.

| File | Schedule (America/Chicago) | Connectors |
|---|---|---|
| `content-daily.md` | 06:00 daily (`0 11 * * *` UTC) | Granola, Wispr-Flow, Plaud, ClickUp |

## Setting one up

1. On https://claude.ai/code, open the environment the routine will use and add
   `CONTENT_API_BASE` and `CONTENT_ENGINE_SECRET` as environment variables.
   The secret is the same value the app holds in Vercel.
2. Create the routine with the repo `https://github.com/Ocelomeh89/amplifica`,
   the connectors above, and this prompt as the message:
   "Read routines/content-daily.md in this checkout and do exactly what it says."
3. Run it once by hand and check the ClickUp channel and /content.

## Running locally

The same file works from Claude Code on the Mac with the connectors attached:
`/content-daily` reads it and uses `CONTENT_ENGINE_SECRET` from `.env.local`.
`/content-plaud` mines one Plaud recording immediately.

## Examples

`examples/daily-ingest.json` is a valid ingest body; the schema test asserts it.
```

- [ ] **Step 6: Run the prompt test, then the suite**

Run: `pnpm vitest run src/features/content/engine/prompts/ideas.test.ts && pnpm test && pnpm typecheck`
Expected: PASS. If a schema key is missing from the prompt, add it to the prompt (never weaken the test).

- [ ] **Step 7: Commit**

```bash
git add src/features/content/engine/prompts/ideas.ts src/features/content/engine/prompts/ideas.test.ts routines/content-daily.md routines/README.md
git commit -m "feat(content): idea generation rules and the daily routine instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Local companions

**Files:**
- Create: `.claude/skills/content-plaud/SKILL.md`
- Create: `.claude/skills/content-daily/SKILL.md`

**Interfaces:**
- Consumes: `routines/content-daily.md`, `src/features/content/engine/prompts/ideas.ts`, `.env.local`'s `CONTENT_ENGINE_SECRET`.

- [ ] **Step 1: Write the Plaud companion**

`.claude/skills/content-plaud/SKILL.md`:

```markdown
---
name: content-plaud
description: Mine one Plaud recording into content ideas right now, without waiting for the overnight routine. Use when Miguel says "/content-plaud", "mine that Plaud recording", "I just recorded something on Plaud", or names a Plaud recording he wants ideas from.
---

# Mine one Plaud recording now

The immediate path for the content engine. The overnight routine
(`routines/content-daily.md`) will do this tomorrow; this does it now.

## Inputs

- `CONTENT_ENGINE_SECRET` from `.env.local` in this repo:
  `grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-`.
- `CONTENT_API_BASE`: `https://amplificawealth.com` unless Miguel says local.
- The Plaud connector (`list_files`, `get_transcript`, `get_note`).

## Steps

1. If Miguel did not name a recording, call `list_files` (last 7 days) and show
   the titles with dates and durations; ask which one. One question, then go.
2. Read it: `get_transcript` block `mark_memo` (highlights) first, then
   `transaction_polish` paged to the end, then `get_note`.
3. Read `src/features/content/engine/prompts/ideas.ts` and generate up to 10
   ideas from this one recording per those rules. Highlighted moments rank first.
   Fetch `GET $CONTENT_API_BASE/api/content/context` first and honor
   `taste_rules`, `recent_feedback`, and `known_titles`.
4. Build one ingest body: the single source with `kind: "plaud"`,
   `external_id` = the Plaud file id, `status: "allowed"`, `mined_at` = now,
   `meta: { has_highlights, duration_s }`; the ideas with `source_ref` pointing
   at it; `run: { kind: "local", started_at }`. POST it to
   `$CONTENT_API_BASE/api/content/ingest` with the bearer.
5. Report: how many ideas landed, and the link `$CONTENT_API_BASE/content`.
   No ClickUp digest; Miguel is here.

Never read a recording Miguel did not pick.
```

- [ ] **Step 2: Write the daily companion**

`.claude/skills/content-daily/SKILL.md`:

```markdown
---
name: content-daily
description: Run the content engine's daily idea routine from this Mac instead of the cloud. Use when Miguel says "/content-daily", "run the content routine now", or the cloud routine is paused or failed.
---

# Run the daily routine locally

Read `routines/content-daily.md` and do exactly what it says, with two
substitutions:

- `CONTENT_ENGINE_SECRET` comes from `.env.local`:
  `grep '^CONTENT_ENGINE_SECRET=' .env.local | cut -d= -f2-`.
- `CONTENT_API_BASE` is `https://amplificawealth.com` unless Miguel says local.

The connectors it names (Granola, Wispr-Flow, Plaud, ClickUp) are the same
ones attached to this session. Post the ClickUp digest as the file says, then
tell Miguel what landed.
```

- [ ] **Step 3: Confirm the files are picked up and commit**

Run: `ls .claude/skills && pnpm test`
Expected: both folders listed; tests unaffected.

```bash
git add .claude/skills/content-plaud/SKILL.md .claude/skills/content-daily/SKILL.md
git commit -m "feat(content): local companions to mine a Plaud recording or run the daily routine

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Docs and build

**Files:**
- Modify: `src/features/content/CLAUDE.md`
- Modify: `docs/PRODUCT-STATUS.md`

- [ ] **Step 1: Update the feature CLAUDE.md**

Add to the Map section:

```markdown
- `engine/prompts/ideas.ts` — the generation rules. The daily routine reads it
  from its checkout; PR 4 uses it as a Claude system prompt. `ideas.test.ts`
  asserts it names every ingest field.
- `data/clickup.ts` — task per liked idea, best effort, healed on the next Like.
- `routines/` (repo root) — routine instructions and README; `.claude/skills/`
  holds the local companions `/content-plaud` and `/content-daily`.
```

Add to Invariants:

```markdown
- The routine never opens a `denied` or `pending` source; deny rules win.
- Ingest returns the rows it wrote; the digest links to `/content/ideas/<id>`.
- The context's `known_titles` covers every idea status, so a passed idea does
  not come back as new.
```

Replace the seed note's sentence about dedupe with: "Ideas are deduplicated by the routine against `known_titles`, not by ingest, so running this twice inserts the two example ideas twice."

- [ ] **Step 2: Update PRODUCT-STATUS env vars**

In the **Env vars** sentence, add `CLICKUP_API_TOKEN` + `CLICKUP_TASK_LIST_ID` (ClickUp mirror of liked ideas).

- [ ] **Step 3: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/content/CLAUDE.md docs/PRODUCT-STATUS.md
git commit -m "docs(content): PR 2 map, invariants, env vars

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After merge (controller and owner, not an executor task)

1. Vercel: add `CLICKUP_API_TOKEN` (personal token from ClickUp → Settings → Apps) and `CLICKUP_TASK_LIST_ID=901113803092`. Redeploy.
2. claude.ai/code environment: add `CONTENT_API_BASE=https://amplificawealth.com` and `CONTENT_ENGINE_SECRET=<same value as Vercel>`.
3. Create the routine (RemoteTrigger): name "Content engine: daily ideas", cron `0 11 * * *`, model `claude-opus-5`, repo `https://github.com/Ocelomeh89/amplifica`, connectors Granola, Wispr-Flow, Plaud, ClickUp, allowed tools Bash, Read, Glob, Grep; message: "Read routines/content-daily.md in this checkout and do exactly what it says."
4. Run it once; read the run log; check the ClickUp channel and `/content`. Like one idea and confirm a task appears in Task Tracking.
