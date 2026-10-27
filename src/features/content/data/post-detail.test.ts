import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { loadPostDetail } from "./post-detail";

vi.mock("server-only", () => ({}));

function fakeClient(tables: Record<string, unknown[]>) {
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null, count: 0 }).then(ok),
      };
      for (const m of ["select", "eq", "in", "lt", "gte", "order", "limit", "range"]) b[m] = () => b;
      return b;
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const post = (over: Record<string, unknown> = {}) => ({
  id: "p1", platform: "instagram", format: "reel", media_type: "reel", thumbnail_url: "t", pillar: "", hook_type: "question",
  hook_used: "", caption: "Cap", url: "https://instagram.com/reel/x", idea_id: null, posted_at: "2026-10-25T00:00:00Z",
  onscreen_text: "", message: "velocity", cta_type: "", post_style: "talking-head-text", cover_face: true, cover_text: null,
  cover_number: null, hook_spoken: "Spoken", hook_onscreen: "", tag_confidence: {}, tag_locks: [], tagged_at: "2026-10-26T00:00:00Z", ...over,
});

const NOW = new Date("2026-10-26T15:00:00Z");

describe("loadPostDetail", () => {
  it("returns null for a post that is not there", async () => {
    expect(await loadPostDetail(fakeClient({ content_posts: [post()] }), "u1", "nope", NOW)).toBeNull();
  });

  it("a brand-new post shows Not enough data yet for views, never a NaN", async () => {
    const d = await loadPostDetail(fakeClient({ content_posts: [post()], content_metrics: [] }), "u1", "p1", NOW);
    expect(d?.figures[0]).toMatchObject({ label: "Views", value: "Not enough data yet", direction: null });
    expect(JSON.stringify(d?.figures)).not.toMatch(/NaN|null×/);
  });

  it("reports a thin sample and no live cards, and strips the views series", async () => {
    const d = await loadPostDetail(fakeClient({ content_posts: [post()], content_metrics: [], content_recreations: [] }), "u1", "p1", NOW);
    expect(d?.insights.state).toBe("thin");
    expect(d?.live).toEqual({ "same-recipe": null, adjacent: null });
    expect(d?.post).not.toHaveProperty("series");
  });

  it("lists ideas made from the post", async () => {
    const d = await loadPostDetail(
      fakeClient({ content_posts: [post()], content_metrics: [], content_ideas: [{ id: "i1", hook: "New hook", status: "inbox", created_at: "2026-10-26T00:00:00Z" }] }),
      "u1", "p1", NOW
    );
    expect(d?.recreations).toEqual([{ ideaId: "i1", hook: "New hook", status: "inbox", multiplier: null }]);
  });
});
