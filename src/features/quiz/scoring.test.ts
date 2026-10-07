import { describe, expect, it } from "vitest";
import { ARCHETYPE_KEYS, QUESTIONS, QUIZ_LENGTH, type ArchetypeKey } from "./content";
import { parseAnswers, rankArchetypes, scoreAnswers } from "./scoring";

function zeros(): Record<ArchetypeKey, number> {
  return Object.fromEntries(ARCHETYPE_KEYS.map((k) => [k, 0])) as Record<ArchetypeKey, number>;
}

/** For each question, pick the option that gives `key` its 2 points; fall back to option 0. */
function answersFor(key: ArchetypeKey): number[] {
  return QUESTIONS.map((q) => {
    const i = q.options.findIndex((o) => o.weights[key] === 2);
    return i === -1 ? 0 : i;
  });
}

describe("parseAnswers", () => {
  it("accepts exactly 15 comma-separated digits from 0 to 4", () => {
    expect(parseAnswers("0,1,2,3,4,0,1,2,3,4,0,1,2,3,4")).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  });

  it.each([
    ["too short", "0,1,2"],
    ["too long", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["out of range", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,5"],
    ["negative", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1"],
    ["non-numeric", "a,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["decimal", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.5"],
    ["spaces", "0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(parseAnswers(raw)).toBeNull();
  });
});

describe("rankArchetypes", () => {
  it("orders by score, highest first", () => {
    const s = zeros();
    s["acquirer"] = 9;
    s["serial-dabbler"] = 4;
    expect(rankArchetypes(s).slice(0, 2)).toEqual(["acquirer", "serial-dabbler"]);
  });

  it("breaks ties by the fixed archetype order", () => {
    const s = zeros();
    s["acquirer"] = 7;
    s["recovering-debt-aholic"] = 7;
    s["etf-optimizer"] = 7;
    expect(rankArchetypes(s).slice(0, 3)).toEqual([
      "recovering-debt-aholic",
      "etf-optimizer",
      "acquirer",
    ]);
  });

  it("with all zeros returns the tie-break order itself", () => {
    expect(rankArchetypes(zeros())).toEqual([...ARCHETYPE_KEYS]);
  });
});

describe("scoreAnswers", () => {
  it("sums weights across all 15 answers", () => {
    const answers = answersFor("autopilot-saver");
    const { scores } = scoreAnswers(answers);
    const expected = QUESTIONS.reduce(
      (sum, q, i) => sum + (q.options[answers[i]].weights["autopilot-saver"] ?? 0),
      0
    );
    expect(scores["autopilot-saver"]).toBe(expected);
  });

  it.each(ARCHETYPE_KEYS.map((k) => [k]))("lets %s win when answered consistently", (key) => {
    const result = scoreAnswers(answersFor(key));
    expect(result.archetype).toBe(key);
    expect(result.runnerUp).not.toBe(key);
  });

  it("reports a runner-up that differs from the winner", () => {
    const { archetype, runnerUp } = scoreAnswers(new Array(QUIZ_LENGTH).fill(0));
    expect(runnerUp).not.toBe(archetype);
  });

  it("throws on the wrong number of answers or an out-of-range answer", () => {
    expect(() => scoreAnswers([0, 1])).toThrow();
    expect(() => scoreAnswers(new Array(QUIZ_LENGTH).fill(9))).toThrow();
  });
});
