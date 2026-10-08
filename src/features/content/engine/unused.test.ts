import { describe, expect, it } from "vitest";
import { ageDays, partitionUnused, reviveFields, unusedReason, UNPOSTED_DAYS, UNREVIEWED_DAYS } from "./unused";

const NOW = new Date("2026-10-31T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

const inbox = (days: number) => ({ status: "inbox", batch_date: dateAgo(days), feedback_at: null, created_at: daysAgo(days) });
const queued = (days: number) => ({ status: "queued", batch_date: dateAgo(60), feedback_at: daysAgo(days), created_at: daysAgo(60) });

describe("ageDays", () => {
  it("counts whole days", () => {
    expect(ageDays(daysAgo(3), NOW)).toBe(3);
    expect(ageDays(new Date(NOW.getTime() - 3.9 * 86_400_000).toISOString(), NOW)).toBe(3);
  });
});

describe("unusedReason: inbox boundaries", () => {
  it("14 days old is not yet unused; 15 is", () => {
    expect(unusedReason(inbox(13), NOW)).toBeNull();
    expect(unusedReason(inbox(UNREVIEWED_DAYS), NOW)).toBeNull();
    expect(unusedReason(inbox(UNREVIEWED_DAYS + 1), NOW)).toBe("unreviewed");
  });
});

describe("unusedReason: queued boundaries", () => {
  it("30 days since the Like is not yet unused; 31 is", () => {
    expect(unusedReason(queued(29), NOW)).toBeNull();
    expect(unusedReason(queued(UNPOSTED_DAYS), NOW)).toBeNull();
    expect(unusedReason(queued(UNPOSTED_DAYS + 1), NOW)).toBe("unposted");
  });
  it("falls back to created_at when feedback_at is missing", () => {
    expect(unusedReason({ status: "queued", batch_date: dateAgo(1), feedback_at: null, created_at: daysAgo(40) }, NOW)).toBe("unposted");
  });
});

describe("unusedReason: deliberate decisions are never unused", () => {
  it.each(["rejected", "archived", "posted"])("%s", (status) => {
    expect(unusedReason({ ...inbox(400), status }, NOW)).toBeNull();
  });
});

describe("partitionUnused", () => {
  it("splits fresh from unused, annotating reason and age, and sorts unused newest first", () => {
    const rows = [
      { id: "old", ...inbox(40) },
      { id: "fresh", ...inbox(2) },
      { id: "mid", ...inbox(20) },
      { id: "q", ...queued(35) },
    ];
    const { fresh, unused } = partitionUnused(rows, NOW);
    expect(fresh.map((r) => r.id)).toEqual(["fresh"]);
    expect(unused.map((r) => [r.id, r.reason, r.age_days])).toEqual([
      ["mid", "unreviewed", 20],
      ["q", "unposted", 35],
      ["old", "unreviewed", 40],
    ]);
  });
});

describe("reviveFields", () => {
  it("returns the idea to the inbox with today's batch date and no rank or like time", () => {
    expect(reviveFields(NOW)).toEqual({ status: "inbox", batch_date: "2026-10-31", queue_rank: null, feedback_at: null });
  });
  it("a revived idea is no longer unused", () => {
    const f = reviveFields(NOW);
    expect(unusedReason({ status: f.status, batch_date: f.batch_date, feedback_at: f.feedback_at, created_at: daysAgo(90) }, NOW)).toBeNull();
  });
});
