import { describe, expect, it } from "vitest";
import type { ToolCaller } from "./claude";
import { addManualRule, approveRule, proposalDue, recordPassNote, rejectRule, runProposal, setRuleOn, startProposal } from "./taste";
import { NOW, fakeTasteDb, noteRow, ruleRow } from "./taste.fake";

const five = () => Array.from({ length: 5 }, (_, i) => noteRow(`n${i + 1}`));
const answer = (out: unknown): ToolCaller & { calls: { text: string }[] } => {
  const calls: { text: string }[] = [];
  return { calls, call: async (input) => (calls.push(input as never), out) };
};

describe("notes and when a proposal is due", () => {
  it("a pass with a reason stores a pass note; an empty reason stores none", async () => {
    const f = fakeTasteDb();
    await recordPassNote(f.db, "i1", "  boring topic ");
    await recordPassNote(f.db, "i2", "   ");
    expect(f.notes.map((n) => [n.source, n.text, n.chips])).toEqual([["pass", "boring topic", []]]);
  });

  it("the fifth unused note makes a proposal due, the fourth does not", async () => {
    const four = fakeTasteDb({ notes: five().slice(0, 4) });
    expect(await proposalDue(four.db)).toBe(false);
    expect((await recordPassNote(four.db, "i9", "weak")).due).toBe(true);
  });

  it("notes a proposal already read do not count", async () => {
    const f = fakeTasteDb({ notes: [...five().slice(0, 4), noteRow("old", { proposal_id: "p0" })] });
    expect(await proposalDue(f.db)).toBe(false);
  });
});

describe("startProposal and runProposal", () => {
  it("refuses a manual proposal with no unused note", async () => {
    const f = fakeTasteDb();
    expect(await startProposal(f.db, "manual", NOW)).toEqual({ ok: false, error: "No new notes to learn from yet." });
  });

  it("refuses the fourth proposal of the day and a second while one is pending", async () => {
    const f = fakeTasteDb({ notes: five() });
    for (let k = 0; k < 3; k++) {
      const r = await startProposal(f.db, "manual", NOW);
      if (!r.ok) throw new Error(r.error);
      await f.db.finishProposal(r.id, { status: "ready" });
    }
    expect(await startProposal(f.db, "manual", NOW)).toEqual({ ok: false, error: "That's 3 proposals today. Try again tomorrow." });
    const g = fakeTasteDb({ notes: five() });
    await startProposal(g.db, "auto", NOW);
    expect(await startProposal(g.db, "manual", NOW)).toEqual({ ok: false, error: "Rules are already being proposed." });
  });

  it("inserts proposed derived rules with their cited notes and marks the notes used", async () => {
    const f = fakeTasteDb({ notes: five() });
    const s = await startProposal(f.db, "auto", NOW);
    if (!s.ok) throw new Error(s.error);
    const c = answer({ new_rules: [{ rule: "Open on the belief.", note_ids: ["n1", "n2"] }], evidence: [] });
    await runProposal(f.db, c, s.id, NOW);
    expect(f.rules).toHaveLength(1);
    expect(f.rules[0]).toMatchObject({ rule: "Open on the belief.", status: "proposed", origin: "derived", note_ids: ["n1", "n2"], evidence_count: 2 });
    expect(f.notes.every((n) => n.proposal_id === s.id)).toBe(true);
    expect(f.proposals[0].status).toBe("ready");
    expect(c.calls[0].text).toContain("[n1]");
  });

  it("adds evidence to an existing active rule without changing its status", async () => {
    const f = fakeTasteDb({ notes: five(), rules: [ruleRow("r1", "Name one number.", "active", { evidence_count: 2, note_ids: ["old"] })] });
    const s = await startProposal(f.db, "manual", NOW);
    if (!s.ok) throw new Error(s.error);
    await runProposal(f.db, answer({ new_rules: [], evidence: [{ rule_id: "r1", note_ids: ["n3"] }] }), s.id, NOW);
    expect(f.rules[0]).toMatchObject({ status: "active", evidence_count: 3, note_ids: ["old", "n3"] });
  });

  it("a failed proposal leaves its notes unused for the next one", async () => {
    const f = fakeTasteDb({ notes: five() });
    const s = await startProposal(f.db, "auto", NOW);
    if (!s.ok) throw new Error(s.error);
    await runProposal(f.db, { call: async () => { throw new Error("boom"); } }, s.id, NOW);
    expect(f.proposals[0]).toMatchObject({ status: "failed", error: "boom" });
    expect(f.notes.filter((n) => n.proposal_id === null)).toHaveLength(5);
    expect(f.rules).toHaveLength(0);
  });

  it("a bad answer, and a write that fails, both fail the proposal and use no notes", async () => {
    const bad = fakeTasteDb({ notes: five() });
    const s = await startProposal(bad.db, "auto", NOW);
    if (!s.ok) throw new Error(s.error);
    await runProposal(bad.db, answer({ new_rules: "nope" }), s.id, NOW);
    expect(bad.proposals[0].status).toBe("failed");
    const broken = fakeTasteDb({ notes: five(), applyFails: true });
    const t = await startProposal(broken.db, "auto", NOW);
    if (!t.ok) throw new Error(t.error);
    await runProposal(broken.db, answer({ new_rules: [{ rule: "x", note_ids: ["n1"] }], evidence: [] }), t.id, NOW);
    expect(broken.proposals[0]).toMatchObject({ status: "failed", error: "apply failed" });
    expect(broken.notes.filter((n) => n.proposal_id === null)).toHaveLength(5);
  });
});

describe("approval", () => {
  it("approve makes a proposed rule active, with edited text trimmed; reject sets rejected", async () => {
    const f = fakeTasteDb({ rules: [ruleRow("r1", "Old", "proposed"), ruleRow("r2", "Other", "proposed")] });
    expect(await approveRule(f.db, "r1", "  New wording  ")).toEqual({ error: null });
    expect(f.rules[0]).toMatchObject({ rule: "New wording", status: "active" });
    expect(await rejectRule(f.db, "r2")).toEqual({ error: null });
    expect(f.rules[1].status).toBe("rejected");
  });

  it("refuses an empty or over-long edit, and neither approve nor reject works on an active rule", async () => {
    const f = fakeTasteDb({ rules: [ruleRow("r1", "A", "proposed"), ruleRow("r2", "B", "active")] });
    expect(await approveRule(f.db, "r1", "   ")).toEqual({ error: "A rule needs some words." });
    expect(await approveRule(f.db, "r1", "x".repeat(201))).toEqual({ error: "Keep a rule under 200 characters." });
    expect(f.rules[0].status).toBe("proposed");
    expect(await approveRule(f.db, "r2")).toEqual({ error: "Only a proposed rule can be approved." });
    expect(await rejectRule(f.db, "r2")).toEqual({ error: "Only a proposed rule can be rejected." });
  });

  it("turning a rule off and on moves it between active and off; a rejected rule stays rejected", async () => {
    const f = fakeTasteDb({ rules: [ruleRow("r1", "A", "active"), ruleRow("r2", "B", "rejected")] });
    expect(await setRuleOn(f.db, "r1", false)).toEqual({ error: null });
    expect(f.rules[0].status).toBe("off");
    expect(await setRuleOn(f.db, "r1", true)).toEqual({ error: null });
    expect(f.rules[0].status).toBe("active");
    expect(await setRuleOn(f.db, "r2", true)).toEqual({ error: "Only an active or turned-off rule can be switched." });
  });

  it("a manual rule is active at once; empty or over-long text is refused", async () => {
    const f = fakeTasteDb();
    expect(await addManualRule(f.db, "  Take a side.  ")).toEqual({ error: null });
    expect(f.rules[0]).toMatchObject({ rule: "Take a side.", status: "active", origin: "manual" });
    expect(await addManualRule(f.db, " ")).toEqual({ error: "A rule needs some words." });
    expect(await addManualRule(f.db, "x".repeat(201))).toEqual({ error: "Keep a rule under 200 characters." });
  });
});
