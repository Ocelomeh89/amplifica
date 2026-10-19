import { describe, expect, it } from "vitest";
import { baselineGroup, dayViews, latestViews, percentile, DAY_TOLERANCE_HOURS, type SeriesPoint } from "./baseline";

const pt = (at: string, views: number | null): SeriesPoint => ({ at, views });

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
