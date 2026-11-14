import { describe, expect, it } from "vitest";
import type { SeriesPoint } from "./baseline";
import { viewsAtOrAfter } from "./baseline";
import { median24h, outcomesOf, owesOf, readingStart, shouldPromote, staleReason, testVerdict, verdictLine } from "./test-lab-verdict";

const pt = (at: string, views: number | null): SeriesPoint => ({ at, views });

describe("testVerdict", () => {
  it.each([
    [2000, 1100, "a"],
    [1100, 2000, "b"],
    [1300, 1100, "none"],
    [900, 300, "none"],
    [1500, 1000, "a"],
    [1499, 1000, "none"],
    [1000, 0, "a"],
    [999, 0, "none"],
    [1200, 1200, "none"],
  ] as const)("%i against %i is %s", (a, b, expected) => {
    expect(testVerdict(a, b)).toBe(expected);
  });
});

describe("shouldPromote", () => {
  it.each([
    [3000, 1000, true],
    [2999, 1000, false],
    [900, 200, false],
    [5000, null, false],
    [5000, 0, false],
  ] as const)("%i views against a median of %s is %s", (views, median, expected) => {
    expect(shouldPromote(views, median)).toBe(expected);
  });
});

describe("the reading", () => {
  it("two posts either side of the cron are read by the same run", () => {
    // A is posted 09:50Z and B 10:20Z; the daily snapshot is at 10:00Z.
    const a = "2026-11-16T09:50:00Z";
    const b = "2026-11-16T10:20:00Z";
    const series = [pt("2026-11-17T10:00:00Z", 1000), pt("2026-11-18T10:00:00Z", 2000)];
    // Read from each post's own time, A would use the first point and B the second, a day apart.
    expect(viewsAtOrAfter(series, a, 24)?.at).toBe("2026-11-17T10:00:00Z");
    expect(viewsAtOrAfter(series, b, 24)?.at).toBe("2026-11-18T10:00:00Z");
    const from = readingStart(a, b);
    expect(from).toBe(b);
    expect(viewsAtOrAfter(series, from, 24)?.at).toBe("2026-11-18T10:00:00Z");
    expect(readingStart(b, a)).toBe(b);
  });
});

describe("median24h", () => {
  it("is the median of each Reel's first reading at or after 24 hours, skipping Reels with none", () => {
    const reels = [
      { posted_at: "2026-10-01T00:00:00Z", series: [pt("2026-10-02T10:00:00Z", 1000)] },
      { posted_at: "2026-10-05T00:00:00Z", series: [pt("2026-10-06T10:00:00Z", 3000)] },
      { posted_at: "2026-10-09T00:00:00Z", series: [pt("2026-10-09T10:00:00Z", 50)] },
      { posted_at: "2026-10-12T00:00:00Z", series: [pt("2026-10-13T10:00:00Z", 2000)] },
    ];
    expect(median24h(reels)).toBe(2000);
    expect(median24h([])).toBeNull();
  });
});

describe("staleReason", () => {
  const opened = "2026-11-01T00:00:00Z";
  const at = (iso: string) => new Date(iso);
  it("closes a test with no post after 14 days, not before", () => {
    expect(staleReason({ opened_at: opened, linked: 0, laterPostedAt: null }, at("2026-11-14T00:00:00Z"))).toBeNull();
    expect(staleReason({ opened_at: opened, linked: 1, laterPostedAt: null }, at("2026-11-15T00:00:00Z"))).toBe("No post was linked within 14 days.");
  });
  it("closes a test whose numbers never arrived 7 days after the later post", () => {
    const later = "2026-11-02T00:00:00Z";
    expect(staleReason({ opened_at: opened, linked: 2, laterPostedAt: later }, at("2026-11-08T00:00:00Z"))).toBeNull();
    expect(staleReason({ opened_at: opened, linked: 2, laterPostedAt: later }, at("2026-11-09T00:00:00Z"))).toBe("No 24-hour number arrived.");
  });
});

describe("verdictLine", () => {
  const base = { variable: "hook_type" as const, a: { label: "Question", views: 2000 }, b: { label: "Story", views: 1100 } };
  it("names the winner and both numbers", () => {
    expect(verdictLine({ ...base, verdict: "a" })).toBe("Question won: 2,000 views against 1,100 in the first day.");
    expect(verdictLine({ ...base, verdict: "b" })).toBe("Story won: 1,100 views against 2,000 in the first day.");
  });
  it("says there is no clear winner", () => {
    expect(verdictLine({ ...base, a: { label: "Question", views: 1300 }, verdict: "none" })).toBe("No clear winner: 1,300 views against 1,100 in the first day.");
  });
});

describe("outcomesOf", () => {
  const t = { variable: "hook_type" as const, value_a: "question", value_b: "story", judged_at: "2026-11-17T10:00:00Z" };
  it("a win gives one won and one lost for the variable", () => {
    expect(outcomesOf({ ...t, verdict: "a" })).toEqual([
      { variable: "hook_type", value: "question", outcome: "won", at: t.judged_at },
      { variable: "hook_type", value: "story", outcome: "lost", at: t.judged_at },
    ]);
    expect(outcomesOf({ ...t, verdict: "b" }).map((o) => [o.value, o.outcome])).toEqual([["question", "lost"], ["story", "won"]]);
  });
  it("no clear winner gives two flats", () => {
    expect(outcomesOf({ ...t, verdict: "none" }).map((o) => o.outcome)).toEqual(["flat", "flat"]);
  });
});

describe("owesOf", () => {
  it("says what Miguel still owes, by how many versions have numbers", () => {
    expect(owesOf(0)[0]).toBe("Record and post both versions");
    expect(owesOf(1)).toHaveLength(1);
    expect(owesOf(2)).toEqual(["Nothing. The result arrives a day after posting."]);
  });
  it("names the post link when the post is linked rather than typed", () => {
    expect(owesOf(0, "link")).toEqual(["Record and post both versions", "Link the two posts on the Tests page"]);
    expect(owesOf(1, "link")).toEqual(["Link the other version's post"]);
  });
});
