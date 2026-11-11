import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseBackfillDb, supabaseDigestDb, supabaseGateDb } from "./supabase-gate-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(data: unknown = []) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      log.push([`${table}.from`]);
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "is", "not", "order", "limit", "update", "maybeSingle", "neq"]) {
        b[m] = (...args: unknown[]) => {
          log.push([`${table}.${m}`, ...args]);
          return b;
        };
      }
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log };
}

const result = { verdict: "pass" as const, reader: "daniel" as const, pillar: "w2-advantage" as const, amplifica_pillar: "the-numbers" as const, failed: [] };
const idea = { id: "i1", format: "reel", title: "T", hook: "H", belief_attacked: "B", value_to_listener: "V", why_it_stops: "W", outline: [{ beat: "a", note: "n" }], gate_attempts: 2 };
const updates = (log: Call[]) => log.filter((c) => c[0] === "content_ideas.update").map((c) => c[1] as Record<string, unknown>);

describe("supabaseGateDb", () => {
  it("filters every read and write by the owner and only touches gating rows", async () => {
    const { client, log } = fakeClient([{ gate_attempts: 2 }]);
    const db = supabaseGateDb(client, "u1");
    await db.gatingIdeas(5);
    await db.applyPass("i1", { status: "passed", fields: {}, rewritten: false, result, original: {} }, idea);
    await db.applyFail("i1", { status: "failed", result: { ...result, verdict: "fail" }, original: {} });
    await db.bumpAttempt(idea, "down");
    expect(log.filter((c) => c[0] === "content_ideas.from").length).toBe(log.filter((c) => c[0] === "content_ideas.eq" && c[1] === "user_id" && c[2] === "u1").length);
    expect(log.filter((c) => c[0] === "content_ideas.eq" && c[1] === "status" && c[2] === "gating").length).toBe(4);
  });

  it("a plain pass sets inbox, the pillar and the gate record, and no text", async () => {
    const { client, log } = fakeClient();
    await supabaseGateDb(client, "u1").applyPass("i1", { status: "passed", fields: {}, rewritten: false, result, original: {} }, idea);
    const [u] = updates(log);
    expect(u).toMatchObject({ status: "inbox", pillar: "w2-advantage", gate: { result, rewritten: false } });
    expect(u.hook).toBeUndefined();
    expect(u.gate_original).toBeUndefined();
  });

  it("a rewritten pass writes the new text and keeps the original", async () => {
    const { client, log } = fakeClient();
    const fields = { title: "T2", hook: "H2", belief_attacked: "B2", value_to_listener: "V2", why_it_stops: "W2", outline: ["x"] };
    await supabaseGateDb(client, "u1").applyPass("i1", { status: "passed", fields, rewritten: true, result, original: { hook: "H" } }, idea);
    const [u] = updates(log);
    expect(u).toMatchObject({ status: "inbox", hook: "H2", hook_alt: "H", outline: [{ beat: "x", note: "n" }], gate_original: { hook: "H" } });
  });

  it("a fail sets gate_failed and bumpAttempt increments the count", async () => {
    const { client, log } = fakeClient([{ gate_attempts: 2 }]);
    const db = supabaseGateDb(client, "u1");
    await db.applyFail("i1", { status: "failed", result: { ...result, verdict: "fail" }, original: {} });
    await db.bumpAttempt(idea, "down");
    await db.giveUp(idea, "down");
    const [f, b, g] = updates(log);
    expect(f).toMatchObject({ status: "gate_failed", gate: { prior_status: "gating" } });
    expect(b).toEqual({ gate_attempts: 3 });
    expect(log).toContainEqual(["content_ideas.eq", "gate_attempts", 2]);
    expect(g).toMatchObject({ status: "gate_failed", gate_attempts: 3, gate: { error: "The brand check could not run (3 tries): down" } });
  });
});

describe("supabaseDigestDb", () => {
  it("groups undigested batch ideas with their source kind, all filtered by the owner", async () => {
    const rows = [
      { id: "a", format: "reel", hook: "h", status: "inbox", ingest_batch: "b1", source_id: "s1" },
      { id: "b", format: "reel", hook: "h", status: "gating", ingest_batch: "b1", source_id: null },
    ];
    const log: Call[] = [];
    const client = {
      from(table: string) {
        log.push([`${table}.from`]);
        const data = table === "content_sources" ? [{ id: "s1", kind: "url" }] : rows;
        const b: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) };
        for (const m of ["select", "eq", "in", "is", "not", "update"]) b[m] = (...args: unknown[]) => (log.push([`${table}.${m}`, ...args]), b);
        return b;
      },
    } as unknown as SupabaseClient<Database>;
    const db = supabaseDigestDb(client, "u1");
    expect(await db.openBatches()).toEqual([
      { batch: "b1", ideas: [{ id: "a", format: "reel", hook: "h", status: "inbox", source_kind: "url" }, { id: "b", format: "reel", hook: "h", status: "gating", source_kind: null }] },
    ]);
    await db.markDigested("b1", "2026-11-11T12:00:00Z");
    const froms = log.filter((c) => c[0].endsWith(".from")).length;
    expect(log.filter((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1").length).toBe(froms);
    expect(log).toContainEqual(["content_ideas.update", { digest_posted_at: "2026-11-11T12:00:00Z" }]);
  });
});

describe("supabaseBackfillDb", () => {
  function tableClient(tables: Record<string, unknown[]>) {
    const log: Call[] = [];
    const client = {
      from(table: string) {
        const b: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok) };
        for (const m of ["select", "eq", "in", "is", "order", "limit", "update"]) b[m] = (...args: unknown[]) => (log.push([`${table}.${m}`, ...args]), b);
        return b;
      },
    } as unknown as SupabaseClient<Database>;
    return { client, log };
  }
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, format: "reel", title: "T", hook: "H", belief_attacked: "", value_to_listener: "", why_it_stops: "", outline: [], status: "inbox", queue_rank: null, obsidian_path: null, ...over });

  it("finds never-checked Inbox and queued ideas and flags the held ones", async () => {
    const { client, log } = tableClient({
      content_ideas: [row("a"), row("b", { obsidian_path: "C - Writing/x.md" }), row("c"), row("d")],
      content_drafts: [{ idea_id: "c" }],
      content_experiments: [{ idea_id: "d" }],
    });
    const out = await supabaseBackfillDb(client, "u1").candidates(25);
    expect(out.map((i) => [i.id, i.held])).toEqual([["a", false], ["b", true], ["c", true], ["d", true]]);
    expect(log).toContainEqual(["content_ideas.is", "gate", null]);
    expect(log).toContainEqual(["content_ideas.in", "status", ["inbox", "queued"]]);
    expect(log).toContainEqual(["content_experiments.in", "status", ["open", "posted"]]);
    expect(log.filter((c) => c[0].endsWith(".eq") && c[1] === "user_id" && c[2] === "u1")).toHaveLength(3);
  });

  it("a fail moves the idea to gate_failed, clears its rank and remembers its old status", async () => {
    const { client, log } = tableClient({});
    const result = { verdict: "fail" as const, reader: null, pillar: null, amplifica_pillar: null, failed: [] };
    await supabaseBackfillDb(client, "u1").applyFail({ ...row("a", { status: "queued", queue_rank: 3 }), held: false } as never, { status: "failed", result, original: {} });
    const u = log.find((c) => c[0] === "content_ideas.update")![1] as Record<string, unknown>;
    expect(u).toMatchObject({ status: "gate_failed", queue_rank: null, gate: { prior_status: "queued" } });
    expect(log).toContainEqual(["content_ideas.is", "gate", null]);
  });

  it("a pass keeps the status and rank and writes the gate", async () => {
    const { client, log } = tableClient({});
    await supabaseBackfillDb(client, "u1").applyPass({ ...row("a", { status: "queued", queue_rank: 3 }), held: false } as never, { status: "passed", fields: {}, rewritten: false, result, original: {} });
    const u = log.find((c) => c[0] === "content_ideas.update")![1] as Record<string, unknown>;
    expect(u.status).toBeUndefined();
    expect(u.queue_rank).toBeUndefined();
    expect(u).toMatchObject({ pillar: "w2-advantage", gate: { result } });
  });
});
