import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { supabaseCompetitorsDb } from "./supabase-competitors-db";

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
      for (const m of ["select", "eq", "in", "is", "lt", "gte", "order", "limit", "update", "insert", "upsert"]) {
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

const creators = { data: [{ id: "c1", username: "micro.investing", status: "watching", last_pulled_at: null, last_pull_status: null }] };

describe("supabaseCompetitorsDb", () => {
  it("filters every read and write by the owner", async () => {
    const { client, log } = fakeClient({ content_creators: creators, content_competitor_runs: { data: [{ id: "r1" }] } });
    const db = supabaseCompetitorsDb(client, "u1");
    await db.creators();
    await db.removeCreator("c1");
    await db.setCreatorPull(["c1"], "2026-11-03T11:00:00Z", "ready");
    await db.latestRun();
    await db.pendingRuns();
    await db.updateRun("r1", { status: "ready" });
    await db.postsForMedians("2026-08-01T00:00:00Z");
    await db.untaggedRecent("2026-10-20T00:00:00Z");
    await db.recentPosts("2026-08-01T00:00:00Z");
    const reads = log.filter((c) => c[0].endsWith(".select") || c[0].endsWith(".update")).length;
    const owners = log.filter((c) => c[1] === "user_id" && c[2] === "u1").length;
    expect(owners).toBe(reads);
  });

  it("upsertCreator re-watches on the unique username", async () => {
    const { client, log } = fakeClient();
    await supabaseCompetitorsDb(client, "u1").upsertCreator("micro.investing");
    expect(log).toContainEqual([
      "content_creators.upsert",
      { user_id: "u1", platform: "instagram", username: "micro.investing", status: "watching" },
      { onConflict: "user_id,platform,username" },
    ]);
  });

  it("upsertPosts updates counts on the shortcode and never writes tag columns", async () => {
    const { client, log } = fakeClient({ content_competitor_posts: { data: [{ id: "p1" }] } });
    const n = await supabaseCompetitorsDb(client, "u1").upsertPosts(
      [{ shortcode: "A1", url: "u", username: "micro.investing", posted_at: "2026-10-30T12:00:00Z", caption: "c", views: 9, likes: 1, comments: 0, duration_seconds: 30, thumbnail_url: null, creator_id: "c1" }],
      "2026-11-03T11:00:00Z"
    );
    expect(n).toBe(1);
    const call = log.find((c) => c[0] === "content_competitor_posts.upsert")!;
    const row = (call[1] as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ user_id: "u1", creator_id: "c1", shortcode: "A1", views: 9, pulled_at: "2026-11-03T11:00:00Z" });
    expect(row).not.toHaveProperty("username");
    expect(row).not.toHaveProperty("tagged_at");
    expect(call[2]).toEqual({ onConflict: "user_id,shortcode" });
  });

  it("untaggedRecent takes watching creators only and untagged posts", async () => {
    const { client, log } = fakeClient({ content_creators: creators, content_competitor_posts: { data: [{ id: "p1", creator_id: "c1", tag_confidence: {} }] } });
    const out = await supabaseCompetitorsDb(client, "u1").untaggedRecent("2026-10-20T00:00:00Z");
    expect(log).toContainEqual(["content_creators.eq", "status", "watching"]);
    expect(log).toContainEqual(["content_competitor_posts.is", "tagged_at", null]);
    expect(log).toContainEqual(["content_competitor_posts.in", "creator_id", ["c1"]]);
    expect(out[0].username).toBe("micro.investing");
  });

  it("insertRun returns the new id", async () => {
    const { client } = fakeClient({ content_competitor_runs: { data: [{ id: "r9" }] } });
    expect(await supabaseCompetitorsDb(client, "u1").insertRun("apify-1", "2026-11-02T11:00:00Z")).toBe("r9");
  });
});
