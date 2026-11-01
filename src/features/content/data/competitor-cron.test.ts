import { describe, expect, it, vi } from "vitest";
import type { ToolCaller } from "./claude";
import { runCompetitorCron } from "./competitor-cron";
import { fakeApify, fakeCompetitorsDb } from "./competitors.fake";

const MONDAY = new Date("2026-11-02T11:00:00Z");
const watching = { id: "c1", username: "micro.investing", status: "watching" as const, last_pulled_at: null, last_pull_status: null };
const caller: ToolCaller = { call: async () => ({}) };

describe("runCompetitorCron", () => {
  it("collects before starting, then tags", async () => {
    const order: string[] = [];
    const { db } = fakeCompetitorsDb({ creators: [watching] });
    const base = fakeApify().apify;
    const apify = {
      getRun: base.getRun,
      datasetItems: base.datasetItems,
      startRun: async (a: { usernames: string[]; newerThanDays: number }) => (order.push("start"), base.startRun(a)),
    };
    const spied = { ...db, pendingRuns: async () => (order.push("collect"), db.pendingRuns()), postsForMedians: async (s: string) => (order.push("tag"), db.postsForMedians(s)) };
    const report = await runCompetitorCron({ db: spied, apifyFor: () => apify, callerFor: () => caller, now: MONDAY, force: false, timeLeft: () => 250 });
    expect(order.filter((x, i) => order.indexOf(x) === i)).toEqual(["collect", "start", "tag"]);
    expect(report).toEqual({ started: true, stored: 0, failed: 0, tagged: 0, error: null });
  });

  it("missing Apify credentials report an error, do not throw, and still tag", async () => {
    const { db } = fakeCompetitorsDb({ creators: [watching] });
    const callerFor = vi.fn(() => caller);
    const report = await runCompetitorCron({
      db,
      apifyFor: () => {
        throw new Error("COMPOSIO_APIFY_CONNECTION_ID must be set");
      },
      callerFor,
      now: MONDAY,
      force: false,
      timeLeft: () => 250,
    });
    expect(report.error).toMatch(/COMPOSIO_APIFY_CONNECTION_ID/);
    expect(report.started).toBe(false);
  });

  it("passes force through on a Tuesday", async () => {
    const { db } = fakeCompetitorsDb({ creators: [watching] });
    const { apify, started } = fakeApify();
    await runCompetitorCron({ db, apifyFor: () => apify, callerFor: () => caller, now: new Date("2026-11-03T11:00:00Z"), force: true, timeLeft: () => 250 });
    expect(started).toHaveLength(1);
  });

  it("a missing Claude key is reported, not thrown", async () => {
    const { db } = fakeCompetitorsDb({ creators: [watching] });
    const report = await runCompetitorCron({
      db,
      apifyFor: () => fakeApify().apify,
      callerFor: () => {
        throw new Error("ANTHROPIC_API_KEY is not set.");
      },
      now: MONDAY,
      force: false,
      timeLeft: () => 250,
    });
    expect(report.error).toMatch(/ANTHROPIC_API_KEY/);
  });
});
