import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { ToolCaller } from "./claude";
import { MissingApiKeyError } from "./claude";
import { runTodayCron } from "./today-cron";
import { NOW, exp, fakeDb, idea } from "./today.fake";

const okCaller: ToolCaller = {
  call: async () => ({ briefs: [{ slot: 1, title: "T", hook: "H", say: ["a", "b", "c"], message: "velocity" }] }),
};

/** A clock that reads `usedSeconds` after the start. */
const clockAt = (usedSeconds: number) => () => new Date(NOW.getTime() + usedSeconds * 1000);

describe("runTodayCron", () => {
  it("expires, judges, then makes the briefs with a timeout from the time left", async () => {
    const f = fakeDb({ ideas: [idea("i1")], experiments: [exp({ id: "old", day: "2026-10-26", idea_id: "i9" })] });
    const timeouts: number[] = [];
    const report = await runTodayCron({ db: f.db, callerFor: (ms) => (timeouts.push(ms), okCaller), startedAt: NOW, now: NOW, clock: clockAt(80) });
    expect(report).toMatchObject({ expired: 1, briefs: 1, error: null });
    expect(timeouts).toEqual([180_000]); // 280 - 80 = 200 left, minus 20 seconds
  });

  it("caps the timeout at 200 seconds", async () => {
    const f = fakeDb({ ideas: [idea("i1")] });
    const timeouts: number[] = [];
    await runTodayCron({ db: f.db, callerFor: (ms) => (timeouts.push(ms), okCaller), startedAt: NOW, now: NOW, clock: clockAt(30) });
    expect(timeouts).toEqual([200_000]);
  });

  it("with under 90 seconds left builds no caller and records a failed run", async () => {
    const f = fakeDb({ ideas: [idea("i1")] });
    const callerFor = vi.fn(() => okCaller);
    const report = await runTodayCron({ db: f.db, callerFor, startedAt: NOW, now: NOW, clock: clockAt(200) });
    expect(callerFor).not.toHaveBeenCalled();
    expect(report).toMatchObject({ briefs: 0, error: "ran out of time" });
    expect(f.runs[0]).toMatchObject({ kind: "cron", status: "failed", error: "ran out of time" });
  });

  it("turns a missing API key into the report's error and a failed run, not a throw", async () => {
    const f = fakeDb({ ideas: [idea("i1")] });
    const report = await runTodayCron({
      db: f.db,
      callerFor: () => {
        throw new MissingApiKeyError();
      },
      startedAt: NOW,
      now: NOW,
      clock: clockAt(10),
    });
    expect(report.briefs).toBe(0);
    expect(report.error).toContain("ANTHROPIC_API_KEY");
    expect(f.runs[0].status).toBe("failed");
  });
});
