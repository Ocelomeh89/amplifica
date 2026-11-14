import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import type { Question } from "@/features/content/engine/test-lab-picker";
import { supabaseTestsDb } from "./supabase-tests-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];
type Table = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

function fakeClient(tables: Record<string, Table> = {}) {
  const log: Call[] = [];
  const chains: Call[][] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? {};
      const chain: Call[] = [];
      chains.push(chain);
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: res.data ?? [], error: res.error ?? null, count: res.count ?? 0 }).then(ok),
      };
      for (const m of ["select", "eq", "neq", "in", "is", "not", "lt", "gte", "lte", "order", "limit", "update", "insert", "upsert", "delete", "range"]) {
        b[m] = (...args: unknown[]) => {
          log.push([`${table}.${m}`, ...args]);
          chain.push([`${table}.${m}`, ...args]);
          return b;
        };
      }
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log, chains };
}

const NOW = new Date("2026-11-16T15:00:00Z");
const q: Question = { rule: 5, kind: "opening", variable: "hook_type", a: "ranking", b: "question", held: { topic: "debt", pillar: "w2-advantage" }, ideaIds: ["i1"], reason: "r" };

describe("supabaseTestsDb", () => {
  it("every query filters by the owner", async () => {
    const { client, chains } = fakeClient({ content_tests: { data: [{ id: "t1", status: "open", created_at: "2026-11-16T00:00:00Z" }] } });
    const db = supabaseTestsDb(client, "u1");
    await db.expireStale("2026-11-16T14:50:00Z");
    await db.live();
    await db.countSince("2026-11-16T06:00:00Z");
    await db.insertProposing("button");
    await db.pickerInput(NOW);
    await db.writerContext(q);
    await db.failTest("t1", "boom", []);
    await db.get("t1");
    await db.close("t1", "skipped", "reason");
    await db.openTests();
    await db.saveTyped("t1", "a", { views: 1, saves: null, shares: null, link: "" });
    await db.median24h(NOW);
    await db.labels();
    await db.judge("t1", { verdict: "a", verdict_line: "l", judged_at: NOW.toISOString(), versions: [{ label: "a", views_24h: 1, saves_24h: null, shares_24h: null, read_at: NOW.toISOString(), promote: false }] });
    await db.pendingEffects();
    await db.useIdea("i1", null);
    await db.markEffects("t1", NOW.toISOString());
    await db.withoutConclusion();
    await db.setConclusion("t1", "Two sentences.");
    // Every query chain is scoped to the owner: a user_id filter, or an insert that carries the owner.
    expect(chains.length).toBeGreaterThan(10);
    for (const chain of chains) {
      const scoped = chain.some((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1");
      const inserts = chain.some((c) => c[0].endsWith(".insert") && JSON.stringify(c[1]).includes('"user_id":"u1"'));
      expect(scoped || inserts, JSON.stringify(chain.map((c) => c[0]))).toBe(true);
    }
  });

  it("insertProposing returns null on the one-live-test conflict", async () => {
    const { client } = fakeClient({ content_tests: { error: { code: "23505", message: "duplicate" } } });
    expect(await supabaseTestsDb(client, "u1").insertProposing("routine")).toBeNull();
  });

  it("openTest and failTest only touch a proposing row", async () => {
    const { client, log } = fakeClient({ content_tests: { data: [] } });
    const db = supabaseTestsDb(client, "u1");
    const opened = await db.openTest("t1", { kind: "opening", variable: "hook_type", value_a: "a", value_b: "b", held: { pillar: "p" }, rule: 5, question: "q", reason: "r", why: "w", notes: { record_once: "", record_twice: "", cuts: "" }, dropped: [], opened_at: NOW.toISOString() }, []);
    expect(opened).toBe(false);
    await db.failTest("t1", "boom", []);
    const conditions = log.filter((c) => c[0] === "content_tests.eq" && c[1] === "status");
    expect(conditions.length).toBeGreaterThanOrEqual(2);
    expect(conditions.every((c) => c[2] === "proposing")).toBe(true);
  });

  it("judge, saveTyped and useIdea only touch what they should", async () => {
    const { client, log } = fakeClient({ content_tests: { data: [] } });
    const db = supabaseTestsDb(client, "u1");
    expect(await db.saveTyped("t1", "a", { views: 1, saves: null, shares: null, link: "" })).toBe(false);
    expect(await db.judge("t1", { verdict: "a", verdict_line: "l", judged_at: NOW.toISOString(), versions: [] })).toBe(false);
    await db.useIdea("i1", null);
    expect(log).toContainEqual(["content_tests.eq", "status", "open"]);
    expect(log).toContainEqual(["content_ideas.update", { status: "archived" }]);
    expect(log).toContainEqual(["content_ideas.in", "status", ["inbox", "queued"]]);
    await expect(db.useIdea("i1", "p1")).rejects.toThrow(/not built/);
  });

  it("close only closes an open test", async () => {
    const { client, log } = fakeClient({ content_tests: { data: [] } });
    expect(await supabaseTestsDb(client, "u1").close("t1", "not_run", "No post was linked within 14 days.")).toBe(false);
    expect(log).toContainEqual(["content_tests.eq", "status", "open"]);
  });

  it("the picker's ideas leave out ideas on a live test and ideas Today ever briefed", async () => {
    const idea = (id: string, topic: string) => ({ id, title: "t", hook: "h", pillar: "w2-advantage", status: "inbox", hook_type: "", topic });
    const { client } = fakeClient({
      content_ideas: { data: [idea("i1", "debt"), idea("i2", "credit"), idea("i3", "paycheck")] },
      content_experiments: { data: [{ idea_id: "i1" }] },
      content_tests: { data: [{ id: "t1" }] },
      content_test_versions: { data: [{ idea_id: "i2" }] },
      content_topics: { data: [{ slug: "debt", label: "Debt", pillar: "w2-advantage" }] },
    });
    const input = await supabaseTestsDb(client, "u1").pickerInput(NOW);
    expect(input.ideas.map((i) => i.id)).toEqual(["i3"]);
  });
});
