import { describe, expect, it } from "vitest";
import { baselineGroup, dayViews, latestViews, percentile, viewsBaselines, DAY_TOLERANCE_HOURS, type PostForBaseline, type SeriesPoint } from "./baseline";

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
