import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseRecreateDb } from "./supabase-recreate-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

/** A query builder that logs every call and answers per table. */
function fakeClient(tables: Record<string, { data?: unknown; error?: { code?: string; message: string } | null; count?: number }> = {}) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? {};
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: res.data ?? [], error: res.error ?? null, count: res.count ?? 0 }).then(ok),
      };
      for (const m of ["select", "eq", "in", "lt", "gte", "order", "limit", "update", "insert", "range"]) {
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

const ROW = { id: "r1", source_post_id: "p1", mode: "same-recipe", status: "ready", options: [], error: "", idea_id: null, created_at: "2026-10-26T15:00:00Z" };

describe("supabaseRecreateDb", () => {
  it("claim updates only a ready row, scoped to the owner, and returns it", async () => {
    const { client, log } = fakeClient({ content_recreations: { data: [ROW] } });
    const row = await supabaseRecreateDb(client, "u1").claim("r1", 2);
    expect(row?.id).toBe("r1");
    expect(log).toContainEqual(["content_recreations.update", { status: "picked", picked_index: 2 }]);
    expect(log).toContainEqual(["content_recreations.eq", "status", "ready"]);
    expect(log).toContainEqual(["content_recreations.eq", "user_id", "u1"]);
  });

  it("claim returns null when no row matched", async () => {
    const { client } = fakeClient({ content_recreations: { data: [] } });
    expect(await supabaseRecreateDb(client, "u1").claim("r1", 0)).toBeNull();
  });

  it("finish writes only while the row is pending", async () => {
    const { client, log } = fakeClient();
    await supabaseRecreateDb(client, "u1").finish("r1", { status: "failed", error: "boom" });
    expect(log).toContainEqual(["content_recreations.update", { status: "failed", error: "boom" }]);
    expect(log).toContainEqual(["content_recreations.eq", "status", "pending"]);
    expect(log).toContainEqual(["content_recreations.eq", "user_id", "u1"]);
  });

  it("expireStale fails only this post's old pending rows", async () => {
    const { client, log } = fakeClient();
    await supabaseRecreateDb(client, "u1").expireStale("p1", "2026-10-26T14:50:00.000Z");
    expect(log).toContainEqual(["content_recreations.update", { status: "failed", error: "Timed out" }]);
    expect(log).toContainEqual(["content_recreations.eq", "source_post_id", "p1"]);
    expect(log).toContainEqual(["content_recreations.eq", "status", "pending"]);
    expect(log).toContainEqual(["content_recreations.lt", "created_at", "2026-10-26T14:50:00.000Z"]);
  });

  it("discard is limited to ready and failed rows and reports whether one matched", async () => {
    const hit = fakeClient({ content_recreations: { data: [{ id: "r1" }] } });
    expect(await supabaseRecreateDb(hit.client, "u1").discard("r1")).toBe(true);
    expect(hit.log).toContainEqual(["content_recreations.in", "status", ["ready", "failed"]]);
    const miss = fakeClient({ content_recreations: { data: [] } });
    expect(await supabaseRecreateDb(miss.client, "u1").discard("r1")).toBe(false);
  });

  it("insertPending returns null on a unique violation and throws on other errors", async () => {
    const dup = fakeClient({ content_recreations: { error: { code: "23505", message: "dup" } } });
    expect(await supabaseRecreateDb(dup.client, "u1").insertPending("p1", "adjacent")).toBeNull();
    const bad = fakeClient({ content_recreations: { error: { code: "XX", message: "down" } } });
    await expect(supabaseRecreateDb(bad.client, "u1").insertPending("p1", "adjacent")).rejects.toThrow(/down/);
  });

  it("insertPending returns the new id", async () => {
    const { client, log } = fakeClient({ content_recreations: { data: [{ id: "new1" }] } });
    expect(await supabaseRecreateDb(client, "u1").insertPending("p1", "adjacent")).toBe("new1");
    expect(log).toContainEqual(["content_recreations.insert", { user_id: "u1", source_post_id: "p1", mode: "adjacent" }]);
  });

  it("insertIdea writes a reel idea for the owner with the source post", async () => {
    const { client, log } = fakeClient({ content_ideas: { data: [{ id: "i1" }] } });
    const id = await supabaseRecreateDb(client, "u1").insertIdea({
      format: "reel", title: "T", hook: "H", belief_attacked: "", value_to_listener: "", why_it_stops: "Topic: x",
      outline: [], quote: "", quote_ref: "", pillar: "", hook_type: "question", score: 1, batch_date: "2026-10-26",
      source_post_id: "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10",
    });
    expect(id).toBe("i1");
    const insert = log.find((c) => c[0] === "content_ideas.insert")![1] as Record<string, unknown>;
    expect(insert).toMatchObject({ user_id: "u1", format: "reel", score: 1, status: "inbox", source_post_id: "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10" });
    expect(insert).not.toHaveProperty("chain_key");
  });

  it("every read filters by the owner", async () => {
    const { client, log } = fakeClient({ content_recreations: { data: [ROW], count: 3 } });
    const db = supabaseRecreateDb(client, "u1");
    await db.get("r1");
    await db.live("p1", "adjacent");
    expect(await db.countSince("2026-10-26T05:00:00.000Z")).toBe(3);
    await db.sourceBasics("p1");
    const eqs = log.filter((c) => c[0].endsWith(".eq") && c[1] === "user_id");
    expect(eqs.length).toBeGreaterThanOrEqual(4);
  });

  it("sourceContext joins insights, figures and recent hooks, and returns null for a missing post", async () => {
    const post = {
      id: "p1", platform: "instagram", format: "reel", media_type: "reel", thumbnail_url: "", pillar: "method", hook_type: "question",
      hook_used: "", caption: "Cap", url: "u", idea_id: null, posted_at: "2026-10-20T00:00:00Z", onscreen_text: "", message: "velocity",
      cta_type: "", post_style: "talking-head-text", cover_face: true, cover_text: null, cover_number: null, hook_spoken: "Spoken", hook_onscreen: "",
      tag_confidence: {}, tag_locks: [], tagged_at: "2026-10-21T00:00:00Z",
    };
    const { client } = fakeClient({
      content_posts: { data: [post] },
      content_metrics: { data: [] },
      content_ideas: { data: [{ hook: "Inbox hook" }] },
    });
    const ctx = await supabaseRecreateDb(client, "u1").sourceContext("p1", new Date("2026-10-26T15:00:00Z"));
    expect(ctx?.post).toMatchObject({ id: "p1", hook_type: "question", pillar: "method" });
    expect(ctx?.source.hook_spoken).toBe("Spoken");
    expect(ctx?.insights.state).toBe("thin");
    expect(ctx?.recentHooks).toEqual(expect.arrayContaining(["Inbox hook", "Spoken"]));
    expect(await supabaseRecreateDb(client, "u1").sourceContext("nope", new Date())).toBeNull();
  });
});
