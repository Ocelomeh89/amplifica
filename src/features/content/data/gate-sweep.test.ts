import { describe, expect, it } from "vitest";
import type { ToolCaller } from "./claude";
import { fakeGateDb } from "./gate.fake";
import { gateFieldsOf, ideaPatchFrom, runGateSweep, type GatingIdea } from "./gate-sweep";

const idea = (id: string): GatingIdea => ({
  id,
  format: "reel",
  title: `Title ${id}`,
  hook: `Hook ${id}`,
  belief_attacked: "b",
  value_to_listener: "v",
  why_it_stops: "w",
  outline: [{ beat: "one", note: "n1" }, { beat: "two", note: "n2" }, { beat: "three", note: "" }],
  gate_attempts: 0,
});
const pass = { verdict: "pass", reader: "stephen", pillar: "expensive-tuition", amplifica_pillar: "the-numbers", failed: [] };
const fail = { verdict: "fail", reader: null, pillar: null, amplifica_pillar: null, failed: [{ item: "reader", reason: "Nobody." }] };
const caller = (responses: unknown[]): ToolCaller => ({
  async call() {
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  },
});
const forever = () => 1000;

describe("runGateSweep", () => {
  it("releases a passing idea to the inbox", async () => {
    const db = fakeGateDb([idea("a")]);
    expect(await runGateSweep(db, caller([pass]), { limit: 10, timeLeft: forever })).toEqual({ passed: 1, failed: 0, errors: 0 });
    expect(db.rows[0].status).toBe("inbox");
  });

  it("moves an unfixable idea to gate_failed", async () => {
    const db = fakeGateDb([idea("a")]);
    const rewrite = { title: "t", hook: "h", belief_attacked: "b", value_to_listener: "v", why_it_stops: "w", outline: ["x", "y", "z"] };
    await runGateSweep(db, caller([{ ...fail, rewrite }, fail]), { limit: 10, timeLeft: forever });
    expect(db.rows[0].status).toBe("gate_failed");
  });

  it("leaves an idea gating and counts an attempt when the gate errors", async () => {
    const db = fakeGateDb([idea("a")]);
    expect(await runGateSweep(db, caller([new Error("down")]), { limit: 10, timeLeft: forever })).toEqual({ passed: 0, failed: 0, errors: 1 });
    expect(db.rows[0]).toMatchObject({ status: "gating", gate_attempts: 1, lastError: "down" });
  });

  it("after the third failed try the idea leaves gating for Didn't pass, with why", async () => {
    const db = fakeGateDb([{ ...idea("a"), gate_attempts: 2 }]);
    await runGateSweep(db, caller([new Error("still down")]), { limit: 10, timeLeft: forever });
    expect(db.rows[0]).toMatchObject({ status: "gate_failed", lastError: "still down" });
  });

  it("stops when less than 70 seconds remain: one idea's two 30-second calls and a margin", async () => {
    const db = fakeGateDb([idea("a"), idea("b")]);
    let left = 200;
    const res = await runGateSweep(db, caller([pass, pass]), { limit: 10, timeLeft: () => (left -= 90) });
    expect(res.passed).toBe(1);
    expect(db.rows[1].status).toBe("gating");
  });

  it("takes a smaller reserve when given one, and checks ideas in parallel up to the concurrency", async () => {
    const db = fakeGateDb([idea("a"), idea("b"), idea("c")]);
    let inFlight = 0;
    let peak = 0;
    const slow: ToolCaller = {
      async call() {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return pass;
      },
    };
    const res = await runGateSweep(db, slow, { limit: 10, timeLeft: () => 100, reserve: 20, concurrency: 2 });
    expect(res.passed).toBe(3);
    expect(peak).toBe(2);
  });

  it("only takes the ids it is given", async () => {
    const db = fakeGateDb([idea("a"), idea("b")]);
    await runGateSweep(db, caller([pass]), { limit: 10, timeLeft: forever, ids: ["b"] });
    expect(db.rows.map((r) => r.status)).toEqual(["gating", "inbox"]);
  });
});

describe("idea fields", () => {
  it("sends outline beats as strings", () => {
    expect(gateFieldsOf(idea("a")).outline).toEqual(["one", "two", "three"]);
  });

  it("keeps notes by position on a rewrite and moves a changed hook to hook_alt", () => {
    const patch = ideaPatchFrom(idea("a"), { title: "T", hook: "New", belief_attacked: "B", value_to_listener: "V", why_it_stops: "W", outline: ["1", "2", "3", "4"] });
    expect(patch.outline).toEqual([{ beat: "1", note: "n1" }, { beat: "2", note: "n2" }, { beat: "3", note: "" }, { beat: "4", note: "" }]);
    expect(patch.hook).toBe("New");
    expect(patch.hook_alt).toBe("Hook a");
  });
});

describe("runGateSweep topic", () => {
  it("a pass writes the gate's topic onto the idea", async () => {
    const db = fakeGateDb([idea("a")], [{ slug: "concentration-risk", label: "The dangers of concentrating wealth", pillar: "expensive-tuition" }]);
    await runGateSweep(db, caller([{ ...pass, topic: "concentration-risk" }]), { limit: 10, timeLeft: forever });
    expect(db.rows[0]).toMatchObject({ status: "inbox", topic: "concentration-risk" });
  });

  it("a topic outside the gate's pillar is not written", async () => {
    const db = fakeGateDb([idea("a")], [{ slug: "predictable-income", label: "x", pillar: "w2-advantage" }]);
    await runGateSweep(db, caller([{ ...pass, topic: "predictable-income" }]), { limit: 10, timeLeft: forever });
    expect(db.rows[0].topic ?? "").toBe("");
  });

  it("a topic list that cannot be read does not stop the sweep", async () => {
    const db = fakeGateDb([idea("a")]);
    db.topics = async () => { throw new Error("db down"); };
    expect(await runGateSweep(db, caller([pass]), { limit: 10, timeLeft: forever })).toEqual({ passed: 1, failed: 0, errors: 0 });
  });
});
