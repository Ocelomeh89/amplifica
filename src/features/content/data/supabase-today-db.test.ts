import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseTodayDb } from "./supabase-today-db";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, { data?: unknown; error?: { code?: string; message: string } | null; count?: number }> = {}) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const res = tables[table] ?? {};
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: res.data ?? [], error: res.error ?? null, count: res.count ?? 0 }).then(ok),
      };
      for (const m of ["select", "eq", "in", "is", "lt", "gte", "order", "limit", "update", "insert", "upsert", "range"]) {
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

describe("supabaseTodayDb", () => {
  it("filters every read by the owner", async () => {
    const { client, log } = fakeClient();
    const db = supabaseTodayDb(client, "u1");
    await db.liveTests();
    await db.liveSlots("2026-10-27");
    await db.openBefore("2026-10-27");
    await db.runFor("2026-10-27", "cron");
    await db.countRunsSince("2026-10-27T05:00:00Z");
    const tables = ["content_experiments.eq", "content_today_runs.eq"];
    for (const t of tables) expect(log.filter((c) => c[0] === t && c[1] === "user_id").length).toBeGreaterThan(0);
    const selects = log.filter((c) => c[0].endsWith(".select")).length;
    const owners = log.filter((c) => c[1] === "user_id" && c[2] === "u1").length;
    expect(owners).toBe(selects);
  });

  it("insertRun returns null on the cron unique conflict", async () => {
    const { client } = fakeClient({ content_today_runs: { error: { code: "23505", message: "duplicate" } } });
    expect(await supabaseTodayDb(client, "u1").insertRun({ day: "2026-10-27", kind: "cron" })).toBeNull();
  });

  it("countRunsSince counts only swap and moment runs", async () => {
    const { client, log } = fakeClient({ content_today_runs: { count: 3 } });
    expect(await supabaseTodayDb(client, "u1").countRunsSince("2026-10-27T05:00:00Z")).toBe(3);
    expect(log).toContainEqual(["content_today_runs.in", "kind", ["swap", "moment", "makenow"]]);
  });

  it("patchIdea touches only an Inbox or queued idea and returns null when none matched", async () => {
    const { client, log } = fakeClient({ content_ideas: { data: [] } });
    const out = await supabaseTodayDb(client, "u1").patchIdea("i1", { hook: "h", hook_alt: "o", hook_type: "", title: "t", outline: [], status: "queued", score: 1 });
    expect(out).toBeNull();
    expect(log).toContainEqual(["content_ideas.in", "status", ["inbox", "queued"]]);
    expect(log).toContainEqual(["content_ideas.eq", "user_id", "u1"]);
  });

  it("unclaimedInboxIdeas excludes every idea that ever had an experiment, not only live ones", async () => {
    const { client, log } = fakeClient({ content_experiments: { data: [{ idea_id: "i1" }] }, content_ideas: { data: [{ id: "i1", title: "t", hook: "h", pillar: "", hook_alt: null, status: "inbox" }, { id: "i2", title: "t", hook: "h", pillar: "", hook_alt: null, status: "inbox" }] } });
    const out = await supabaseTodayDb(client, "u1").unclaimedInboxIdeas(5);
    expect(out.map((i) => i.id)).toEqual(["i2"]);
    expect(log.some((c) => c[0] === "content_experiments.in" && c[1] === "status")).toBe(false);
  });

  it("page reports today's failed swap and moment runs, newest first, and not the make-now counters", async () => {
    const run = (id: string, kind: string, status: string) => ({ id, day: "2026-10-27", kind, status, experiment_id: null, error: "boom", created_at: "2026-10-27T15:00:00Z" });
    const { client } = fakeClient({ content_today_runs: { data: [run("a", "moment", "failed"), run("b", "makenow", "failed"), run("c", "cron", "failed"), run("d", "swap", "ready")] } });
    const page = await supabaseTodayDb(client, "u1").page("2026-10-27", new Date("2026-10-27T15:05:00Z"));
    expect(page.failedRuns.map((r) => r.id)).toEqual(["a"]);
    expect(page.cronRun?.id).toBe("c");
  });

  it("returnToInbox only moves a queued idea", async () => {
    const { client, log } = fakeClient();
    await supabaseTodayDb(client, "u1").returnToInbox("i1");
    expect(log).toContainEqual(["content_ideas.update", { status: "inbox", queue_rank: null }]);
    expect(log).toContainEqual(["content_ideas.eq", "status", "queued"]);
  });

  it("competitorCandidate picks the most popular fresh, tagged, unbriefed post of a watching creator", async () => {
    const now = new Date("2026-11-01T15:00:00Z");
    const post = (id: string, views: number, over: Record<string, unknown> = {}) => ({
      id, creator_id: "c1", shortcode: id, url: `u/${id}`, posted_at: "2026-10-28T12:00:00Z", caption: "", views, tag_confidence: {},
      tagged_at: "2026-10-29T00:00:00Z", briefed_at: null, ...over,
    });
    const base = Array.from({ length: 8 }, (_, i) => post(`m${i}`, 100, { posted_at: "2026-10-01T12:00:00Z" }));
    const { client, log } = fakeClient({
      content_creators: { data: [{ id: "c1", username: "micro.investing", status: "watching", last_pulled_at: null, last_pull_status: null }, { id: "c2", username: "gone", status: "removed", last_pulled_at: null, last_pull_status: null }] },
      content_competitor_posts: { data: [...base, post("a", 400), post("b", 900, { briefed_at: "2026-10-30T00:00:00Z" }), post("c", 800, { tagged_at: null }), post("d", 500), post("old", 5000, { posted_at: "2026-10-10T12:00:00Z" }), post("x", 99999, { creator_id: "c2" })] },
    });
    const c = await supabaseTodayDb(client, "u1").competitorCandidate("2026-11-01", now);
    expect(c?.post.id).toBe("d");
    expect(c).toMatchObject({ username: "micro.investing", multiple: 5, thin: false });
    expect(log.filter((l) => l[0] === "content_competitor_posts.eq" && l[1] === "user_id" && l[2] === "u1").length).toBeGreaterThan(0);
  });

  it("evidence marks a post whose idea has a competitor source with its angle", async () => {
    const { client } = fakeClient({
      content_ideas: { data: [{ id: "i1", source_id: "s1" }] },
      content_sources: { data: [{ id: "s1", kind: "competitor", meta: { angle: "competitor-take" } }] },
    });
    const db = supabaseTodayDb(client, "u1");
    const sources = await (db as unknown as { postSources(ids: string[]): Promise<Map<string, string>> }).postSources(["i1", "i2"]);
    expect(sources.get("i1")).toBe("competitor-take");
    expect(sources.get("i2")).toBeUndefined();
  });

  it("markCompetitorBriefed stamps the post for the owner", async () => {
    const { client, log } = fakeClient();
    await supabaseTodayDb(client, "u1").markCompetitorBriefed("cp1", "2026-11-01T15:00:00Z");
    expect(log).toContainEqual(["content_competitor_posts.update", { briefed_at: "2026-11-01T15:00:00Z" }]);
    expect(log).toContainEqual(["content_competitor_posts.eq", "user_id", "u1"]);
  });
});
