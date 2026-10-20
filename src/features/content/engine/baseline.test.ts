import { describe, expect, it } from "vitest";
import { baselineGroup, dayViews, latestViews, percentile, viewsBaselines, viewsMultiplier, statusOf, isEvergreen, scorePosts, DAY_TOLERANCE_HOURS, type GroupBaseline, type PostForBaseline, type SeriesPoint } from "./baseline";

const pt = (at: string, views: number | null): SeriesPoint => ({ at, views });
const reel = (id: string, posted_at: string, series: SeriesPoint[]): PostForBaseline => ({
  id, platform: "instagram", format: "reel", media_type: "reel", posted_at, series,
});
/** One snapshot a day at 10:00 UTC starting the day after posting: index i is day i + 1. */
const daily = (postedAt: string, viewsByDay: number[]): SeriesPoint[] =>
  viewsByDay.map((v, i) => {
    const d = new Date(postedAt);
    d.setUTCDate(d.getUTCDate() + i + 1);
    d.setUTCHours(10, 0, 0, 0);
    return { at: d.toISOString(), views: v };
  });

describe("baselineGroup", () => {
  it("groups Instagram by media type and everything else by format", () => {
    expect(baselineGroup({ platform: "instagram", format: "reel", media_type: "reel" })).toBe("instagram:reel");
    expect(baselineGroup({ platform: "instagram", format: "", media_type: "carousel" })).toBe("instagram:carousel");
    expect(baselineGroup({ platform: "instagram", format: "", media_type: "" })).toBe("instagram:unknown");
    expect(baselineGroup({ platform: "beehiiv", format: "newsletter", media_type: "" })).toBe("beehiiv:newsletter");
    expect(baselineGroup({ platform: "youtube", format: "reel", media_type: "" })).toBe("youtube:reel");
  });
});

describe("latestViews", () => {
  it("takes the newest point that has a number, skipping a null latest", () => {
    expect(latestViews([pt("2026-10-01T10:00:00Z", 100), pt("2026-10-02T10:00:00Z", null)])).toBe(100);
    expect(latestViews([pt("2026-10-02T10:00:00Z", 120), pt("2026-10-01T10:00:00Z", 100)])).toBe(120);
    expect(latestViews([pt("2026-10-02T10:00:00Z", null)])).toBeNull();
    expect(latestViews([])).toBeNull();
  });
});

describe("dayViews", () => {
  const posted = "2026-10-01T22:00:00Z"; // day 7 target = 2026-10-08T22:00Z
  it("picks the snapshot nearest the target inside the tolerance", () => {
    const s = [pt("2026-10-08T10:00:00Z", 700), pt("2026-10-09T10:00:00Z", 800)];
    expect(dayViews(s, posted, 7)).toBe(700); // 12h early and 12h late: equidistant, the earlier wins
  });
  it("returns null when the nearest snapshot is outside the tolerance", () => {
    const s = [pt("2026-10-10T10:00:00Z", 900)]; // 36h late
    expect(dayViews(s, posted, 7)).toBeNull();
    expect(DAY_TOLERANCE_HOURS).toBe(18);
  });
  it("prefers the earlier of two equidistant snapshots", () => {
    const s = [pt("2026-10-09T10:00:00Z", 800), pt("2026-10-08T10:00:00Z", 700)];
    expect(dayViews(s, posted, 7)).toBe(700);
  });
  it("skips points with null views", () => {
    const s = [pt("2026-10-08T22:00:00Z", null), pt("2026-10-09T10:00:00Z", 800)];
    expect(dayViews(s, posted, 7)).toBe(800);
  });
});

describe("percentile", () => {
  it("interpolates and agrees with the median at 50", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([10, 20, 30, 40], 25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 90)).toBeCloseTo(37, 10);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("viewsBaselines", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("computes percentiles over the settled set only and day medians over posts with that day", () => {
    const posts = [
      reel("old1", "2026-09-01T12:00:00Z", daily("2026-09-01T12:00:00Z", [100, 150, 200, 240, 260, 280, 300])),
      reel("old2", "2026-09-02T12:00:00Z", daily("2026-09-02T12:00:00Z", [200, 300, 400, 480, 520, 560, 600])),
      reel("young", "2026-10-15T12:00:00Z", daily("2026-10-15T12:00:00Z", [5000, 6000])), // 3 days old
    ];
    const b = viewsBaselines(posts, now).get("instagram:reel")!;
    expect(b.count).toBe(2); // young excluded
    expect(b.p50).toBe(450); // 300 and 600
    expect(b.day[7].median).toBe(450);
    expect(b.day[7].count).toBe(2);
    expect(b.day[2].count).toBe(3); // young has a day-2 value
    expect(b.day[2].median).toBe(300); // 150, 300, 6000
  });
  it("flags thin at 7 posts and not at 8, separately for settled and day 7", () => {
    const settledOnly = Array.from({ length: 8 }, (_, i) => reel(`s${i}`, "2026-08-20T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100 + i }]));
    const b = viewsBaselines(settledOnly, now).get("instagram:reel")!;
    expect(b.thin).toBe(false);
    expect(b.day[7].count).toBe(0);
    expect(b.day[7].thin).toBe(true);
    const seven = viewsBaselines(settledOnly.slice(0, 7), now).get("instagram:reel")!;
    expect(seven.thin).toBe(true);
  });
  it("ignores posts outside the 90-day window and keeps groups apart", () => {
    const posts = [
      reel("in", "2026-08-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100 }]),
      reel("out", "2026-07-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 100000 }]),
      { ...reel("car", "2026-08-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 10 }]), format: "", media_type: "carousel" },
    ];
    const m = viewsBaselines(posts, now);
    expect(m.get("instagram:reel")!.p50).toBe(100);
    expect(m.get("instagram:carousel")!.p50).toBe(10);
  });
});

describe("viewsMultiplier and statusOf", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const b: GroupBaseline = {
    group: "instagram:reel", count: 10, thin: false, p25: 200, p50: 400, p75: 600, p90: 900,
    day: {
      2: { median: 100, count: 10, thin: false }, 3: { median: 150, count: 10, thin: false }, 4: { median: 200, count: 10, thin: false },
      5: { median: 250, count: 10, thin: false }, 6: { median: 300, count: 10, thin: false }, 7: { median: 350, count: 7, thin: true },
    },
  };
  it("is pending under 48 hours", () => {
    const m = viewsMultiplier(reel("p", "2026-10-17T00:00:00Z", [{ at: "2026-10-18T10:00:00Z", views: 1000 }]), b, now);
    expect(m).toEqual({ n_views: null, mode: "pending", day: null, thin: false });
    expect(statusOf(m)).toBe("Pending");
  });
  it("matches at min(age days, 7) and carries that day's thin flag", () => {
    const m3 = viewsMultiplier(reel("a", "2026-10-15T12:00:00Z", daily("2026-10-15T12:00:00Z", [50, 100, 300])), b, now);
    expect(m3).toEqual({ n_views: 2, mode: "matched", day: 3, thin: false }); // 300 / 150
    const m7 = viewsMultiplier(reel("w", "2026-09-20T12:00:00Z", daily("2026-09-20T12:00:00Z", [1, 1, 1, 1, 1, 1, 1050])), b, now);
    expect(m7).toEqual({ n_views: 3, mode: "matched", day: 7, thin: true }); // 1050 / 350
  });
  it("settles when there is no day-N value and the post is at least 14 days old", () => {
    const m = viewsMultiplier(reel("s", "2026-09-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 200 }]), b, now);
    expect(m).toEqual({ n_views: 0.5, mode: "settled", day: null, thin: false }); // 200 / p50 400
  });
  it("is none between 2 and 14 days without a day value, with no baseline, and with an empty settled set", () => {
    expect(viewsMultiplier(reel("n", "2026-10-10T12:00:00Z", []), b, now).mode).toBe("none");
    expect(viewsMultiplier(reel("n2", "2026-09-01T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 200 }]), undefined, now).mode).toBe("none");
    expect(statusOf({ n_views: null, mode: "none", day: null, thin: false })).toBeNull();
    const youngGroup: GroupBaseline = { ...b, count: 0, thin: true, p25: null, p50: null, p75: null, p90: null };
    expect(viewsMultiplier(reel("nod7", "2026-09-28T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 500 }]), youngGroup, now).mode).toBe("none");
  });
  it("maps the status bands at 0.5, 1.5 and 3.0", () => {
    const at = (n: number) => statusOf({ n_views: n, mode: "settled", day: null, thin: false });
    expect(at(0.49)).toBe("Lagging");
    expect(at(0.5)).toBe("Normal");
    expect(at(1.49)).toBe("Normal");
    expect(at(1.5)).toBe("Promising");
    expect(at(2.99)).toBe("Promising");
    expect(at(3)).toBe("Viral");
  });
});

describe("isEvergreen", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("needs 28 days, a day-14 snapshot and a fifth of views after day 14", () => {
    const grows = [...daily("2026-09-10T12:00:00Z", Array.from({ length: 14 }, (_, i) => 100 + i)), { at: "2026-10-17T10:00:00Z", views: 160 }];
    expect(isEvergreen(reel("e", "2026-09-10T12:00:00Z", grows), now)).toBe(true); // (160 - 113) / 160 >= 0.2
    const flat = [...daily("2026-09-10T12:00:00Z", Array.from({ length: 14 }, () => 150)), { at: "2026-10-17T10:00:00Z", views: 160 }];
    expect(isEvergreen(reel("f", "2026-09-10T12:00:00Z", flat), now)).toBe(false);
    expect(isEvergreen(reel("y", "2026-10-02T12:00:00Z", daily("2026-10-02T12:00:00Z", Array.from({ length: 15 }, (_, i) => 10 * i))), now)).toBe(false); // 16 days old
    expect(isEvergreen(reel("nod14", "2026-09-10T12:00:00Z", [{ at: "2026-10-17T10:00:00Z", views: 1000 }]), now)).toBe(false);
  });
});

describe("scorePosts", () => {
  it("keeps a 16-day-old viral post Viral and not Evergreen, and returns one score per post", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const base = Array.from({ length: 8 }, (_, i) => reel(`b${i}`, "2026-09-01T12:00:00Z", daily("2026-09-01T12:00:00Z", [10, 20, 30, 40, 50, 60, 70 + i])));
    const viral = reel("v", "2026-10-02T12:00:00Z", daily("2026-10-02T12:00:00Z", [100, 200, 300, 400, 500, 600, 700]));
    const { scores } = scorePosts([...base, viral], now);
    const v = scores.find((s) => s.id === "v")!;
    expect(v.status).toBe("Viral");
    expect(v.evergreen).toBe(false);
    expect(scores).toHaveLength(9);
  });
});
