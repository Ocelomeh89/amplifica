import { describe, expect, it } from "vitest";
import { HOOK_TYPES } from "./tags";
import { PILLAR_SLUGS } from "./brand";
import { EMPTY_FOCUS } from "./focus";
import type { ValueCount } from "./experiments";
import { currentBest, pickQuestions, type PastTest, type PickerInput, type Question } from "./test-lab-picker";

const P1 = PILLAR_SLUGS[0];
const P2 = PILLAR_SLUGS[1];
const TODAY = "2026-11-16";
const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T10:00:00Z`) - n * 86_400_000).toISOString();

const row = (value: string, won: number, total: number): ValueCount => ({ value, won, lost: total - won, flat: 0, total, share: total ? won / total : 0 });
const TOPICS = [
  { slug: "paycheck", label: "Paycheck", pillar: P1 },
  { slug: "debt", label: "Debt", pillar: P1 },
  { slug: "credit", label: "Credit", pillar: P1 },
  { slug: "taxes", label: "Taxes", pillar: P2 },
  { slug: "retire", label: "Retirement", pillar: P2 },
];
const IDEAS = [
  { id: "i-paycheck", topic: "paycheck", pillar: P1 },
  { id: "i-debt", topic: "debt", pillar: P1 },
  { id: "i-credit", topic: "credit", pillar: P1 },
  { id: "i-taxes", topic: "taxes", pillar: P2 },
  { id: "i-retire", topic: "retire", pillar: P2 },
];

/** Every value is explored (at least 5 posts, none won) unless the test says otherwise, so only the rule under test fires. */
function quiet(): Pick<PickerInput, "counts"> {
  return {
    counts: {
      hook_type: HOOK_TYPES.map((h) => row(h, 0, 5)),
      topic: TOPICS.map((t) => row(t.slug, 0, 5)),
      onscreen_text: ["repeats-hook", "adds-to-hook", "none"].map((v) => row(v, 0, 5)),
    },
  };
}
const withRows = (base: PickerInput["counts"], over: Partial<Record<"hook_type" | "topic" | "onscreen_text", ValueCount[]>>): PickerInput["counts"] => {
  const merge = (list: ValueCount[], extra: ValueCount[] = []) => [...list.filter((r) => !extra.some((e) => e.value === r.value)), ...extra];
  return {
    hook_type: merge(base.hook_type, over.hook_type),
    topic: merge(base.topic, over.topic),
    onscreen_text: merge(base.onscreen_text, over.onscreen_text),
  };
};
const input = (over: Partial<PickerInput> = {}): PickerInput => ({
  ...quiet(),
  control: { hook_type: "question", onscreen_text: "repeats-hook" },
  focus: EMPTY_FOCUS,
  hookWinTopics: {},
  endedSkips: [],
  topics: TOPICS,
  ideas: IDEAS,
  past: [],
  today: TODAY,
  ...over,
});
const past = (over: Partial<PastTest>): PastTest => ({
  variable: "hook_type", a: "question", b: "ranking", status: "judged", verdict: "a",
  held: { topic: "paycheck", pillar: P1 }, opened_at: daysAgo(10), judged_at: daysAgo(8), ...over,
});
const find = (qs: Question[], f: Partial<Question>) => qs.find((q) => (Object.entries(f) as [keyof Question, unknown][]).every(([k, v]) => q[k] === v));

describe("rule 1, the neighbor of the last winner", () => {
  it("after a win for hook X on topic T, the next test is an opening test of X against the next hook, on a different topic in T's pillar", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("question", 3, 3), row("ranking", 1, 3), row("paradox", 2, 3)] });
    const qs = pickQuestions(input({ counts, past: [past({})] }));
    expect(qs[0]).toMatchObject({ rule: 1, kind: "opening", variable: "hook_type", a: "question", b: "paradox", ideaIds: ["i-debt"] });
    expect(qs[0].held.topic).not.toBe("paycheck");
    expect(qs[0].held.pillar).toBe(P1);
    expect(qs[0].held.topic).toBe("debt");
  });

  it("does not fire when the last judged test had no clear winner", () => {
    const qs = pickQuestions(input({ past: [past({ verdict: "none" })] }));
    expect(qs.every((q) => q.rule !== 1)).toBe(true);
  });

  it("looks only at the newest judged test", () => {
    const older = past({ judged_at: daysAgo(30), opened_at: daysAgo(32), a: "paradox", b: "story-moment" });
    const newer = past({ verdict: "none", judged_at: daysAgo(5), opened_at: daysAgo(7) });
    expect(pickQuestions(input({ past: [older, newer] })).every((q) => q.rule !== 1)).toBe(true);
  });

  it("for a topic win stays in the pillar and keeps the hook", () => {
    const counts = withRows(quiet().counts, { topic: [row("paycheck", 3, 3), row("debt", 2, 3), row("credit", 1, 3)] });
    const t = past({ variable: "topic", a: "paycheck", b: "taxes", held: { hook_type: "paradox", pillar: P1 } });
    const q = pickQuestions(input({ counts, past: [t] }))[0];
    expect(q).toMatchObject({ rule: 1, kind: "topic", variable: "topic", a: "paycheck", b: "debt", ideaIds: ["i-paycheck", "i-debt"] });
    expect(q.held).toEqual({ hook_type: "paradox", pillar: P1 });
  });

  it("for a card win uses the remaining style and a different hook", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("paradox", 3, 4), row("question", 4, 4)] });
    const t = past({ variable: "onscreen_text", a: "adds-to-hook", b: "none", held: { hook_type: "question", topic: "paycheck", pillar: P1 } });
    const q = pickQuestions(input({ counts, past: [t] }))[0];
    expect(q).toMatchObject({ rule: 1, kind: "card", variable: "onscreen_text", a: "adds-to-hook", b: "repeats-hook" });
    expect(q.held.hook_type).toBe("paradox");
    expect(q.ideaIds).toHaveLength(1);
  });
});

describe("rule 2, confirm a double-down", () => {
  const focus = { ...EMPTY_FOCUS, doubleDown: { hook_type: ["paradox"], topic: [] } };
  it("needs every win on one topic, and tests on a different topic", () => {
    const q = find(pickQuestions(input({ focus, hookWinTopics: { paradox: ["paycheck"] } })), { rule: 2 });
    expect(q).toMatchObject({ kind: "opening", a: "paradox", b: "question" });
    expect(q?.held.topic).not.toBe("paycheck");
    expect(find(pickQuestions(input({ focus, hookWinTopics: { paradox: ["paycheck", "debt"] } })), { rule: 2 })).toBeUndefined();
    expect(find(pickQuestions(input({ focus, hookWinTopics: { paradox: [] } })), { rule: 2 })).toBeUndefined();
  });
});

describe("rules 3 to 5", () => {
  it("rule 3 settles a hook with one or two posts and a win against the current best", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("paradox", 1, 2)] });
    expect(find(pickQuestions(input({ counts })), { rule: 3 })).toMatchObject({ kind: "opening", a: "paradox", b: "question" });
  });

  it("a card test is proposed with no prior card win, by rule 3 and by rule 5", () => {
    const viaRule3 = pickQuestions(input({ counts: withRows(quiet().counts, { onscreen_text: [row("adds-to-hook", 1, 2)] }) }));
    expect(find(viaRule3, { rule: 3, kind: "card" })).toMatchObject({ a: "adds-to-hook", b: "repeats-hook" });
    const viaRule5 = pickQuestions(input({ counts: withRows(quiet().counts, { onscreen_text: [row("none", 0, 0)] }) }));
    expect(find(viaRule5, { rule: 5, kind: "card" })).toMatchObject({ a: "none", b: "repeats-hook" });
    expect(find(viaRule5, { rule: 5, kind: "card" })?.held.hook_type).toBe("question");
  });

  it("rule 4 brings back a skip that ended in the last 28 days, and ignores one that ended 29 days ago", () => {
    const at = (n: number) => daysAgo(n).slice(0, 10);
    const q = find(pickQuestions(input({ endedSkips: [{ dimension: "hook_type", value: "warning", ended_on: at(28) }] })), { rule: 4 });
    expect(q).toMatchObject({ kind: "opening", a: "warning", b: "question" });
    expect(find(pickQuestions(input({ endedSkips: [{ dimension: "hook_type", value: "warning", ended_on: at(29) }] })), { rule: 4 })).toBeUndefined();
  });

  it("rule 4 leaves out a value a later test has included", () => {
    const later = past({ a: "warning", b: "question", status: "open", verdict: null, opened_at: daysAgo(3), judged_at: null });
    const qs = pickQuestions(input({ endedSkips: [{ dimension: "hook_type", value: "warning", ended_on: daysAgo(10).slice(0, 10) }], past: [later] }));
    expect(find(qs, { rule: 4 })).toBeUndefined();
  });

  it("rule 5 tries an unexplored value of each variable, hooks before topics before card styles", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("warning", 0, 0)], topic: [row("retire", 0, 0)], onscreen_text: [row("none", 0, 0)] });
    const five = pickQuestions(input({ counts })).filter((q) => q.rule === 5);
    expect(five.map((q) => q.variable)).toEqual(["hook_type", "topic", "onscreen_text"]);
    expect(five[1]).toMatchObject({ kind: "topic", a: "retire" });
  });
});

describe("what a question may not be", () => {
  const rich = () => {
    const counts = withRows(quiet().counts, {
      hook_type: [row("paradox", 1, 2), row("warning", 0, 0), row("question", 4, 5)],
      topic: [row("debt", 1, 2), row("retire", 0, 0)],
      onscreen_text: [row("adds-to-hook", 1, 2), row("none", 0, 0)],
    });
    return input({ counts, focus: { ...EMPTY_FOCUS, doubleDown: { hook_type: ["question"], topic: [] } }, hookWinTopics: { question: ["paycheck"] }, endedSkips: [{ dimension: "hook_type", value: "ranking", ended_on: daysAgo(5).slice(0, 10) }] });
  };

  it("never proposes a value under an active skip", () => {
    const skip = { hook_type: ["paradox", "warning"], topic: ["debt"] };
    const qs = pickQuestions({ ...rich(), focus: { ...EMPTY_FOCUS, skip } });
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      const used = q.variable === "hook_type" ? [q.a, q.b] : [];
      const usedTopic = q.variable === "topic" ? [q.a, q.b] : [];
      expect(used.some((v) => skip.hook_type.includes(v)), JSON.stringify(q)).toBe(false);
      expect(usedTopic.some((v) => skip.topic.includes(v)), JSON.stringify(q)).toBe(false);
      expect(skip.hook_type.includes(q.held.hook_type ?? ""), JSON.stringify(q)).toBe(false);
      expect(skip.topic.includes(q.held.topic ?? ""), JSON.stringify(q)).toBe(false);
    }
  });

  it("does not repeat the same pair inside 90 days, in either order", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("paradox", 1, 2)] });
    const target = (qs: Question[]) => qs.find((q) => q.variable === "hook_type" && q.a === "paradox" && q.b === "question");
    const open = (n: number, over: Partial<PastTest> = {}) => past({ a: "question", b: "paradox", status: "open", verdict: null, opened_at: daysAgo(n), judged_at: null, ...over });
    expect(target(pickQuestions(input({ counts })))).toBeDefined();
    expect(target(pickQuestions(input({ counts, past: [open(89)] })))).toBeUndefined();
    expect(target(pickQuestions(input({ counts, past: [open(91)] })))).toBeDefined();
    expect(target(pickQuestions(input({ counts, past: [open(5, { status: "failed", opened_at: null })] })))).toBeDefined();
  });

  it("never has two versions of the same hook type in an opening test", () => {
    const qs = pickQuestions(rich());
    expect(qs.some((q) => q.kind === "opening")).toBe(true);
    for (const q of qs) if (q.kind === "opening") expect(q.a).not.toBe(q.b);
    for (const q of qs) expect(q.a).not.toBe(q.b);
  });

  it("returns rules in order 1 to 5, hooks before topics before card styles inside a rule", () => {
    const base = rich();
    const t = past({ a: "question", b: "ranking", verdict: "a" });
    const qs = pickQuestions({ ...base, past: [t] });
    const rules = qs.map((q) => q.rule);
    expect(rules).toEqual([...rules].sort((x, y) => x - y));
    expect(new Set(rules).size).toBeGreaterThanOrEqual(4);
    const order = ["hook_type", "topic", "onscreen_text"];
    for (const r of [3, 5]) {
      const vs = qs.filter((q) => q.rule === r).map((q) => order.indexOf(q.variable));
      expect(vs).toEqual([...vs].sort((x, y) => x - y));
    }
  });

  it("leaves out a question with no idea to carry it", () => {
    const counts = withRows(quiet().counts, { topic: [row("retire", 0, 0)] });
    const one = pickQuestions(input({ counts, ideas: [{ id: "i-taxes", topic: "taxes", pillar: P2 }] }));
    expect(find(one, { kind: "topic" })).toBeUndefined();
    const two = pickQuestions(input({ counts, ideas: [{ id: "i-taxes", topic: "taxes", pillar: P2 }, { id: "i-retire", topic: "retire", pillar: P2 }] }));
    expect(find(two, { kind: "topic", a: "retire" })?.ideaIds).toEqual(["i-retire", "i-taxes"]);
    expect(pickQuestions(input({ counts: withRows(quiet().counts, { hook_type: [row("warning", 0, 0)] }), ideas: [] }))).toEqual([]);
  });

  it("a topic test keeps both topics in one pillar", () => {
    const counts = withRows(quiet().counts, { topic: [row("retire", 0, 0), row("paycheck", 5, 5)] });
    const q = find(pickQuestions(input({ counts })), { kind: "topic", a: "retire" });
    expect(q?.b).toBe("taxes");
    expect(q?.held.pillar).toBe(P2);
  });
});

describe("currentBest", () => {
  it("is the control for hooks and card styles, and the unskipped topic with the most wins", () => {
    const counts = withRows(quiet().counts, { topic: [row("debt", 4, 5), row("paycheck", 4, 6), row("taxes", 4, 5)] });
    const i = input({ counts });
    expect(currentBest("hook_type", i)).toBe("question");
    expect(currentBest("onscreen_text", i)).toBe("repeats-hook");
    expect(currentBest("topic", i)).toBe("debt");
    expect(currentBest("topic", { ...i, focus: { ...EMPTY_FOCUS, skip: { hook_type: [], topic: ["debt"] } } })).toBe("taxes");
  });
});

describe("the reason", () => {
  const reason = (q: Question | undefined) => q?.reason;
  it("matches each rule's text", () => {
    const counts = withRows(quiet().counts, { hook_type: [row("question", 3, 3), row("ranking", 1, 3), row("paradox", 2, 3)] });
    expect(reason(find(pickQuestions(input({ counts, past: [past({})] })), { rule: 1 }))).toBe("Question won its last test on Paycheck. Does it still beat Paradox on a different topic?");

    const tcounts = withRows(quiet().counts, { topic: [row("paycheck", 3, 3), row("debt", 2, 3)] });
    const tt = past({ variable: "topic", a: "paycheck", b: "taxes", held: { hook_type: "paradox", pillar: P1 } });
    expect(reason(find(pickQuestions(input({ counts: tcounts, past: [tt] })), { rule: 1 }))).toBe("Paycheck won its last test. Does it beat Debt, with the same hook?");

    const ct = past({ variable: "onscreen_text", a: "adds-to-hook", b: "none", held: { hook_type: "question", topic: "paycheck", pillar: P1 } });
    expect(reason(find(pickQuestions(input({ past: [ct] })), { rule: 1 }))).toMatch(/^Adds to hook won its last test\. Does it beat .+ under a different hook\?$/);

    const focus = { ...EMPTY_FOCUS, doubleDown: { hook_type: ["paradox"], topic: [] } };
    expect(reason(find(pickQuestions(input({ focus, hookWinTopics: { paradox: ["paycheck"] } })), { rule: 2 }))).toBe("Paradox keeps winning, but only on Paycheck. Does it beat Question on a different topic?");

    const c3 = withRows(quiet().counts, { hook_type: [row("paradox", 1, 2)] });
    expect(reason(find(pickQuestions(input({ counts: c3 })), { rule: 3 }))).toBe("Paradox has won 1 of 2. Is it better than Question, your usual?");

    expect(reason(find(pickQuestions(input({ endedSkips: [{ dimension: "hook_type", value: "warning", ended_on: daysAgo(5).slice(0, 10) }] })), { rule: 4 }))).toBe("Warning is back after 90 days off. Is it better than Question now?");

    const c5 = withRows(quiet().counts, { hook_type: [row("warning", 0, 0)] });
    expect(reason(find(pickQuestions(input({ counts: c5 })), { rule: 5 }))).toBe("You have not tried Warning in the last 90 days. Is it better than Question, your usual?");
  });
});
