import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseDiscoveryDb } from "./supabase-discovery-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, { data?: unknown; error?: { code?: string; message: string } | null }> = {}) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? {};
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: res.data ?? [], error: res.error ?? null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "is", "lt", "gte", "order", "limit", "update", "insert", "upsert", "delete"]) {
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

describe("supabaseDiscoveryDb", () => {
  it("every query filters by the owner", async () => {
    const { client, log } = fakeClient({ content_creators: { data: [{ id: "c1", username: "u", status: "declined", decline_reason: "x", decided_at: "t" }] }, content_discovery_runs: { data: [{ id: "r1" }] } });
    const db = supabaseDiscoveryDb(client, "u1");
    const at = "2026-11-16T12:00:00Z";
    const calls: [string, () => Promise<unknown>][] = [
      ["creators", () => db.creators()],
      ["candidates", () => db.candidates(["sampled"])],
      ["candidatesByUsername", () => db.candidatesByUsername(["a"])],
      ["setCandidate", () => db.setCandidate("k1", "sampled", { outcome: "quiet" }, at)],
      ["runsForWeek", () => db.runsForWeek("2026-11-16")],
      ["pendingRuns", () => db.pendingRuns()],
      ["updateRun", () => db.updateRun("r1", { status: "ready" })],
      ["lapse", () => db.lapse("c1", "u", at)],
      ["decide", () => db.decide("c1", "watching", "", at)],
      ["declines", () => db.declines(20)],
      ["callsSince", () => db.callsSince("button", at)],
    ];
    for (const [name, call] of calls) {
      const before = log.length;
      await call();
      const used = log.slice(before);
      const tables = new Set(used.map((c) => c[0].split(".")[0]));
      for (const t of tables) expect(used, `${name} on ${t}`).toContainEqual([`${t}.eq`, "user_id", "u1"]);
    }
  });

  it("inserts carry the owner", async () => {
    const { client, log } = fakeClient({ content_discovery_runs: { data: [{ id: "r9" }] } });
    const db = supabaseDiscoveryDb(client, "u1");
    expect(await db.insertRun({ week_start: "2026-11-16", kind: "gather", apify_run_id: "a", usernames: ["x"], status: "pending", cap_usd: 0.3, items: null, started_at: "t" })).toBe("r9");
    await db.logCall("cron", "note", "2026-11-16T12:00:00Z");
    await db.upsertCandidates([{ username: "a", outcome: "gathered" }], "2026-11-16T12:00:00Z");
    const inserted = log.find((c) => c[0] === "content_discovery_runs.insert")!;
    expect(inserted[1]).toMatchObject({ user_id: "u1", kind: "gather" });
    expect(log.find((c) => c[0] === "content_discovery_calls.insert")![1]).toMatchObject({ user_id: "u1", trigger: "cron", note: "note" });
    const up = log.find((c) => c[0] === "content_creator_candidates.upsert")!;
    expect((up[1] as Record<string, unknown>[])[0]).toMatchObject({ user_id: "u1", username: "a", outcome: "gathered", reason: "", sample: [], attempts: 0 });
    expect(up[2]).toEqual({ onConflict: "user_id,username" });
  });

  it("decide and lapse write only while the row is suggested", async () => {
    const { client, log } = fakeClient({ content_creators: { data: [{ id: "c1" }] } });
    const db = supabaseDiscoveryDb(client, "u1");
    expect(await db.decide("c1", "declined", "too salesy", "2026-11-16T12:00:00Z")).toBe(true);
    await db.lapse("c1", "u", "2026-11-16T12:00:00Z");
    expect(log.filter((c) => c[0] === "content_creators.eq" && c[1] === "status" && c[2] === "suggested")).toHaveLength(2);
    expect(log.find((c) => c[0] === "content_creators.update")![1]).toMatchObject({ status: "declined", decline_reason: "too salesy", decided_at: "2026-11-16T12:00:00Z" });
    // The candidate only turns `lapsed` when the creator row was really deleted.
    expect(log.find((c) => c[0] === "content_creator_candidates.update")![1]).toMatchObject({ outcome: "lapsed", reason: "Not answered in 4 weeks" });
  });

  it("decide answers false when no row was suggested any more", async () => {
    const { client } = fakeClient({ content_creators: { data: [] } });
    expect(await supabaseDiscoveryDb(client, "u1").decide("c1", "watching", "", "t")).toBe(false);
  });

  it("a lapse that finds no suggested row leaves the candidate alone", async () => {
    const { client, log } = fakeClient({ content_creators: { data: [] } });
    await supabaseDiscoveryDb(client, "u1").lapse("c1", "u", "t");
    expect(log.some((c) => c[0] === "content_creator_candidates.update")).toBe(false);
  });

  it("setCandidate writes only while the outcome is still the expected one", async () => {
    const { client, log } = fakeClient({ content_creator_candidates: { data: [{ id: "k1" }] } });
    expect(await supabaseDiscoveryDb(client, "u1").setCandidate("k1", "sampled", { outcome: "fit" }, "t")).toBe(true);
    expect(log).toContainEqual(["content_creator_candidates.eq", "outcome", "sampled"]);
    const { client: none } = fakeClient({ content_creator_candidates: { data: [] } });
    expect(await supabaseDiscoveryDb(none, "u1").setCandidate("k1", "sampled", { outcome: "fit" }, "t")).toBe(false);
  });

  it("suggest reports false when the username exists", async () => {
    const written = fakeClient({ content_creators: { data: [{ id: "c9" }] } });
    expect(await supabaseDiscoveryDb(written.client, "u1").suggest("new.one", "2026-11-16T12:00:00Z")).toBe(true);
    const call = written.log.find((c) => c[0] === "content_creators.upsert")!;
    expect(call[1]).toMatchObject({ user_id: "u1", platform: "instagram", username: "new.one", status: "suggested", suggested_at: "2026-11-16T12:00:00Z" });
    expect(call[2]).toEqual({ onConflict: "user_id,platform,username", ignoreDuplicates: true });
    const dup = fakeClient({ content_creators: { data: [] } });
    expect(await supabaseDiscoveryDb(dup.client, "u1").suggest("taken", "t")).toBe(false);
  });

  it("declines come newest first with the candidate's bio", async () => {
    const { client, log } = fakeClient({
      content_creators: { data: [{ username: "a", decline_reason: "too salesy" }] },
      content_creator_candidates: { data: [{ username: "a", bio: "buy my course" }] },
    });
    expect(await supabaseDiscoveryDb(client, "u1").declines(20)).toEqual([{ username: "a", bio: "buy my course", reason: "too salesy" }]);
    expect(log).toContainEqual(["content_creators.eq", "status", "declined"]);
    expect(log).toContainEqual(["content_creators.limit", 20]);
  });
});
