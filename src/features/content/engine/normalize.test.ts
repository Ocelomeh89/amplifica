import { describe, expect, it } from "vitest";
import { median, normalizePosts, rate, type PostForMath } from "./normalize";

const now = new Date("2026-09-21T12:00:00Z");
const base = { platform: "instagram" as const, format: "reel", pillar: "cycle", hook_type: "belief", hook_used: "h", first: null };
const post = (id: string, posted_at: string, metrics: PostForMath["metrics"]): PostForMath => ({ ...base, id, posted_at, metrics });

describe("median and rate", () => {
  it("median of an even list averages the middle pair; empty is null", () => {
    expect(median([3, 1, 2, 4])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNull();
  });
  it("rate is null without a positive denominator", () => {
    expect(rate(2, 100)).toBe(0.02);
    expect(rate(2, 0)).toBeNull();
    expect(rate(null, 100)).toBeNull();
    expect(rate(2, null)).toBeNull();
  });
});

describe("normalizePosts", () => {
  it("divides each rate by the 60-day median of the same platform and format", () => {
    const posts = [
      post("a", "2026-09-10T00:00:00Z", { reach: 100, saves: 1, shares: 2, avg_watch_time_s: 10 }),
      post("b", "2026-09-12T00:00:00Z", { reach: 100, saves: 2, shares: 2, avg_watch_time_s: 20 }),
      post("c", "2026-09-14T00:00:00Z", { reach: 100, saves: 3, shares: 2, avg_watch_time_s: 30 }),
    ];
    const out = normalizePosts(posts, now);
    const c = out.find((p) => p.id === "c")!;
    expect(c.saves_rate).toBe(0.03);
    expect(c.n_saves).toBe(1.5); // 0.03 / median(0.01, 0.02, 0.03)
    expect(c.n_shares).toBe(1); // all equal
    expect(c.n_watch).toBe(1.5); // 30 / 20
    expect(c.n_reach).toBe(1); // 100 / 100
  });

  it("falls back to views when reach is null, and yields null ratios when the baseline is empty", () => {
    const out = normalizePosts([post("a", "2026-09-10T00:00:00Z", { views: 50, saves: 5 })], now);
    expect(out[0].reach).toBe(50);
    expect(out[0].saves_rate).toBe(0.1);
    expect(out[0].n_saves).toBe(1); // it is its own median
    expect(out[0].n_shares).toBeNull();
  });

  it("uses only posts inside the window for the baseline but normalizes every post", () => {
    const old = post("old", "2026-01-01T00:00:00Z", { reach: 100, saves: 10 });
    const fresh = post("fresh", "2026-09-10T00:00:00Z", { reach: 100, saves: 1 });
    const out = normalizePosts([old, fresh], now);
    expect(out.find((p) => p.id === "old")!.n_saves).toBe(10); // 0.10 / 0.01
    expect(out.find((p) => p.id === "fresh")!.n_saves).toBe(1);
  });

  it("uses the first snapshot's reach for n_reach when present", () => {
    const a = { ...post("a", "2026-09-10T00:00:00Z", { reach: 400 }), first: { reach: 100 } };
    const b = { ...post("b", "2026-09-11T00:00:00Z", { reach: 400 }), first: { reach: 300 } };
    const out = normalizePosts([a, b], now);
    expect(out.find((p) => p.id === "a")!.n_reach).toBe(0.5); // 100 / median(100, 300)
  });

  it("keeps a different format on its own baseline", () => {
    const reel = post("r", "2026-09-10T00:00:00Z", { reach: 100, saves: 1 });
    const carousel = { ...post("c", "2026-09-10T00:00:00Z", { reach: 100, saves: 4 }), format: "" };
    const out = normalizePosts([reel, carousel], now);
    expect(out.find((p) => p.id === "r")!.n_saves).toBe(1);
    expect(out.find((p) => p.id === "c")!.n_saves).toBe(1);
  });
});
