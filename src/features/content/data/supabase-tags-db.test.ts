import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { igMediaUrlLookup, supabaseTagsDb } from "./supabase-tags-db";

type Call = [string, ...unknown[]];

function fakeClient(rows: Record<string, unknown>[], count: number) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count }).then(res),
      };
      for (const m of ["select", "eq", "is", "gte", "in", "order", "limit", "update"]) {
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

const SINCE = new Date("2026-07-28T00:00:00Z");

describe("supabaseTagsDb.untagged", () => {
  it("queries the owner's untagged Instagram posts in the window, newest first, taggable media only", async () => {
    const { client, log } = fakeClient([], 0);
    await supabaseTagsDb(client, "u1").untagged(7, SINCE);
    expect(log).toContainEqual(["content_posts.eq", "user_id", "u1"]);
    expect(log).toContainEqual(["content_posts.eq", "platform", "instagram"]);
    expect(log).toContainEqual(["content_posts.is", "tagged_at", null]);
    expect(log).toContainEqual(["content_posts.gte", "posted_at", SINCE.toISOString()]);
    expect(log).toContainEqual(["content_posts.in", "media_type", ["reel", "video", "carousel", "image"]]);
    expect(log).toContainEqual(["content_posts.order", "posted_at", { ascending: false }]);
    expect(log).toContainEqual(["content_posts.limit", 7]);
  });
  it("returns only the locked fields in locked, and the total", async () => {
    const row = {
      id: "p1", external_id: "SC1", url: "u", media_type: "reel", posted_at: "2026-10-20T00:00:00Z",
      caption: "c", hook_used: "", thumbnail_url: "t",
      tag_locks: ["hook_type"], hook_type: "paradox", message: "velocity",
      onscreen_text: "", cta_type: "", post_style: "", cover_face: null, cover_text: null, cover_number: null,
    };
    const { client } = fakeClient([row], 12);
    const r = await supabaseTagsDb(client, "u1").untagged(7, SINCE);
    expect(r.total).toBe(12);
    expect(r.posts[0].locked).toEqual({ hook_type: "paradox" });
    expect(r.posts[0]).not.toHaveProperty("message");
  });
});

describe("supabaseTagsDb.writeTags", () => {
  it("updates one post scoped by id and user", async () => {
    const { client, log } = fakeClient([], 0);
    await supabaseTagsDb(client, "u1").writeTags("p1", { post_style: "image" });
    expect(log).toContainEqual(["content_posts.update", { post_style: "image" }]);
    expect(log).toContainEqual(["content_posts.eq", "id", "p1"]);
    expect(log).toContainEqual(["content_posts.eq", "user_id", "u1"]);
  });
});

describe("igMediaUrlLookup", () => {
  const NOW = new Date("2026-10-26T12:00:00Z");
  const media = [
    { id: "1", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/AAA/", timestamp: "2026-10-20T00:00:00Z", media_url: "https://cdn/a.mp4" },
    { id: "2", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/BBB/", timestamp: "2026-10-19T00:00:00Z", media_url: "https://cdn/b.mp4" },
    { id: "3", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/CCC/", timestamp: "2026-10-18T00:00:00Z" },
  ];
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ successful: true, data: { data: media }, error: null }), { status: 200 })) as unknown as typeof fetch;

  it("maps only the asked-for shortcodes that have a media_url", async () => {
    const lookup = igMediaUrlLookup({ apiKey: "k", connectionId: "c" }, fetchImpl, NOW);
    const m = await lookup(["AAA", "CCC", "ZZZ"]);
    expect([...m.entries()]).toEqual([["AAA", "https://cdn/a.mp4"]]);
  });
  it("throws when Composio is not configured, so the queue falls back to cover and caption", async () => {
    await expect(igMediaUrlLookup({}, fetchImpl, NOW)(["AAA"])).rejects.toThrow(/not set/);
  });
});
