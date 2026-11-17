import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { storeFollowers, type AccountStatsDb } from "./account-stats";

function fakeDb() {
  const rows = new Map<string, number>();
  const db: AccountStatsDb = {
    async upsert(r) { rows.set(r.day, r.followers); },
    async latest() {
      const days = [...rows.keys()].sort();
      const d = days[days.length - 1];
      return d ? { day: d, followers: rows.get(d)! } : null;
    },
    async between(from, to) {
      return [...rows.entries()].filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b)).map(([day, followers]) => ({ day, followers }));
    },
  };
  return { db, rows };
}

describe("storeFollowers", () => {
  it("stores today's count under the Chicago day", async () => {
    const { db, rows } = fakeDb();
    const out = await storeFollowers(db, async () => 4812, new Date("2026-11-17T04:30:00Z"));
    expect(out).toEqual({ followers: 4812, error: null });
    expect([...rows.entries()]).toEqual([["2026-11-16", 4812]]);
  });
  it("a second run the same day overwrites the row", async () => {
    const { db, rows } = fakeDb();
    await storeFollowers(db, async () => 100, new Date("2026-11-17T15:00:00Z"));
    await storeFollowers(db, async () => 101, new Date("2026-11-17T18:00:00Z"));
    expect([...rows.entries()]).toEqual([["2026-11-17", 101]]);
  });
  it("a failed pull is reported and stores nothing", async () => {
    const { db, rows } = fakeDb();
    const out = await storeFollowers(db, async () => { throw new Error("composio down"); }, new Date("2026-11-17T15:00:00Z"));
    expect(out).toEqual({ followers: null, error: "composio down" });
    expect(rows.size).toBe(0);
  });
  it("a null pull stores nothing and is not an error", async () => {
    const { db, rows } = fakeDb();
    const out = await storeFollowers(db, async () => null, new Date("2026-11-17T15:00:00Z"));
    expect(out).toEqual({ followers: null, error: null });
    expect(rows.size).toBe(0);
  });
});
