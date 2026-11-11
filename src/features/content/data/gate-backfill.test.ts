import { describe, expect, it } from "vitest";
import type { ToolCaller } from "./claude";
import { withGatePass } from "./gate.fake";
import { runBackfill, type BackfillDb, type BackfillIdea } from "./gate-backfill";

const idea = (id: string, over: Partial<BackfillIdea> = {}): BackfillIdea => ({
  id,
  format: "reel",
  title: `Title ${id}`,
  hook: `Hook ${id}`,
  belief_attacked: "b",
  value_to_listener: "v",
  why_it_stops: "w",
  outline: [{ beat: "one", note: "" }, { beat: "two", note: "" }, { beat: "three", note: "" }],
  gate_attempts: 0,
  status: "inbox",
  queue_rank: null,
  held: false,
  ...over,
});

function fakeDb(ideas: BackfillIdea[]) {
  const calls = { pass: [] as string[], fail: [] as [string, string][], skip: [] as string[], refresh: [] as string[] };
  const db: BackfillDb & { calls: typeof calls } = {
    calls,
    async candidates(limit) {
      return ideas.slice(0, limit);
    },
    async applyPass(i) {
      calls.pass.push(i.id);
    },
    async applyFail(i) {
      calls.fail.push([i.id, i.status]);
    },
    async markSkipped(id) {
      calls.skip.push(id);
    },
    async refreshClickUp(id) {
      calls.refresh.push(id);
    },
  };
  return db;
}

const failV = { verdict: "fail", reader: null, pillar: null, amplifica_pillar: null, failed: [{ item: "reader", reason: "Nobody." }] };
/** A fail that offers a rewrite which still fails its re-check (its hook keeps the original text). */
const failHard = (id: string) => ({ ...failV, rewrite: { title: "T", hook: `Hook ${id} again`, belief_attacked: "b", value_to_listener: "v", why_it_stops: "w", outline: ["one", "two", "three"] } });
const forever = () => 1000;

describe("runBackfill", () => {
  it("a dry run reports counts and samples and writes nothing", async () => {
    const db = fakeDb([idea("a"), idea("b"), idea("c", { held: true })]);
    const c = withGatePass({ call: async () => ({}) }, (t) => (t.includes("Hook b") ? failHard("b") : undefined));
    const r = await runBackfill(db, c, { dryRun: true, limit: 25, timeLeft: forever });
    expect(r).toMatchObject({ checked: 2, passed: 1, rewritten: 0, failed: 1, skipped: 1, errors: 0 });
    expect(r.samples.find((s) => s.id === "b")).toMatchObject({ outcome: "failed", reasons: ["Written for Daniel or Stephen: Nobody."] });
    expect(db.calls).toEqual({ pass: [], fail: [], skip: [], refresh: [] });
  });

  it("a real run applies passes, refreshes a queued idea's ClickUp task when its text changed, and fails others out of their list", async () => {
    const db = fakeDb([idea("a", { status: "queued", queue_rank: 2 }), idea("b", { status: "queued", queue_rank: 3 })]);
    const rewrite = { title: "T", hook: "New hook", belief_attacked: "b", value_to_listener: "v", why_it_stops: "w", outline: ["one", "two", "three"] };
    const c = withGatePass({ call: async () => ({}) }, (t) => (t.includes("Hook a") ? { ...failV, rewrite } : t.includes("Hook b") ? failHard("b") : undefined));
    const r = await runBackfill(db, c, { dryRun: false, limit: 25, timeLeft: forever });
    expect(r).toMatchObject({ passed: 1, rewritten: 1, failed: 1 });
    expect(db.calls.pass).toEqual(["a"]);
    expect(db.calls.refresh).toEqual(["a"]);
    expect(db.calls.fail).toEqual([["b", "queued"]]);
  });

  it("marks a held idea (drafted, filed, or in a brief) as passed without a check", async () => {
    const db = fakeDb([idea("a", { held: true })]);
    const c = withGatePass({ call: async () => ({}) });
    const r = await runBackfill(db, c, { dryRun: false, limit: 25, timeLeft: forever });
    expect(r.skipped).toBe(1);
    expect(db.calls.skip).toEqual(["a"]);
    expect(c.gateCalls).toHaveLength(0);
  });

  it("respects the limit and counts gate errors without writing", async () => {
    const db = fakeDb([idea("a"), idea("b"), idea("c")]);
    const c: ToolCaller = withGatePass({ call: async () => ({}) }, () => new Error("down"));
    const r = await runBackfill(db, c, { dryRun: false, limit: 2, timeLeft: forever });
    expect(r).toMatchObject({ checked: 2, errors: 2, passed: 0 });
    expect(db.calls.pass).toEqual([]);
  });
});
