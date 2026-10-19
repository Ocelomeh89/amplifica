import { describe, expect, it } from "vitest";
import { overviewCards, parseWindow, groupLabel } from "./overview";
import type { GroupBaseline, PostScore, Status } from "./baseline";

describe("parseWindow", () => {
  it("accepts the four windows and defaults to 30", () => {
    expect(parseWindow("7")).toBe(7);
    expect(parseWindow("90")).toBe(90);
    expect(parseWindow("15")).toBe(30);
    expect(parseWindow("abc")).toBe(30);
    expect(parseWindow(undefined)).toBe(30);
  });
});

describe("groupLabel", () => {
  it("names known groups and falls back to the id", () => {
    expect(groupLabel("instagram:reel")).toBe("Reels");
    expect(groupLabel("whatever:x")).toBe("whatever:x");
  });
});

describe("overviewCards", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const score = (id: string, group: string, status: Status | null, evergreen = false): PostScore => ({
    id, group, views: 1, multiplier: { n_views: 1, mode: "settled", day: null, thin: false }, status, evergreen,
  });
  const posts = [
    { id: "r1", posted_at: "2026-10-10T00:00:00Z", group: "instagram:reel" },
    { id: "r2", posted_at: "2026-10-12T00:00:00Z", group: "instagram:reel" },
    { id: "c1", posted_at: "2026-10-11T00:00:00Z", group: "instagram:carousel" },
    { id: "n1", posted_at: "2026-10-01T00:00:00Z", group: "beehiiv:newsletter" },
    { id: "old", posted_at: "2026-08-01T00:00:00Z", group: "instagram:image" },
  ];
  const scores = [
    score("r1", "instagram:reel", "Viral"),
    score("r2", "instagram:reel", "Lagging", true),
    score("c1", "instagram:carousel", "Promising"),
    score("n1", "beehiiv:newsletter", "Normal"),
    score("old", "instagram:image", "Normal"),
  ];
  const baselines = new Map<string, GroupBaseline>([
    ["instagram:reel", { group: "instagram:reel", count: 20, thin: false, p25: 1, p50: 500, p75: 1, p90: 2000, day: { 7: { median: 1, count: 20, thin: false } } }],
    ["instagram:carousel", { group: "instagram:carousel", count: 18, thin: false, p25: 1, p50: 80, p75: 1, p90: 300, day: { 7: { median: 1, count: 4, thin: true } } }],
  ]);

  it("builds one card per group with posts in the window, Instagram first by count", () => {
    const cards = overviewCards(posts, scores, baselines, now, 30);
    expect(cards.map((c) => c.label)).toEqual(["Reels", "Carousels", "Newsletter"]);
    expect(cards[0]).toMatchObject({ posts: 2, p50: 500, p90: 2000, thin: false, thinDay7: false, viral: 1, lagging: 1, evergreen: 1 });
    expect(cards[1]).toMatchObject({ posts: 1, thinDay7: true, promising: 1 });
    expect(cards[2]).toMatchObject({ p50: null, p90: null, thin: true });
  });
  it("a longer window brings in older groups, and an empty window gives no cards", () => {
    expect(overviewCards(posts, scores, baselines, now, 90).map((c) => c.label)).toContain("Images");
    expect(overviewCards([], [], baselines, now, 7)).toEqual([]);
  });
});
