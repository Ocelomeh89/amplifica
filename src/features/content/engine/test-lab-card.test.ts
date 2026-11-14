import { describe, expect, it } from "vitest";
import { BRAND_CONTEXT } from "./prompts/ideas";
import {
  POSTING_NOTE,
  POSTING_NOTE_LINK,
  cardOutputSchema,
  conclusionSchema,
  conclusionSystemPrompt,
  renderConclusionTurn,
  sentenceCount,
  cardStyleOf,
  cardSystemPrompt,
  cardToolSchema,
  oneDifference,
  questionText,
  renderCardTurn,
  versionCheckSchema,
  type VersionDraft,
} from "./test-lab-card";
import type { Question } from "./test-lab-picker";

const q = (over: Partial<Question> = {}): Question => ({
  rule: 3, kind: "opening", variable: "hook_type", a: "paradox", b: "question",
  held: { topic: "debt", pillar: "w2-advantage" }, ideaIds: ["i1"], reason: "Paradox has won 1 of 2. Is it better than Question, your usual?", ...over,
});
const draft = (label: "a" | "b", over: Partial<VersionDraft> = {}): VersionDraft => ({
  label, hook: `Hook ${label}`, card_text: "", outline: ["One", "Two", "Three"], ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({
  why: "Paradox has won once. This checks it against your usual.",
  versions: [
    { label: "a", hook: "Your paycheck is not the problem.", card_text: "", outline: ["One", "Two", "Three"] },
    { label: "b", hook: "What if your paycheck is the asset?", card_text: "", outline: ["One", "Two", "Three"] },
  ],
  notes: { record_once: "Record the body once.", record_twice: "Record two openings.", cuts: "Only the first line differs." },
  ...over,
});

describe("the card prompt", () => {
  it("carries the brand context, the single difference and the last skip reasons", () => {
    const system = cardSystemPrompt(["Keep hooks under ten words."]);
    expect(system).toContain(BRAND_CONTEXT);
    expect(system).toContain("Keep hooks under ten words.");
    expect(system).toMatch(/brand wins/i);
    const turn = renderCardTurn({
      question: q(),
      ideas: [{ title: "Pay yourself first", hook: "Old hook", topic: "debt" }],
      skipReasons: ["Too salesy", "Already did this", "c", "d", "e", "f-sixth"],
      recentHooks: ["A recent hook"],
    });
    expect(turn).toContain("Does Paradox beat Question?");
    expect(turn).toContain("Pay yourself first");
    expect(turn).toContain("Too salesy");
    expect(turn).toContain("A recent hook");
    expect(turn).not.toContain("f-sixth");
    expect(turn).toMatch(/only the first line|only .*hook type/i);
  });
  it("tells the writer to leave the card text alone in an opening test and to write one added line in a card test", () => {
    const t = renderCardTurn({ question: q({ kind: "card", variable: "onscreen_text", a: "adds-to-hook", b: "none" }), ideas: [{ title: "t", hook: "h", topic: "debt" }], skipReasons: [], recentHooks: [] });
    expect(t).toMatch(/adds-to-hook|Adds to hook/i);
  });
  it("has a tool schema with both versions and the recording notes", () => {
    const s = cardToolSchema() as { required: string[] };
    expect(s.required).toEqual(["why", "versions", "notes"]);
  });
});

describe("cardOutputSchema", () => {
  it("accepts a valid card", () => {
    expect(cardOutputSchema(q()).safeParse(answer()).success).toBe(true);
  });
  it("rejects a 141-character hook and a 2-line outline", () => {
    const long = answer({ versions: [{ label: "a", hook: "x".repeat(141), card_text: "", outline: ["1", "2", "3"] }, answer().versions[1]] });
    expect(cardOutputSchema(q()).safeParse(long).success).toBe(false);
    const short = answer({ versions: [{ label: "a", hook: "ok", card_text: "", outline: ["1", "2"] }, answer().versions[1]] });
    expect(cardOutputSchema(q()).safeParse(short).success).toBe(false);
  });
  it("needs version a then version b, and a why of at most 300 characters", () => {
    const flipped = answer({ versions: [...answer().versions].reverse() });
    expect(cardOutputSchema(q()).safeParse(flipped).success).toBe(false);
    expect(cardOutputSchema(q()).safeParse(answer({ why: "x".repeat(301) })).success).toBe(false);
  });
});

describe("cardStyleOf", () => {
  it.each([
    ["Stop saving.", "", "none"],
    ["Stop saving.", "stop saving", "repeats-hook"],
    ["Stop saving.", "Do this instead", "adds-to-hook"],
    ["Stop saving!", "STOP SAVING.", "repeats-hook"],
  ] as const)("%s with card %s is %s", (hook, card, expected) => {
    expect(cardStyleOf(hook, card)).toBe(expected);
  });
});

describe("oneDifference", () => {
  it("an opening test with equal hooks is false, and with different outlines is false", () => {
    expect(oneDifference("opening", draft("a", { hook: "Same" }), draft("b", { hook: "Same" }))).toBe(false);
    expect(oneDifference("opening", draft("a"), draft("b", { outline: ["One", "Two", "Four"] }))).toBe(false);
    expect(oneDifference("opening", draft("a"), draft("b"))).toBe(true);
  });
  it("a card test whose outlines or hooks differ is false, and needs different card texts", () => {
    const base = { hook: "Same" };
    expect(oneDifference("card", draft("a", { ...base, card_text: "Same" }), draft("b", { ...base, card_text: "" }))).toBe(true);
    expect(oneDifference("card", draft("a", { ...base, outline: ["x", "y", "z"] }), draft("b", base))).toBe(false);
    expect(oneDifference("card", draft("a", { hook: "A" }), draft("b", { hook: "B", card_text: "x" }))).toBe(false);
    expect(oneDifference("card", draft("a", base), draft("b", base))).toBe(false);
  });
  it("a topic test is always one difference", () => {
    expect(oneDifference("topic", draft("a"), draft("b", { hook: "Other", outline: ["q", "r", "s"] }))).toBe(true);
  });
});

describe("the small helpers", () => {
  it("questionText names both values", () => {
    expect(questionText(q(), (v) => v.toUpperCase())).toBe("Does PARADOX beat QUESTION?");
  });
  it("the posting note says what to do and when", () => {
    expect(POSTING_NOTE).toBe("Post both as Trial Reels, within an hour of each other, with the same caption. A day after posting, type each one's numbers here.");
    expect(POSTING_NOTE_LINK).toBe("Post both as Trial Reels, within an hour of each other, with the same caption. Link each one here within a week of posting.");
  });
  it("versionCheckSchema takes a hook type for an opening test and a listed topic for a topic test", () => {
    expect(versionCheckSchema("opening", []).safeParse({ hook_type: "question" }).success).toBe(true);
    expect(versionCheckSchema("opening", []).safeParse({ hook_type: "nope" }).success).toBe(false);
    expect(versionCheckSchema("topic", ["debt", "credit"]).safeParse({ topic: "debt" }).success).toBe(true);
    expect(versionCheckSchema("topic", ["debt", "credit"]).safeParse({ topic: "taxes" }).success).toBe(false);
  });
});

describe("the conclusion", () => {
  const t = {
    question: "Does Ranking beat Question?",
    variable: "hook_type" as const,
    verdict: "a" as const,
    verdict_line: "Ranking won: 2,000 views against 1,100 in the first day.",
    versions: [
      { label: "a" as const, value: "ranking", views_24h: 2000, saves_24h: 40, shares_24h: 12 },
      { label: "b" as const, value: "question", views_24h: 1100, saves_24h: 55, shares_24h: 3 },
    ],
  };
  it("the prompt asks for two sentences and keeps saves and shares from being the reason", () => {
    const p = conclusionSystemPrompt();
    expect(p).toMatch(/two sentences/i);
    expect(p).toMatch(/saves and shares/i);
    expect(p).toMatch(/never/i);
  });
  it("the turn carries the question, each version's value and numbers, and the verdict", () => {
    const turn = renderConclusionTurn(t, (v) => v.toUpperCase());
    for (const part of ["Does Ranking beat Question?", "RANKING", "2,000", "40", "12", "QUESTION", "1,100", "55", "Ranking won"]) expect(turn).toContain(part);
  });
  it("conclusionSchema takes one string of at most 400 characters", () => {
    expect(conclusionSchema.safeParse({ conclusion: "Two short sentences. Here they are." }).success).toBe(true);
    expect(conclusionSchema.safeParse({ conclusion: "x".repeat(401) }).success).toBe(false);
    expect(conclusionSchema.safeParse({ conclusion: "" }).success).toBe(false);
  });
  it("counts sentences", () => {
    expect(sentenceCount("One. Two.")).toBe(2);
    expect(sentenceCount("One. Two. Three.")).toBe(3);
    expect(sentenceCount("It got 2.5x the views. That is plenty.")).toBe(2);
    expect(sentenceCount("A single sentence")).toBe(1);
  });
});
