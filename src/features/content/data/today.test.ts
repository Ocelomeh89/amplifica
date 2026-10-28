import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { evidenceCounts, type Evidence, type LiveTest } from "@/features/content/engine/experiments";
import type { Multiplier } from "@/features/content/engine/baseline";
import type { ToolCaller } from "./claude";
import { MissingApiKeyError } from "./claude";
import {
  TODAY_DAILY_CAP,
  expireUnposted,
  generateDaily,
  judgeDue,
  makeNow,
  runMoment,
  runSwap,
  skipBrief,
  startMoment,
  swapTest,
  type ExperimentRow,
  type IdeaLite,
  type RunRow,
  type TodayDb,
} from "./today";

const NOW = new Date("2026-10-27T15:00:00Z"); // 10:00 Chicago
const DAY = "2026-10-27";

function evidence(): Evidence {
  const ev = evidenceCounts([], new Map(), new Date(0));
  const set = (v: keyof Evidence, value: string, total: number, won: number) => {
    const r = ev[v].find((x) => x.value === value)!;
    r.total = total;
    r.won = won;
    r.share = total === 0 ? 0 : won / total;
  };
  set("hook_type", "question", 5, 4);
  set("hook_type", "paradox", 3, 2);
  set("post_style", "talking-head", 6, 4);
  set("post_style", "text-broll", 2, 1);
  return ev;
}

type Snapshot = { hook: string; hook_alt: string | null; hook_type: string; title: string; outline: unknown; status: string; score: number };

function fakeDb(opts: { ideas?: IdeaLite[]; patchFails?: string[]; experiments?: ExperimentRow[]; runs?: RunRow[]; posted?: { exp: ExperimentRow; posted_at: string }[]; math?: Map<string, { multiplier: Multiplier; normalized: null }> } = {}) {
  const ideas = new Map<string, IdeaLite & { hook_alt: string | null; status: string }>();
  for (const i of opts.ideas ?? []) ideas.set(i.id, { ...i, hook_alt: null, status: "inbox" });
  const experiments: ExperimentRow[] = [...(opts.experiments ?? [])];
  const runs: RunRow[] = [...(opts.runs ?? [])];
  const calls = { patch: [] as string[], restore: [] as string[], inbox: [] as string[], sources: [] as string[], momentIdeas: [] as unknown[], runsInserted: 0 };
  let seq = 0;
  const impl: Partial<TodayDb> = {
    async evidence() {
      return { ev: evidence(), winnerHooks: ["W"], recentHooks: ["R"] };
    },
    async liveTests(): Promise<LiveTest[]> {
      return experiments.filter((e) => e.status === "open" || e.status === "posted").map((e) => ({ variable: e.variable, value: e.value }));
    },
    async liveSlots(day) {
      return experiments.filter((e) => e.day === day && ["open", "posted", "judged", "unjudged"].includes(e.status));
    },
    async unclaimedInboxIdeas(limit) {
      return [...ideas.values()].filter((i) => i.status === "inbox").slice(0, limit);
    },
    async idea(id) {
      return ideas.get(id) ?? null;
    },
    async getExperiment(id) {
      return experiments.find((e) => e.id === id) ?? null;
    },
    async insertExperiment(row) {
      const id = `e${++seq}`;
      experiments.push({ ...row, id, created_at: NOW.toISOString() });
      return id;
    },
    async updateExperiment(id, patch) {
      Object.assign(experiments.find((e) => e.id === id)!, patch);
    },
    async patchIdea(id, patch) {
      if (opts.patchFails?.includes(id)) return null;
      const i = ideas.get(id);
      if (!i || (i.status !== "inbox" && i.status !== "queued")) return null;
      calls.patch.push(id);
      const before: Snapshot = { hook: i.hook, hook_alt: i.hook_alt, hook_type: "", title: i.title, outline: [], status: i.status, score: 0 };
      Object.assign(i, patch);
      return before;
    },
    async restoreIdea(id, snap) {
      calls.restore.push(id);
      Object.assign(ideas.get(id)!, snap);
    },
    async returnToInbox(id) {
      calls.inbox.push(id);
      const i = ideas.get(id);
      if (i) i.status = "inbox";
    },
    async insertMomentSource(moment) {
      calls.sources.push(moment);
      return "11111111-1111-4111-8111-111111111111";
    },
    async insertMomentIdea(idea) {
      calls.momentIdeas.push(idea);
      const id = `idea-m${++seq}`;
      ideas.set(id, { id, title: idea.title, hook: idea.hook, pillar: "", hook_alt: null, status: "queued" });
      return id;
    },
    async runFor(day, kind) {
      return runs.find((r) => r.day === day && r.kind === kind) ?? null;
    },
    async getRun(id) {
      return runs.find((r) => r.id === id) ?? null;
    },
    async insertRun(row) {
      calls.runsInserted += 1;
      if (row.kind === "cron" && runs.some((r) => r.day === row.day && r.kind === "cron")) return null;
      const id = `r${++seq}`;
      runs.push({ id, day: row.day, kind: row.kind, status: "pending", experiment_id: null, error: "", created_at: NOW.toISOString() });
      return id;
    },
    async updateRun(id, patch) {
      Object.assign(runs.find((r) => r.id === id)!, patch);
    },
    async countRunsSince() {
      return runs.filter((r) => r.kind !== "cron").length;
    },
    async openBefore(day) {
      return experiments.filter((e) => e.status === "open" && e.day < day);
    },
    async postedToJudge() {
      return opts.posted ?? [];
    },
    async postMath(ids) {
      return new Map(ids.map((id) => [id, opts.math?.get(id) ?? { multiplier: { n_views: null, mode: "none" as const, day: null, thin: false }, normalized: null }]));
    },
  };
  const db = impl as TodayDb;
  return { db, ideas, experiments, runs, calls };
}

const idea = (id: string, title = `Idea ${id}`): IdeaLite => ({ id, title, hook: `Hook ${id}`, pillar: "method", hook_alt: null, status: "inbox" });
const exp = (over: Partial<ExperimentRow> = {}): ExperimentRow => ({
  id: "e0",
  idea_id: "i1",
  day: DAY,
  slot: 1,
  kind: "proposed",
  moment: "",
  variable: "hook_type",
  value: "paradox",
  recipe: {},
  reason: "",
  status: "open",
  post_id: null,
  judge_at: null,
  verdict: null,
  judge_metrics: {},
  judged_at: null,
  created_at: NOW.toISOString(),
  ...over,
});

const brief = (slot: number, over: Record<string, unknown> = {}) => ({ slot, title: `T${slot}`, hook: `H${slot}`, say: ["a", "b", "c"], message: "velocity", ...over });
const caller = (out: unknown): ToolCaller & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return { calls, call: async (input) => (calls.push(input), out) };
};

describe("expireUnposted", () => {
  it("skips yesterday's open briefs and returns their ideas to the Inbox; today's stay", async () => {
    const f = fakeDb({ experiments: [exp({ id: "old", day: "2026-10-26", idea_id: "i1" }), exp({ id: "new", day: DAY, idea_id: "i2" })] });
    const n = await expireUnposted(f.db, NOW);
    expect(n).toBe(1);
    expect(f.experiments.find((e) => e.id === "old")!.status).toBe("skipped");
    expect(f.experiments.find((e) => e.id === "new")!.status).toBe("open");
    expect(f.calls.inbox).toEqual(["i1"]);
  });
});

describe("judgeDue", () => {
  it("judges a posted experiment at matched day 7 and leaves a day-5 one", async () => {
    const a = exp({ id: "a", status: "posted", post_id: "pa" });
    const b = exp({ id: "b", status: "posted", post_id: "pb" });
    const math = new Map([
      ["pa", { multiplier: { n_views: 1.8, mode: "matched" as const, day: 7, thin: false }, normalized: null }],
      ["pb", { multiplier: { n_views: 2, mode: "matched" as const, day: 5, thin: false }, normalized: null }],
    ]);
    const f = fakeDb({ experiments: [a, b], posted: [{ exp: a, posted_at: "2026-10-18T12:00:00Z" }, { exp: b, posted_at: "2026-10-22T12:00:00Z" }], math });
    const r = await judgeDue(f.db, NOW);
    expect(r).toEqual({ judged: 1, unjudged: 0 });
    expect(f.experiments.find((e) => e.id === "a")).toMatchObject({ status: "judged", verdict: "won" });
    expect(f.experiments.find((e) => e.id === "b")!.status).toBe("posted");
  });
});

describe("generateDaily", () => {
  it("makes two experiments on different variables and ideas, patches both ideas, run ready", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2"), idea("i3")] });
    const c = caller({ briefs: [brief(1), brief(2)] });
    const r = await generateDaily(f.db, c, NOW);
    expect(r).toEqual({ made: 2, error: null });
    expect(f.experiments).toHaveLength(2);
    expect(f.experiments[0].variable).not.toBe(f.experiments[1].variable);
    expect(f.experiments.map((e) => e.idea_id)).toEqual(["i1", "i2"]);
    expect(f.experiments[0].reason).not.toBe("");
    expect(f.ideas.get("i1")).toMatchObject({ status: "queued", hook: "H1", hook_alt: "Hook i1" });
    expect(f.runs[0]).toMatchObject({ kind: "cron", status: "ready" });
  });

  it("makes one experiment when the Inbox holds one idea", async () => {
    const f = fakeDb({ ideas: [idea("i1")] });
    const r = await generateDaily(f.db, caller({ briefs: [brief(1)] }), NOW);
    expect(r.made).toBe(1);
  });

  it("records a ready run and makes nothing when the Inbox is empty", async () => {
    const f = fakeDb({ ideas: [] });
    const c = caller({});
    const r = await generateDaily(f.db, c, NOW);
    expect(r.made).toBe(0);
    expect(c.calls).toHaveLength(0);
    expect(f.runs[0]).toMatchObject({ status: "ready", error: "Inbox is empty" });
  });

  it("records a failed run when the caller throws the missing-key error", async () => {
    const f = fakeDb({ ideas: [idea("i1")] });
    const c: ToolCaller = { call: async () => { throw new MissingApiKeyError(); } };
    const r = await generateDaily(f.db, c, NOW);
    expect(r.made).toBe(0);
    expect(r.error).toContain("ANTHROPIC_API_KEY");
    expect(f.runs[0].status).toBe("failed");
    expect(f.experiments).toHaveLength(0);
  });

  it("fails the run, restores the first idea and makes no experiment when the second idea is gone", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], patchFails: ["i2"] });
    const r = await generateDaily(f.db, caller({ briefs: [brief(1), brief(2)] }), NOW);
    expect(r.made).toBe(0);
    expect(f.runs[0].status).toBe("failed");
    expect(f.calls.restore).toEqual(["i1"]);
    expect(f.experiments).toHaveLength(0);
  });

  it("fails the run with the validation message and patches nothing when a slot is missing", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const r = await generateDaily(f.db, caller({ briefs: [brief(1)] }), NOW);
    expect(r.made).toBe(0);
    expect(f.runs[0].status).toBe("failed");
    expect(f.runs[0].error).toContain("slots 1, 2");
    expect(f.calls.patch).toEqual([]);
  });

  it("does not run twice on one day", async () => {
    const f = fakeDb({ ideas: [idea("i1")], runs: [{ id: "r0", day: DAY, kind: "cron", status: "ready", experiment_id: null, error: "", created_at: NOW.toISOString() }] });
    const c = caller({ briefs: [brief(1)] });
    const r = await generateDaily(f.db, c, NOW);
    expect(r.made).toBe(0);
    expect(c.calls).toHaveLength(0);
  });
});

describe("makeNow", () => {
  it("reuses a failed cron run", async () => {
    const f = fakeDb({ runs: [{ id: "r0", day: DAY, kind: "cron", status: "failed", experiment_id: null, error: "ran out of time", created_at: NOW.toISOString() }] });
    const r = await makeNow(f.db, NOW);
    expect(r).toEqual({ ok: true, runId: "r0" });
    expect(f.runs[0]).toMatchObject({ status: "pending", error: "" });
  });

  it("refuses at the daily cap", async () => {
    const runs: RunRow[] = Array.from({ length: TODAY_DAILY_CAP }, (_, i) => ({ id: `s${i}`, day: DAY, kind: "swap" as const, status: "ready" as const, experiment_id: null, error: "", created_at: NOW.toISOString() }));
    const f = fakeDb({ runs: [...runs, { id: "r0", day: DAY, kind: "cron", status: "failed", experiment_id: null, error: "x", created_at: NOW.toISOString() }] });
    const r = await makeNow(f.db, NOW);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain(String(TODAY_DAILY_CAP));
  });
});

describe("startMoment and runMoment", () => {
  it("refuses an empty moment, a taken slot 3 and the cap", async () => {
    expect(await startMoment(fakeDb().db, "   ", NOW)).toMatchObject({ ok: false });
    const taken = fakeDb({ experiments: [exp({ slot: 3, kind: "moment" })] });
    expect(await startMoment(taken.db, "flying out at 6am", NOW)).toMatchObject({ ok: false, error: expect.stringContaining("moment") });
    const runs: RunRow[] = Array.from({ length: TODAY_DAILY_CAP }, (_, i) => ({ id: `s${i}`, day: DAY, kind: "moment" as const, status: "ready" as const, experiment_id: null, error: "", created_at: NOW.toISOString() }));
    const capped = fakeDb({ runs });
    expect(await startMoment(capped.db, "x", NOW)).toMatchObject({ ok: false, error: expect.stringContaining(String(TODAY_DAILY_CAP)) });
  });

  it("makes a source, a Reel idea and a moment experiment on a test no live brief holds", async () => {
    const f = fakeDb({ experiments: [exp({ id: "e1", slot: 1, variable: "hook_type", value: "paradox" })] });
    const start = await startMoment(f.db, "flying out at 6am", NOW);
    expect(start.ok).toBe(true);
    await runMoment(f.db, caller({ briefs: [brief(3)] }), (start as { runId: string }).runId, "flying out at 6am", NOW);
    expect(f.calls.sources).toEqual(["flying out at 6am"]);
    const made = f.experiments.find((e) => e.kind === "moment")!;
    expect(made).toMatchObject({ slot: 3, moment: "flying out at 6am", status: "open" });
    expect(`${made.variable}:${made.value}`).not.toBe("hook_type:paradox");
    expect(f.runs.find((r) => r.kind === "moment")).toMatchObject({ status: "ready", experiment_id: made.id });
  });

  it("never throws: a bad answer fails the run", async () => {
    const f = fakeDb();
    const start = await startMoment(f.db, "x", NOW);
    await runMoment(f.db, caller({ briefs: [] }), (start as { runId: string }).runId, "x", NOW);
    expect(f.runs[0].status).toBe("failed");
  });
});

describe("swapTest and skipBrief", () => {
  it("swap replaces the test on the same idea with a different variable; the old row is discarded", async () => {
    const f = fakeDb({ ideas: [idea("i1")], experiments: [exp({ id: "e1", idea_id: "i1", variable: "hook_type", value: "paradox" })] });
    f.ideas.get("i1")!.status = "queued";
    const start = await swapTest(f.db, "e1", NOW);
    expect(start.ok).toBe(true);
    await runSwap(f.db, caller({ briefs: [brief(1)] }), (start as { runId: string }).runId, "e1", NOW);
    expect(f.experiments.find((e) => e.id === "e1")!.status).toBe("discarded");
    const fresh = f.experiments.find((e) => e.id !== "e1")!;
    expect(fresh).toMatchObject({ idea_id: "i1", slot: 1, status: "open" });
    expect(fresh.variable).not.toBe("hook_type");
  });

  it("skip sets skipped and returns the idea to the Inbox", async () => {
    const f = fakeDb({ experiments: [exp({ id: "e1", idea_id: "i1" })] });
    expect(await skipBrief(f.db, "e1")).toEqual({ error: null });
    expect(f.experiments[0].status).toBe("skipped");
    expect(f.calls.inbox).toEqual(["i1"]);
  });

  it("skip refuses a brief that is already posted", async () => {
    const f = fakeDb({ experiments: [exp({ id: "e1", status: "posted" })] });
    expect((await skipBrief(f.db, "e1")).error).not.toBeNull();
  });
});
