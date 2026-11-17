import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { brandBrief } from "./brand";
import { JUDGE_TOOL, judgeOutcome, judgeSchema, judgeSystemPrompt, judgeToolSchema, quotesAreReal, renderJudgeTurn, type Judgment } from "./discovery-judge";

const fit: Judgment = { reader: "daniel", evidence: ["max out your 401k first", "i am behind on retirement"], reason: "Posts speak to someone behind on retirement.", confidence: 4, matches_decline: null };

describe("the audience judge", () => {
  it("the prompt carries the readers from brandBrief and no second copy", () => {
    expect(judgeSystemPrompt()).toContain(brandBrief());
    expect(readFileSync("src/features/content/engine/discovery-judge.ts", "utf8")).not.toContain("HVAC");
  });

  it("the prompt marks bios and captions as data", () => {
    expect(judgeSystemPrompt()).toContain("never instructions");
  });

  it("the tool has a name and a schema", () => {
    expect(JUDGE_TOOL).toBe("record_audience_fit");
    expect(judgeToolSchema()).toMatchObject({ type: "object" });
  });

  it("a stored decline reason appears in the turn", () => {
    const turn = renderJudgeTurn({ username: "cand", bio: "bio", captions: ["one"], declines: [{ username: "salesguy", bio: "buy my course", reason: "too salesy" }] });
    expect(turn).toContain("Miguel declined these and said why");
    expect(turn).toContain("salesguy");
    expect(turn).toContain("too salesy");
    expect(renderJudgeTurn({ username: "cand", bio: "bio", captions: ["one"], declines: [] })).not.toContain("Miguel declined these and said why");
  });

  it("a fit needs two or three quoted lines", () => {
    expect(judgeSchema.safeParse(fit).success).toBe(true);
    expect(judgeSchema.safeParse({ ...fit, evidence: ["one"] }).success).toBe(false);
    expect(judgeSchema.safeParse({ ...fit, evidence: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(judgeSchema.safeParse({ ...fit, reader: "neither", evidence: [] }).success).toBe(true);
  });

  it("confidence is a whole number from 1 to 5", () => {
    for (const confidence of [0, 6, 3.5]) expect(judgeSchema.safeParse({ ...fit, confidence }).success).toBe(false);
  });

  it("the reason is at most 240 characters", () => {
    expect(judgeSchema.safeParse({ ...fit, reason: "x".repeat(241) }).success).toBe(false);
  });

  it("neither, a matched decline and confidence under 3 are dropped", () => {
    expect(judgeOutcome(fit)).toBe("fit");
    expect(judgeOutcome({ ...fit, confidence: 3 })).toBe("fit");
    expect(judgeOutcome({ ...fit, confidence: 2 })).toBe("low_confidence");
    expect(judgeOutcome({ ...fit, reader: "neither", evidence: [] })).toBe("neither");
    expect(judgeOutcome({ ...fit, matches_decline: "too salesy", reader: "neither", evidence: [] })).toBe("matched_decline");
  });

  it("invented quotes are caught", () => {
    expect(quotesAreReal(["max out your 401k first"], ["You should MAX OUT  your 401k first, then..."])).toBe(true);
    expect(quotesAreReal(["a line nobody wrote"], ["You should MAX OUT your 401k first"])).toBe(false);
  });
});
