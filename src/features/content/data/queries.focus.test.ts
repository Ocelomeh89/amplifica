import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { EMPTY_FOCUS, type ActiveFocus } from "@/features/content/engine/focus";
import { loadInbox, loadQueued, loadUnused } from "./queries";

vi.mock("server-only", () => ({}));

function fakeClient(tables: Record<string, unknown[]>) {
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "gte", "order", "limit", "neq"]) b[m] = () => b;
      return b;
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const idea = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: "inbox", format: "reel", hook_type: "promise", topic: "", batch_date: daysAgo(2).slice(0, 10), feedback_at: null,
  created_at: daysAgo(2), inbox_since: null, source_id: null, chain_id: null, ...over,
});
const SKIP_PROMISE: ActiveFocus = { ...EMPTY_FOCUS, skip: { hook_type: ["promise"], topic: [] } };

describe("the skip list in the Inbox and Never used", () => {
  it("loadInbox counts hidden ideas and does not return them", async () => {
    const db = fakeClient({ content_ideas: [idea("hidden"), idea("old-hidden", { batch_date: daysAgo(40).slice(0, 10) }), idea("shown", { hook_type: "question" }), idea("news", { format: "newsletter" })] });
    const r = await loadInbox(db, "u1", SKIP_PROMISE);
    expect(r.ideas.map((i) => i.id)).toEqual(["shown", "news"]);
    expect(r.hidden).toBe(2);
  });

  it("with an empty skip list nothing is hidden", async () => {
    const r = await loadInbox(fakeClient({ content_ideas: [idea("a")] }), "u1", EMPTY_FOCUS);
    expect(r.ideas).toHaveLength(1);
    expect(r.hidden).toBe(0);
  });

  it("a hidden idea is not listed in Never used", async () => {
    const old = { batch_date: daysAgo(40).slice(0, 10) };
    const db = fakeClient({ content_ideas: [idea("hidden", old), idea("visible-old", { ...old, hook_type: "question" })] });
    const r = await loadUnused(db, "u1", SKIP_PROMISE);
    expect(r.ideas.map((i) => i.id)).toEqual(["visible-old"]);
  });

  it("a queued Reel idea with a skipped hook stays in the queue and in Never used", async () => {
    const queued = idea("q", { status: "queued", feedback_at: daysAgo(40), batch_date: daysAgo(60).slice(0, 10) });
    const fresh = idea("q2", { status: "queued", feedback_at: daysAgo(3) });
    const db = fakeClient({ content_ideas: [queued, fresh] });
    expect((await loadQueued(db, "u1")).map((i) => i.id)).toEqual(["q2"]);
    expect((await loadUnused(db, "u1", SKIP_PROMISE)).ideas.map((i) => i.id)).toEqual(["q"]);
  });

  it("after Bring back the idea returns to the Inbox with a fresh clock", async () => {
    const old = idea("back", { batch_date: daysAgo(100).slice(0, 10), inbox_since: new Date().toISOString() });
    const db = fakeClient({ content_ideas: [old] });
    const r = await loadInbox(db, "u1", EMPTY_FOCUS);
    expect(r.ideas.map((i) => i.id)).toEqual(["back"]);
    expect((await loadUnused(db, "u1", EMPTY_FOCUS)).ideas).toEqual([]);
  });
});
