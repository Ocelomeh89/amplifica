import { describe, expect, it } from "vitest";
import {
  PROPOSAL_TOOL_NAME,
  mergeProposal,
  normalizeRule,
  proposalOutputSchema,
  proposalSystemPrompt,
  proposalToolSchema,
  renderProposalTurn,
  type NoteLite,
  type RuleLite,
} from "./taste";

const note = (id: string, over: Partial<NoteLite> = {}): NoteLite => ({
  id,
  chips: ["Hook too weak"],
  text: "too generic",
  source: "sharpen",
  idea: { title: "401k thoughts", hook: "Should you max your 401k?" },
  ...over,
});
const rule = (id: string, text: string, status: RuleLite["status"]): RuleLite => ({ id, rule: text, status });

describe("normalizeRule", () => {
  it("lowercases, turns punctuation into spaces and collapses whitespace", () => {
    expect(normalizeRule("  Open on the BELIEF,  never a question! ")).toBe("open on the belief never a question");
  });
});

describe("mergeProposal", () => {
  it("drops a new rule that repeats a rejected rule in other case and punctuation", () => {
    const rules = [rule("r1", "Open on the belief, never a question.", "rejected")];
    expect(mergeProposal({ new_rules: [{ rule: "open on the belief never a question", note_ids: ["n1"] }], evidence: [] }, rules, ["n1"])).toEqual({ inserts: [], evidence: [] });
  });

  it("drops a repeat of a turned-off rule too", () => {
    const rules = [rule("r1", "Name one number.", "off")];
    expect(mergeProposal({ new_rules: [{ rule: "name one number", note_ids: ["n1"] }], evidence: [] }, rules, ["n1"])).toEqual({ inserts: [], evidence: [] });
  });

  it("turns a repeat of an active or proposed rule into evidence for it", () => {
    const rules = [rule("r2", "Name one real number in the hook", "active"), rule("r3", "Take a side.", "proposed")];
    const out = mergeProposal(
      { new_rules: [{ rule: "Name one real number in the hook.", note_ids: ["n1", "n2"] }, { rule: "take a side", note_ids: ["n3"] }], evidence: [] },
      rules,
      ["n1", "n2", "n3"]
    );
    expect(out).toEqual({ inserts: [], evidence: [{ rule_id: "r2", note_ids: ["n1", "n2"] }, { rule_id: "r3", note_ids: ["n3"] }] });
  });

  it("drops cited notes that were not in this proposal, and entries left with none", () => {
    const out = mergeProposal({ new_rules: [{ rule: "A", note_ids: ["zz"] }, { rule: "B", note_ids: ["n1", "zz"] }], evidence: [] }, [], ["n1"]);
    expect(out.inserts).toEqual([{ rule: "B", note_ids: ["n1"] }]);
  });

  it("drops evidence for unknown, off and rejected rules and merges evidence for the same rule", () => {
    const rules = [rule("r1", "A", "active"), rule("r2", "B", "rejected"), rule("r3", "C", "off")];
    const out = mergeProposal(
      { new_rules: [], evidence: [{ rule_id: "r1", note_ids: ["n1"] }, { rule_id: "r1", note_ids: ["n1", "n2"] }, { rule_id: "r2", note_ids: ["n1"] }, { rule_id: "r3", note_ids: ["n1"] }, { rule_id: "nope", note_ids: ["n1"] }] },
      rules,
      ["n1", "n2"]
    );
    expect(out.evidence).toEqual([{ rule_id: "r1", note_ids: ["n1", "n2"] }]);
  });

  it("merges two new rules with the same normalized text into one insert", () => {
    const out = mergeProposal({ new_rules: [{ rule: "Take a side.", note_ids: ["n1"] }, { rule: "take a side", note_ids: ["n2"] }], evidence: [] }, [], ["n1", "n2"]);
    expect(out.inserts).toEqual([{ rule: "Take a side.", note_ids: ["n1", "n2"] }]);
  });
});

describe("proposalOutputSchema and tool", () => {
  it("requires at least one cited note per rule and 200 characters at most", () => {
    expect(proposalOutputSchema.safeParse({ new_rules: [{ rule: "x", note_ids: [] }], evidence: [] }).success).toBe(false);
    expect(proposalOutputSchema.safeParse({ new_rules: [{ rule: "x".repeat(201), note_ids: ["n1"] }], evidence: [] }).success).toBe(false);
    expect(proposalOutputSchema.safeParse({ new_rules: [{ rule: "ok", note_ids: ["n1"] }], evidence: [] }).success).toBe(true);
    expect(PROPOSAL_TOOL_NAME).toBe("record_rules");
    expect((proposalToolSchema() as { required: string[] }).required).toEqual(["new_rules", "evidence"]);
  });
});

describe("prompt and turn", () => {
  it("forbids re-proposing rejected or turned-off rules and formatting rules", () => {
    const p = proposalSystemPrompt();
    expect(p).toMatch(/never re-propose a rejected or turned-off rule/i);
    expect(p).toMatch(/not about formatting/i);
  });

  it("lists notes with their id and idea, and rules grouped by status", () => {
    const t = renderProposalTurn({
      notes: [note("n1"), note("n2", { source: "pass", chips: [], text: "boring topic", idea: null })],
      rules: [rule("r1", "Take a side.", "active"), rule("r2", "Avoid questions.", "rejected"), rule("r3", "Cite a source.", "proposed"), rule("r4", "Be brief.", "off")],
    });
    expect(t).toContain("[n1]");
    expect(t).toContain("Should you max your 401k?");
    expect(t).toContain("Hook too weak");
    expect(t).toContain("[n2] Pass: boring topic");
    for (const heading of ["Active:", "Waiting for review:", "Turned off:", "Rejected:"]) expect(t).toContain(heading);
    expect(t).toContain("[r2] Avoid questions.");
  });
});
