import { describe, expect, it } from "vitest";
import { bestTimes } from "./best-times";
import { buildPlan, DEFAULT_CADENCE, mondayOf, type QueueIdea } from "./plan";
import type { Format } from "./types";

const empty = (): Record<Format, QueueIdea[]> => ({ reel: [], youtube: [], newsletter: [], story: [], x: [] });
const idea = (id: string, format: Format, chain_id: string | null = null): QueueIdea => ({ id, format, hook: `hook ${id}`, chain_id });

describe("mondayOf", () => {
  it("returns the Monday of the week containing the date, as an ISO date", () => {
    expect(mondayOf(new Date("2026-09-24T15:00:00Z"))).toBe("2026-09-21"); // Thursday
    expect(mondayOf(new Date("2026-09-21T00:00:00Z"))).toBe("2026-09-21"); // Monday
    expect(mondayOf(new Date("2026-09-27T23:00:00Z"))).toBe("2026-09-21"); // Sunday
  });
});

describe("buildPlan", () => {
  const noData = bestTimes([]);

  it("fills the default cadence from fallback times when there is no data", () => {
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    const byFormat = (f: Format) => slots.filter((s) => s.format === f);
    expect(byFormat("reel")).toHaveLength(3);
    expect(byFormat("newsletter")).toHaveLength(1);
    expect(byFormat("x")).toHaveLength(0);
    // A Story on every posting day, and the days are distinct.
    const postingDays = new Set(slots.filter((s) => s.format !== "story").map((s) => s.day));
    expect(byFormat("story").map((s) => s.day).sort()).toEqual([...postingDays].sort());
    expect(slots.every((s) => s.idea_id === null)).toBe(true);
    // Sorted by weekday then hour, days are ISO dates inside the week.
    expect(slots[0].day >= "2026-09-21" && slots[slots.length - 1].day <= "2026-09-27").toBe(true);
  });

  it("schedules YouTube every second week, deterministically", () => {
    const a = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    const b = buildPlan({ weekStart: "2026-09-28", cadence: DEFAULT_CADENCE, cells: noData, queues: empty() });
    expect(a.filter((s) => s.format === "youtube").length + b.filter((s) => s.format === "youtube").length).toBe(1);
  });

  it("prefers usable best-time cells and distinct weekdays", () => {
    const cells = bestTimes([
      ...["2026-09-21", "2026-09-14", "2026-09-07"].map((d) => post(`${d}T23:00:00Z`, 3)), // Mon 18 usable
      ...["2026-09-22", "2026-09-15", "2026-09-08"].map((d) => post(`${d}T23:00:00Z`, 2)), // Tue 18 usable
      ...["2026-09-21", "2026-09-14", "2026-09-07"].map((d) => post(`${d}T13:00:00Z`, 1)), // Mon 08 usable
    ]);
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells, queues: empty() });
    const reels = slots.filter((s) => s.format === "reel").map((s) => `${s.weekday}:${s.hour}`);
    expect(reels).toContain("0:18");
    expect(reels).toContain("1:18");
    expect(reels).not.toContain("0:8"); // Monday already used; third slot comes from fallback
  });

  it("assigns queued ideas in rank order and pulls chain mates forward", () => {
    const queues = empty();
    queues.reel = [idea("r1", "reel", "chain-A"), idea("r2", "reel", null), idea("r3", "reel", "chain-A"), idea("r4", "reel", null)];
    queues.newsletter = [idea("n1", "newsletter")];
    queues.story = [idea("s1", "story")];
    const slots = buildPlan({ weekStart: "2026-09-21", cadence: DEFAULT_CADENCE, cells: noData, queues });
    expect(slots.filter((s) => s.format === "reel").map((s) => s.idea_id)).toEqual(["r1", "r3", "r2"]);
    expect(slots.find((s) => s.format === "newsletter")!.idea_id).toBe("n1");
    const stories = slots.filter((s) => s.format === "story");
    expect(stories[0].idea_id).toBe("s1");
    expect(stories[1].idea_id).toBeNull();
  });
});

function post(posted_at: string, n_reach: number) {
  return {
    id: posted_at, platform: "instagram" as const, format: "reel", pillar: "", hook_type: "", hook_used: "",
    posted_at, metrics: {}, first: null, reach: null, saves_rate: null, shares_rate: null, watch_s: null,
    n_saves: null, n_shares: null, n_watch: null, n_reach,
  };
}
