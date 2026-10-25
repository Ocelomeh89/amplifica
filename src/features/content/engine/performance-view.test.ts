import { describe, expect, it } from "vitest";
import { filteredCards } from "./performance-view";
import { overviewCards } from "./overview";
import { baselineGroup, scorePosts } from "./baseline";
import type { PostTags } from "./tags";

const NOW = new Date("2026-10-26T12:00:00Z");

const tags = (over: Partial<PostTags>): PostTags => ({
  hook_type: "", onscreen_text: "", message: "", cta_type: "", post_style: "",
  cover_face: null, cover_text: null, cover_number: null, hook_spoken: "", hook_onscreen: "",
  tag_confidence: {}, tag_locks: [], tagged_at: null, ...over,
});

// Ten Reels from 20 days ago; views climb with the index. Three carry the paradox hook.
const posts = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  platform: "instagram" as const,
  format: "reel",
  media_type: "reel",
  posted_at: new Date(NOW.getTime() - 20 * 86_400_000).toISOString(),
  series: [{ at: NOW.toISOString(), views: (i + 1) * 100 }],
  caption: "caption",
  ...tags(i < 3 ? { hook_type: "paradox" } : {}),
}));

describe("filteredCards", () => {
  it("with no filters equals the cards over every post", () => {
    const { baselines, scores } = scorePosts(posts, NOW);
    const all = overviewCards(posts.map((p) => ({ id: p.id, posted_at: p.posted_at, group: baselineGroup(p) })), scores, baselines, NOW, 30);
    const r = filteredCards(posts, [], NOW, 30);
    expect(r.cards).toEqual(all);
    expect(r.visibleIds.size).toBe(10);
  });

  it("counts only the filtered posts but keeps the baseline from all posts", () => {
    const full = filteredCards(posts, [], NOW, 30);
    const r = filteredCards(posts, [{ name: "hook_type", value: "paradox" }], NOW, 30);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].posts).toBe(3);
    expect(r.cards[0].p50).toBe(full.cards[0].p50);
    expect(r.visibleIds).toEqual(new Set(["p0", "p1", "p2"]));
    expect(r.scores).toEqual(full.scores);
  });

  it("returns no cards when nothing matches", () => {
    const r = filteredCards(posts, [{ name: "post_style", value: "animation" }], NOW, 30);
    expect(r.cards).toEqual([]);
    expect(r.visibleIds.size).toBe(0);
  });
});
