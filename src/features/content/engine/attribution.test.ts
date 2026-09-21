import { describe, expect, it } from "vitest";
import { attribute, hookLengthBucket } from "./attribution";
import type { NormalizedPost } from "./normalize";

function np(over: Partial<NormalizedPost>): NormalizedPost {
  return {
    id: "x",
    platform: "instagram",
    format: "reel",
    pillar: "cycle",
    hook_type: "belief",
    hook_used: "short hook",
    posted_at: "2026-09-10T00:00:00Z",
    metrics: {},
    first: null,
    reach: 100,
    saves_rate: null,
    shares_rate: null,
    watch_s: null,
    n_saves: 1,
    n_shares: 1,
    n_watch: null,
    n_reach: 1,
    ...over,
  };
}

describe("hookLengthBucket", () => {
  it("buckets by character count", () => {
    expect(hookLengthBucket("x".repeat(60))).toBe("short");
    expect(hookLengthBucket("x".repeat(61))).toBe("medium");
    expect(hookLengthBucket("x".repeat(110))).toBe("medium");
    expect(hookLengthBucket("x".repeat(111))).toBe("long");
  });
});

describe("attribute", () => {
  const posts = [
    np({ id: "1", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "2", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "3", pillar: "cycle", n_saves: 2, n_shares: 2 }),
    np({ id: "4", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "5", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "6", pillar: "failure", n_saves: 0.5, n_shares: 0.5 }),
    np({ id: "7", pillar: "math", n_saves: 9, n_shares: 9 }),
  ];
  const out = attribute(posts);

  it("computes a group per dimension value with count, medians, and score", () => {
    const cycle = out.groups.find((g) => g.dimension === "pillar" && g.key === "cycle")!;
    expect(cycle).toEqual({ dimension: "pillar", key: "cycle", count: 3, median_n_saves: 2, median_n_shares: 2, score: 2, thin: false });
  });

  it("marks groups under 3 posts thin and keeps them out of double-down and stop", () => {
    const math = out.groups.find((g) => g.dimension === "pillar" && g.key === "math")!;
    expect(math.thin).toBe(true);
    expect(out.doubleDown.some((g) => g.key === "math")).toBe(false);
    expect(out.stop.some((g) => g.key === "math")).toBe(false);
  });

  it("double-down is the top 3 groups at or above typical; stop is the bottom 3 below typical", () => {
    expect(out.doubleDown).toHaveLength(3);
    expect(out.doubleDown.every((g) => g.score === 2)).toBe(true);
    expect(out.stop).toEqual([expect.objectContaining({ dimension: "pillar", key: "failure", score: 0.5 })]);
  });

  it("orders ties by dimension then key, so the lists are stable", () => {
    expect(out.doubleDown.map((g) => `${g.dimension}:${g.key}`)).toEqual(["format:reel", "hook_length:short", "hook_type:belief"]);
  });

  it("skips empty keys and scores with whichever median exists", () => {
    const r = attribute([np({ id: "a", pillar: "", n_saves: 3, n_shares: null })]);
    expect(r.groups.some((g) => g.dimension === "pillar")).toBe(false);
    expect(r.groups.find((g) => g.dimension === "format")!.score).toBe(3);
  });

  it("orders tied groups in stop list by dimension then key ascending, matching double-down convention", () => {
    // 6 posts: 3 with pillar "a", 3 with pillar "b", all at score 0.5
    // Creates groups: format:reel, hook_length:short, hook_type:belief, pillar:a, pillar:b
    // All non-thin, all score 0.5. Stop should contain the first 3 alphabetically by dimension then key.
    const tiedPosts = [
      np({ id: "1a", pillar: "a", n_saves: 0.5, n_shares: 0.5 }),
      np({ id: "2a", pillar: "a", n_saves: 0.5, n_shares: 0.5 }),
      np({ id: "3a", pillar: "a", n_saves: 0.5, n_shares: 0.5 }),
      np({ id: "1b", pillar: "b", n_saves: 0.5, n_shares: 0.5 }),
      np({ id: "2b", pillar: "b", n_saves: 0.5, n_shares: 0.5 }),
      np({ id: "3b", pillar: "b", n_saves: 0.5, n_shares: 0.5 }),
    ];
    const r = attribute(tiedPosts);
    // All groups have score 0.5; stop contains bottom 3 by dimension then key order
    expect(r.stop.map((g) => `${g.dimension}:${g.key}`)).toEqual(["format:reel", "hook_length:short", "hook_type:belief"]);
  });
});
