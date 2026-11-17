import { describe, expect, it } from "vitest";
import {
  OWN_INSTAGRAM_USERNAME,
  bestReels,
  bioLine,
  budgetLeft,
  canLookAgain,
  followerCountIsFresh,
  followersLine,
  inBand,
  isActive,
  isLapsed,
  newCandidates,
  nextRunKind,
  popularCount,
  rankFits,
  sizeOutcome,
  slotsFree,
  type CandidateOutcome,
  type SampleReel,
} from "./discovery";

const NOW = new Date("2026-11-16T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const reel = (over: Partial<SampleReel> = {}): SampleReel => ({ shortcode: "x", url: "https://www.instagram.com/reel/x/", posted_at: daysAgo(1), views: 100, caption: "", ...over });
const withViews = (views: (number | null)[]) => views.map((v, i) => reel({ shortcode: `r${i}`, url: `https://www.instagram.com/reel/r${i}/`, views: v }));

describe("creator discovery rules", () => {
  it("the band is 2x to 20x, both ends included", () => {
    expect(inBand(12000, 8000)).toBe(false);
    expect(inBand(16000, 8000)).toBe(true);
    expect(inBand(160000, 8000)).toBe(true);
    expect(inBand(200000, 8000)).toBe(false);
  });

  it("a missing follower count is unreadable, not out of band", () => {
    expect(sizeOutcome(null, 8000)).toBe("unreadable");
    expect(sizeOutcome(0, 8000)).toBe("out_of_band");
    expect(sizeOutcome(16000, 8000)).toBe("sized");
  });

  it("a stored follower count is good for 14 days", () => {
    expect(followerCountIsFresh("2026-11-02", "2026-11-16")).toBe(true);
    expect(followerCountIsFresh("2026-11-01", "2026-11-16")).toBe(false);
  });

  it("three waiting leaves no slot; two leaves one", () => {
    expect(slotsFree(3)).toBe(0);
    expect(slotsFree(2)).toBe(1);
    expect(slotsFree(5)).toBe(0);
  });

  it("the week's dollar counts cost when known and the cap when not", () => {
    const runs = [
      { status: "ready", cap_usd: 1, cost_usd: 0.12 },
      { status: "pending", cap_usd: 0.5, cost_usd: null },
      { status: "failed", cap_usd: 0.3, cost_usd: null },
    ];
    expect(budgetLeft(runs)).toBeCloseTo(0.08);
    expect(budgetLeft([{ status: "ready", cap_usd: 5, cost_usd: 5 }])).toBe(0);
  });

  it("a suggestion lapses after 4 weeks", () => {
    expect(isLapsed(daysAgo(28), NOW)).toBe(false);
    expect(isLapsed(daysAgo(29), NOW)).toBe(true);
  });

  it("a dropped candidate is not looked at again for 90 days", () => {
    expect(canLookAgain(daysAgo(89), NOW)).toBe(false);
    expect(canLookAgain(daysAgo(90), NOW)).toBe(true);
    const memory = new Map<string, { outcome: CandidateOutcome; looked_at: string }>([
      ["recent", { outcome: "neither", looked_at: daysAgo(89) }],
      ["old", { outcome: "neither", looked_at: daysAgo(90) }],
    ]);
    const out = newCandidates([{ username: "recent", found_via: "a" }, { username: "old", found_via: "b" }], { creators: new Set(), memory }, NOW);
    expect(out.map((c) => c.username)).toEqual(["old"]);
  });

  it("a creator in any status, a candidate in the pipeline, and Miguel himself are never new", () => {
    const memory = new Map<string, { outcome: CandidateOutcome; looked_at: string }>([["inflight", { outcome: "sampled", looked_at: daysAgo(1) }]]);
    const out = newCandidates(
      [{ username: "known", found_via: "a" }, { username: "inflight", found_via: "a" }, { username: OWN_INSTAGRAM_USERNAME, found_via: "a" }],
      { creators: new Set(["known"]), memory },
      NOW,
    );
    expect(out).toEqual([]);
  });

  it("usernames are normalized and duplicates keep the first found_via", () => {
    const out = newCandidates([{ username: "@Fresh.One", found_via: "first" }, { username: "fresh.one", found_via: "second" }, { username: "not valid!", found_via: "x" }], { creators: new Set(), memory: new Map() }, NOW);
    expect(out).toEqual([{ username: "fresh.one", found_via: "first" }]);
  });

  it("fewer than 4 Reels in 30 days is quiet", () => {
    const old = Array.from({ length: 9 }, (_, i) => reel({ shortcode: `o${i}`, posted_at: daysAgo(60 + i) }));
    const recent = (n: number) => Array.from({ length: n }, (_, i) => reel({ shortcode: `n${i}`, posted_at: daysAgo(2 + i) }));
    expect(isActive([...recent(3), ...old], NOW)).toBe(false);
    expect(isActive([...recent(4), ...old], NOW)).toBe(true);
  });

  it("popular is 3x the sample median; an empty or zero median counts none", () => {
    expect(popularCount(withViews([100, 100, 100, 300, 900]))).toBe(2);
    expect(popularCount([])).toBe(0);
    expect(popularCount(withViews([0, 0, 0]))).toBe(0);
  });

  it("best Reels show only at 1.5x or more, two at most", () => {
    const best = bestReels(withViews([100, 100, 100, 100, 100, 500, 900]));
    expect(best.map((b) => b.multiple)).toEqual([9, 5]);
    expect(best[0].url).toBe("https://www.instagram.com/reel/r6/");
    expect(bestReels(withViews([100, 100, 140]))).toEqual([]);
    expect(bestReels([])).toEqual([]);
  });

  it("ranking is confidence, then popular Reels", () => {
    const fits = [
      { username: "a", confidence: 4, popular_count: 0 },
      { username: "b", confidence: 5, popular_count: 0 },
      { username: "c", confidence: 4, popular_count: 2 },
    ];
    expect(rankFits(fits).map((f) => f.username)).toEqual(["b", "c", "a"]);
  });

  it("next run", () => {
    const base = { gathered: 0, sized: 0, ranThisWeek: [] as ("gather" | "size" | "sample")[], hops: 1 as 1 | 2, canGather: true };
    expect(nextRunKind({ ...base, gathered: 2, ranThisWeek: ["gather"] })).toBe("size");
    expect(nextRunKind({ ...base, gathered: 2, ranThisWeek: ["gather", "size"] })).toBeNull();
    expect(nextRunKind({ ...base, gathered: 2, ranThisWeek: ["gather", "size"], hops: 2 })).toBe("size");
    expect(nextRunKind({ ...base, sized: 3 })).toBe("sample");
    expect(nextRunKind({ ...base, canGather: false })).toBeNull();
    expect(nextRunKind(base)).toBe("gather");
    expect(nextRunKind({ ...base, ranThisWeek: ["gather", "size", "sample"] })).toBeNull();
  });

  it("the follower line", () => {
    expect(followersLine(48000, 8000)).toBe("48k followers, 6x yours");
    expect(followersLine(1913, 122)).toBe("1.9k followers, 16x yours");
    expect(followersLine(500, 200)).toBe("500 followers, 2.5x yours");
  });

  it("the bio line is the first line, 120 characters at most", () => {
    expect(bioLine("Line one\nline two")).toBe("Line one");
    expect(bioLine("x".repeat(200))).toHaveLength(120);
  });
});
