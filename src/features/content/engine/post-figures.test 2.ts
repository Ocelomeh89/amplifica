import { describe, expect, it } from "vitest";
import type { Multiplier } from "./baseline";
import type { NormalizedPost } from "./normalize";
import { directionWords, postFigures } from "./post-figures";

function post(over: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    id: "p",
    platform: "instagram",
    format: "reel",
    media_type: "reel",
    pillar: "",
    hook_type: "",
    hook_used: "",
    posted_at: "2026-10-01T00:00:00Z",
    metrics: { views: 41200 },
    first: null,
    reach: 30000,
    saves_rate: 0.0091,
    shares_rate: 0.0064,
    watch_s: 12.4,
    n_saves: 2.2,
    n_shares: 2.0,
    n_watch: 1.4,
    n_reach: 1.1,
    ...over,
  };
}
const matched: Multiplier = { n_views: 2.7, mode: "matched", day: 5, thin: false };
const settled: Multiplier = { n_views: 0.6, mode: "settled", day: null, thin: false };

describe("postFigures", () => {
  it("views uses the matched label", () => {
    const [views] = postFigures(post(), matched);
    expect(views).toEqual({ label: "Views", value: "41,200", versus: "vs posts at the same age", direction: "2.7× above median" });
  });

  it("views uses the settled label", () => {
    const [views] = postFigures(post(), settled);
    expect(views.versus).toBe("vs your settled median");
    expect(views.direction).toBe("0.6× below median");
  });

  it("a pending multiplier shows Not enough data yet", () => {
    const [views] = postFigures(post(), { n_views: null, mode: "pending", day: null, thin: false });
    expect(views).toEqual({ label: "Views", value: "Not enough data yet", versus: "", direction: null });
  });

  it("rates are per 1k with the 90-day label", () => {
    const [, saves, shares] = postFigures(post(), matched);
    expect(saves).toEqual({ label: "Saves per 1k", value: "9.1", versus: "vs your 90-day median", direction: "2.2× above median" });
    expect(shares.value).toBe("6.4");
  });

  it("watch time only for reels", () => {
    expect(postFigures(post(), matched).map((f) => f.label)).toEqual(["Views", "Saves per 1k", "Shares per 1k", "Watch time"]);
    expect(postFigures(post({ media_type: "carousel", watch_s: null }), matched).map((f) => f.label)).toEqual([
      "Views",
      "Saves per 1k",
      "Shares per 1k",
    ]);
  });

  it("a missing rate shows a dash and no direction", () => {
    const [, saves] = postFigures(post({ saves_rate: null, n_saves: null }), matched);
    expect(saves.value).toBe("–");
    expect(saves.direction).toBeNull();
  });
});

describe("directionWords", () => {
  it("rounds to one decimal", () => {
    expect(directionWords(2.74)).toBe("2.7× above median");
    expect(directionWords(0.64)).toBe("0.6× below median");
  });
  it("says at median within 0.05", () => {
    expect(directionWords(1.03)).toBe("at median");
    expect(directionWords(0.97)).toBe("at median");
  });
  it("is null without a ratio", () => {
    expect(directionWords(null)).toBeNull();
  });
});
