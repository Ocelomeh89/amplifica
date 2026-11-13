import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
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
  type RunRow,
} from "./today";
import { DAY, NOW, candidate, exp, fakeDb, gatePassing, idea } from "./today.fake";
import { BRIEF_TOOL_NAME as BRIEF_TOOL } from "@/features/content/engine/today-brief";

const brief = (slot: number, over: Record<string, unknown> = {}) => ({ slot, title: `T${slot}`, hook: `H${slot}`, say: ["a", "b", "c"], message: "w2-advantage", ...over });
const caller = (out: unknown) => {
  const calls: unknown[] = [];
  return gatePassing({ calls, call: async (input) => (calls.push(input), out) });
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
    expect(made.variable).not.toBe("hook_type");
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
  it("swap rewrites the same brief in place with a test on a different variable", async () => {
    const f = fakeDb({ ideas: [idea("i1")], experiments: [exp({ id: "e1", idea_id: "i1", variable: "hook_type", value: "paradox" })] });
    f.ideas.get("i1")!.status = "queued";
    const start = await swapTest(f.db, "e1", NOW);
    expect(start.ok).toBe(true);
    await runSwap(f.db, caller({ briefs: [brief(1)] }), (start as { runId: string }).runId, "e1", NOW);
    expect(f.experiments).toHaveLength(1);
    expect(f.experiments[0]).toMatchObject({ id: "e1", idea_id: "i1", slot: 1, status: "open" });
    expect(f.experiments[0].variable).not.toBe("hook_type");
    expect(f.runs[0]).toMatchObject({ kind: "swap", status: "ready", experiment_id: "e1" });
  });

  it("a swap whose write fails leaves the old brief as it was and restores the idea", async () => {
    const f = fakeDb({ ideas: [idea("i1")], updateFails: true, experiments: [exp({ id: "e1", idea_id: "i1", variable: "hook_type", value: "paradox" })] });
    f.ideas.get("i1")!.status = "queued";
    const start = await swapTest(f.db, "e1", NOW);
    await runSwap(f.db, caller({ briefs: [brief(1)] }), (start as { runId: string }).runId, "e1", NOW);
    expect(f.experiments[0]).toMatchObject({ id: "e1", variable: "hook_type", value: "paradox", status: "open" });
    expect(f.calls.restore).toEqual(["i1"]);
    expect(f.runs.find((r) => r.kind === "swap")!.status).toBe("failed");
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

describe("review fixes", () => {
  it("day 2 after expiry claims new ideas, not yesterday's expired briefs", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2"), idea("i3")] });
    await generateDaily(f.db, caller({ briefs: [brief(1), brief(2)] }), NOW);
    expect(f.experiments.map((e) => e.idea_id)).toEqual(["i1", "i2"]);
    const DAY2 = new Date("2026-10-28T15:00:00Z");
    expect(await expireUnposted(f.db, DAY2)).toBe(2);
    const r = await generateDaily(f.db, caller({ briefs: [brief(1)] }), DAY2);
    expect(r.made).toBe(1);
    expect(f.experiments.filter((e) => e.day === "2026-10-28").map((e) => e.idea_id)).toEqual(["i3"]);
  });

  it("a refill does not test a variable another live slot holds", async () => {
    const f = fakeDb({ ideas: [idea("i1")], experiments: [exp({ id: "e2", idea_id: "i9", slot: 2, variable: "hook_type", value: "paradox" })] });
    const r = await generateDaily(f.db, caller({ briefs: [brief(1)] }), NOW);
    expect(r.made).toBe(1);
    expect(f.experiments.find((e) => e.slot === 1)!.variable).not.toBe("hook_type");
  });

  it("Make now counts toward the daily cap", async () => {
    const f = fakeDb({ runs: [{ id: "r0", day: DAY, kind: "cron", status: "failed", experiment_id: null, error: "x", created_at: NOW.toISOString() }] });
    for (let i = 0; i < TODAY_DAILY_CAP; i++) {
      const r = await makeNow(f.db, NOW);
      expect(r.ok).toBe(true);
      f.runs.find((x) => x.kind === "cron")!.status = "failed";
    }
    const over = await makeNow(f.db, NOW);
    expect(over).toMatchObject({ ok: false });
    expect((over as { error: string }).error).toContain(String(TODAY_DAILY_CAP));
  });

  it("Make now works again after an empty-Inbox run once the Inbox has ideas", async () => {
    const f = fakeDb({ ideas: [idea("i1")], runs: [{ id: "r0", day: DAY, kind: "cron", status: "ready", experiment_id: null, error: "Inbox is empty", created_at: NOW.toISOString() }] });
    expect(await makeNow(f.db, NOW)).toMatchObject({ ok: true, runId: "r0" });
    expect(f.runs.find((r) => r.id === "r0")).toMatchObject({ status: "pending", error: "" });
  });
});

/** Answers each call with the next output in turn. */
const seq = (...outs: unknown[]): ToolCaller & { calls: { text: string }[] } => {
  const calls: { text: string }[] = [];
  return gatePassing({ calls, call: async (input) => (calls.push(input as { text: string }), outs[Math.min(calls.length - 1, outs.length - 1)]) });
};

describe("slice 6: the competitor brief", () => {
  it("a fresh popular competitor post takes slot 2 as a topic test; slot 1 is a proposed brief", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate() });
    const c = seq({ briefs: [brief(1), brief(2, { hook: "The 401k is the slow lane", title: "Why the 401k is slow" })] });
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 2, error: null });
    const s1 = f.experiments.find((e) => e.slot === 1)!;
    const s2 = f.experiments.find((e) => e.slot === 2)!;
    expect(s1).toMatchObject({ kind: "proposed", idea_id: "i1", competitor_post_id: null });
    expect(s2).toMatchObject({ kind: "competitor", variable: "source", value: "competitor-rebuttal", competitor_post_id: "cp1" });
    expect(s2.reason).toContain("@micro.investing");
    expect(f.calls.competitorSources).toEqual([{ shortcode: "A1", angle: "competitor-rebuttal" }]);
    expect(f.calls.momentIdeas).toHaveLength(1);
    expect(f.calls.briefed).toEqual(["cp1"]);
    expect(c.calls[0].text).toContain("do not reuse its wording");
  });

  it("a format brief claims an Inbox idea, tests the competitor's value, and slot 1 avoids that variable", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate({ post_style: "text-broll" }) });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    const s2 = f.experiments.find((e) => e.slot === 2)!;
    expect(s2).toMatchObject({ kind: "competitor", variable: "post_style", value: "text-broll" });
    expect(["i1", "i2"]).toContain(s2.idea_id);
    expect(f.experiments.find((e) => e.slot === 1)!.variable).not.toBe("post_style");
    expect(f.calls.momentIdeas).toHaveLength(0);
  });

  it("a format note seeds a new-format test and the note travels in the recipe", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate({ post_style: "", format_note: "split screen, two speakers" }) });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    expect(f.experiments.find((e) => e.slot === 2)!).toMatchObject({ value: "new-format", recipe: expect.objectContaining({ format_note: "split screen, two speakers" }) });
  });

  it("no candidate: the day is slice 5's two proposed briefs", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    expect(f.experiments.map((e) => e.kind)).toEqual(["proposed", "proposed"]);
  });

  it("a topic brief needs no Inbox idea", async () => {
    const f = fakeDb({ ideas: [], candidate: candidate() });
    expect(await generateDaily(f.db, seq({ briefs: [brief(2)] }), NOW)).toEqual({ made: 1, error: null });
    expect(f.experiments.map((e) => [e.slot, e.kind])).toEqual([[2, "competitor"]]);
  });

  it("a post never seeds a second brief", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2"), idea("i3"), idea("i4")], candidate: candidate() });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    const DAY2 = new Date("2026-10-28T15:00:00Z");
    await expireUnposted(f.db, DAY2);
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), DAY2);
    expect(f.experiments.filter((e) => e.kind === "competitor")).toHaveLength(1);
  });

  it("a copied brief is regenerated once and kept when the second is clean", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate() });
    const copied = brief(2, { hook: "You should max out your 401k before anything else" });
    const c = seq({ briefs: [brief(1), copied] }, { briefs: [brief(2, { hook: "The 401k is the slow lane" })] });
    await generateDaily(f.db, c, NOW);
    expect(c.calls).toHaveLength(2);
    expect(f.experiments.find((e) => e.slot === 2)!.kind).toBe("competitor");
  });

  it("copied twice: slot 2 becomes a normal proposed brief and the post is used", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate() });
    const copied = brief(2, { say: ["You should max out your 401k before anything else", "b", "c"] });
    const c = seq({ briefs: [brief(1), copied] }, { briefs: [copied] }, { briefs: [brief(2)] });
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 2, error: null });
    expect(c.calls).toHaveLength(3);
    expect(f.experiments.find((e) => e.slot === 2)!).toMatchObject({ kind: "proposed", competitor_post_id: null, idea_id: "i2" });
    expect(f.calls.briefed).toEqual(["cp1"]);
    expect(f.calls.momentIdeas).toHaveLength(0);
  });

  it("swapping a topic brief claims a fresh Inbox idea, returns the competitor idea and clears the link", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate() });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    const s2 = f.experiments.find((e) => e.slot === 2)!;
    const competitorIdea = s2.idea_id;
    const started = await swapTest(f.db, s2.id, NOW);
    if (!started.ok) throw new Error(started.error);
    await runSwap(f.db, seq({ briefs: [brief(2)] }), started.runId, s2.id, NOW);
    expect(f.runs.find((r) => r.id === started.runId)!.status).toBe("ready");
    expect(s2).toMatchObject({ kind: "proposed", competitor_post_id: null, idea_id: "i2" });
    expect(s2.variable).not.toBe("source");
    expect(f.calls.inbox).toContain(competitorIdea);
  });

  it("swapping a format brief keeps the idea and clears the link", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2"), idea("i3")], candidate: candidate({ post_style: "text-broll" }) });
    await generateDaily(f.db, seq({ briefs: [brief(1), brief(2)] }), NOW);
    const s2 = f.experiments.find((e) => e.slot === 2)!;
    const ideaId = s2.idea_id;
    const started = await swapTest(f.db, s2.id, NOW);
    if (!started.ok) throw new Error(started.error);
    await runSwap(f.db, seq({ briefs: [brief(2)] }), started.runId, s2.id, NOW);
    expect(s2).toMatchObject({ kind: "proposed", competitor_post_id: null, idea_id: ideaId });
  });
});

describe("slice 6 review fixes", () => {
  it("a competitor format test never shares a variable with a slot already live today", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], candidate: candidate({ post_style: "text-broll" }), experiments: [exp({ id: "s1", idea_id: "i9", slot: 1, variable: "post_style", value: "animation" })] });
    await generateDaily(f.db, seq({ briefs: [brief(2)] }), NOW);
    expect(f.experiments.find((e) => e.slot === 2)!).toMatchObject({ kind: "competitor", variable: "source" });
  });

  it("a topic brief on an empty Inbox still records the empty Inbox, so Make now works once an idea arrives", async () => {
    const f = fakeDb({ ideas: [], candidate: candidate() });
    expect(await generateDaily(f.db, seq({ briefs: [brief(2)] }), NOW)).toEqual({ made: 1, error: null });
    expect(f.runs.find((r) => r.kind === "cron")).toMatchObject({ status: "ready", error: "Inbox is empty" });
    expect((await makeNow(f.db, NOW)).ok).toBe(true);
  });
});

describe("taste rules and sharpens", () => {
  it("the brief prompt carries the active rules", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], rules: ["Name one real number."] });
    const c = caller({ briefs: [brief(1), brief(2)] });
    await generateDaily(f.db, c, NOW);
    expect((c.calls[0] as { system: string }).system).toContain("- Name one real number.");
  });

  it("claiming an idea for a brief discards its live sharpen first", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    await generateDaily(f.db, caller({ briefs: [brief(1), brief(2)] }), NOW);
    expect(f.calls.discarded.sort()).toEqual(["i1", "i2"]);
  });

  it("a swap discards the sharpen on the idea it rewrites, and the swap prompt carries the rules", async () => {
    const f = fakeDb({ ideas: [idea("i1")], experiments: [exp({ id: "e1", idea_id: "i1" })], rules: ["Take a side."] });
    const started = await swapTest(f.db, "e1", NOW);
    if (!started.ok) throw new Error(started.error);
    const c = caller({ briefs: [brief(1)] });
    await runSwap(f.db, c, started.runId, "e1", NOW);
    expect(f.calls.discarded).toEqual(["i1"]);
    expect((c.calls[0] as { system: string }).system).toContain("- Take a side.");
  });

  it("the moment prompt carries the rules too", async () => {
    const f = fakeDb({ rules: ["Take a side."] });
    const started = await startMoment(f.db, "Flying out at 6am", NOW);
    if (!started.ok) throw new Error(started.error);
    const c = caller({ briefs: [brief(3)] });
    await runMoment(f.db, c, started.runId, "Flying out at 6am", NOW);
    expect((c.calls[0] as { system: string }).system).toContain("- Take a side.");
  });
});

describe("the brand gate on briefs", () => {
  const fail = { verdict: "fail", reader: null, pillar: null, amplifica_pillar: null, failed: [{ item: "reader", reason: "Nobody." }] };
  const failWithRewrite = { ...fail, rewrite: { title: "R", hook: "R hook", say: ["x", "y", "z"] } };

  it("a passing brief is saved and its idea carries the gate record and pillar", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const c = caller({ briefs: [brief(1), brief(2)] });
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 2, error: null });
    expect(c.gateCalls).toHaveLength(2);
    const patched = f.ideas.get(f.experiments[0].idea_id)! as unknown as { gate: { result: { pillar: string } }; pillar: string };
    expect(patched.gate.result.pillar).toBe("w2-advantage");
    expect(patched.pillar).toBe("w2-advantage");
  });

  it("a passing brief writes its topic to the claimed idea", async () => {
    const topics = [{ slug: "predictable-income", label: "Why predictable income supports long-term investing", pillar: "w2-advantage" as const }];
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")], topics });
    const withTopic = { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [], topic: "predictable-income" };
    const c = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) }, { H1: withTopic });
    await generateDaily(f.db, c, NOW);
    const first = f.ideas.get(f.experiments.find((e) => e.slot === 1)!.idea_id)! as unknown as { topic?: string };
    const second = f.ideas.get(f.experiments.find((e) => e.slot === 2)!.idea_id)! as unknown as { topic?: string };
    expect(first.topic).toBe("predictable-income");
    expect(second.topic ?? "").toBe("");
    expect(c.gateCalls[0]).toContain("predictable-income");
  });

  it("a brief that fails after its rewrite leaves its slot empty and its idea untouched", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const gated = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) }, { H2: failWithRewrite });
    let rewriteChecks = 0;
    const c: ToolCaller = { call: async (input) => (input.text.includes("R hook") ? (rewriteChecks++, fail) : gated.call(input)) };
    const r = await generateDaily(f.db, c, NOW);
    expect(r).toEqual({ made: 1, error: null });
    expect(rewriteChecks).toBe(1);
    expect(f.experiments.map((e) => e.slot)).toEqual([1]);
    const untouched = [...f.ideas.values()].find((i) => i.hook === "Hook i2" || i.hook === "Hook i1");
    expect(untouched).toBeDefined();
  });

  it("a pillar mismatch fails the brief", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const mismatch = { verdict: "pass", reader: "daniel", pillar: "life-by-design", amplifica_pillar: "the-numbers", failed: [] };
    const c = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) }, { H1: mismatch });
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 1, error: null });
    expect(f.experiments.map((e) => e.slot)).toEqual([2]);
  });

  it("gates the day's briefs in parallel, so gating costs about one slot's time", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    let inFlight = 0;
    let peak = 0;
    const base = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) });
    const c: ToolCaller = {
      call: async (input) => {
        if (input.tool.name !== BRIEF_TOOL) {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
        }
        return base.call(input);
      },
    };
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 2, error: null });
    expect(peak).toBe(2);
  });

  it("a gate error drops only that slot", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const c = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) }, { H1: new Error("down") });
    expect(await generateDaily(f.db, c, NOW)).toEqual({ made: 1, error: null });
    expect(f.experiments.map((e) => e.slot)).toEqual([2]);
  });

  it("when every brief fails the run fails with a brand message and nothing is patched", async () => {
    const f = fakeDb({ ideas: [idea("i1"), idea("i2")] });
    const c = gatePassing<ToolCaller>({ call: async () => ({ briefs: [brief(1), brief(2)] }) }, { H1: fail, H2: fail });
    const r = await generateDaily(f.db, c, NOW);
    expect(r.made).toBe(0);
    expect(r.error).toBe("None of today's briefs met the brand standard.");
    expect(f.calls.patch).toEqual([]);
  });
});
