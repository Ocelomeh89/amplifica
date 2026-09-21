import { describe, expect, it } from "vitest";
import { bestTimes, chicagoWeekdayHour, topCells } from "./best-times";
import type { NormalizedPost } from "./normalize";

function np(posted_at: string, n_reach: number | null): NormalizedPost {
  return {
    id: posted_at, platform: "instagram", format: "reel", pillar: "", hook_type: "", hook_used: "",
    posted_at, metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null,
    n_saves: null, n_shares: null, n_watch: null, n_reach,
  };
}

describe("chicagoWeekdayHour", () => {
  it("converts UTC to Chicago local, Monday = 0", () => {
    // 2026-09-21 is a Monday. 13:30Z is 08:30 CDT.
    expect(chicagoWeekdayHour("2026-09-21T13:30:00Z")).toEqual({ weekday: 0, hour: 8 });
    // 04:00Z on Monday is 23:00 CDT on Sunday.
    expect(chicagoWeekdayHour("2026-09-21T04:00:00Z")).toEqual({ weekday: 6, hour: 23 });
    // Midnight local must be hour 0, not 24.
    expect(chicagoWeekdayHour("2026-09-21T05:00:00Z")).toEqual({ weekday: 0, hour: 0 });
  });
});

describe("bestTimes", () => {
  it("returns 168 cells with counts, mean normalized reach, and tiers", () => {
    const cells = bestTimes([
      np("2026-09-21T13:00:00Z", 2), // Mon 08
      np("2026-09-14T13:00:00Z", 1), // Mon 08
      np("2026-09-07T13:00:00Z", 3), // Mon 08
      np("2026-09-22T13:00:00Z", 1), // Tue 08
      np("2026-09-23T13:00:00Z", null), // Wed 08, no reach: counted, no score
    ]);
    expect(cells).toHaveLength(168);
    const mon8 = cells.find((c) => c.weekday === 0 && c.hour === 8)!;
    expect(mon8).toEqual({ weekday: 0, hour: 8, count: 3, score: 2, tier: "usable" });
    expect(cells.find((c) => c.weekday === 1 && c.hour === 8)!.tier).toBe("one data point");
    expect(cells.find((c) => c.weekday === 2 && c.hour === 8)).toMatchObject({ count: 1, score: null });
    expect(cells.find((c) => c.weekday === 3 && c.hour === 8)).toMatchObject({ count: 0, tier: "none" });
  });
});

describe("topCells", () => {
  it("orders by tier weight then score, then weekday and hour", () => {
    const cells = bestTimes([
      np("2026-09-21T13:00:00Z", 5), // Mon 08, one data point, score 5
      np("2026-09-22T13:00:00Z", 1), // Tue 08
      np("2026-09-15T13:00:00Z", 1), // Tue 08 -> thin, score 1
    ]);
    const top = topCells(cells, 2);
    expect(top.map((c) => [c.weekday, c.hour])).toEqual([[1, 8], [0, 8]]);
  });
});
