import { describe, expect, it } from "vitest";
import { MESSAGES } from "./tags";
import {
  BRIEF_TOOL_NAME,
  briefIdeaPatch,
  briefOutputSchema,
  briefSystemPrompt,
  briefToolSchema,
  momentIdea,
  momentIdeaSchema,
  recipeFor,
  renderBriefTurn,
  type BriefOut,
} from "./today-brief";
import type { Control } from "./experiments";

const held: Control = { hook_type: "question", onscreen_text: "none", cta_type: "save", post_style: "talking-head", cover: "face" };
const brief = (over: Partial<BriefOut> = {}): BriefOut => ({
  slot: 1,
  title: "Why your 401k is slow",
  hook: "Your 401k is slow on purpose.",
  say: ["Say the line.", "Pause.", "Give the one number."],
  message: "velocity",
  ...over,
});

describe("briefOutputSchema", () => {
  const schema = briefOutputSchema([1, 2]);
  it("accepts one brief per requested slot", () => {
    expect(schema.safeParse({ briefs: [brief({ slot: 1 }), brief({ slot: 2 })] }).success).toBe(true);
  });
  it("rejects a missing slot and a duplicate slot", () => {
    expect(schema.safeParse({ briefs: [brief({ slot: 1 })] }).success).toBe(false);
    expect(schema.safeParse({ briefs: [brief({ slot: 1 }), brief({ slot: 1 })] }).success).toBe(false);
  });
  it("rejects a 2-line say, a 141-character hook and an unknown message", () => {
    const one = briefOutputSchema([1]);
    expect(one.safeParse({ briefs: [brief({ say: ["a", "b"] })] }).success).toBe(false);
    expect(one.safeParse({ briefs: [brief({ hook: "x".repeat(141) })] }).success).toBe(false);
    expect(one.safeParse({ briefs: [brief({ message: "freedom" })] }).success).toBe(false);
  });
  it("rejects a message other than the fixed one for a slot testing message", () => {
    const fixed = briefOutputSchema([1], { 1: "scoreboard" });
    expect(fixed.safeParse({ briefs: [brief({ message: "velocity" })] }).success).toBe(false);
    expect(fixed.safeParse({ briefs: [brief({ message: "scoreboard" })] }).success).toBe(true);
  });
  it("the tool schema is named and requires briefs", () => {
    expect(BRIEF_TOOL_NAME).toBe("record_briefs");
    expect((briefToolSchema() as { required: string[] }).required).toEqual(["briefs"]);
  });
});

describe("briefSystemPrompt", () => {
  it("carries the ideas rules and every canon message", () => {
    const p = briefSystemPrompt();
    expect(p).toContain("## What makes an idea good here");
    for (const m of MESSAGES.filter((x) => x !== "none")) expect(p).toContain(m);
  });
});

describe("renderBriefTurn", () => {
  it("names the test, both values, the held-still labels and the idea", () => {
    const turn = renderBriefTurn({
      slots: [{ slot: 1, test: { variable: "hook_type", value: "belief-attacking", control: "question" }, held, idea: { title: "T", hook: "Old hook", pillar: "method" }, moment: "" }],
      winnerHooks: ["W1"],
      recentHooks: ["R1"],
    });
    expect(turn).toContain("Hook type");
    expect(turn).toContain("Belief attacking");
    expect(turn).toContain("Question");
    expect(turn).toContain("Old hook");
    expect(turn).toContain("Held still");
    expect(turn).toContain("W1");
    expect(turn).toContain("R1");
  });
  it("shows the moment for a moment slot", () => {
    const turn = renderBriefTurn({
      slots: [{ slot: 3, test: { variable: "post_style", value: "text-broll", control: "talking-head" }, held, idea: null, moment: "flying out at 6am" }],
      winnerHooks: [],
      recentHooks: [],
    });
    expect(turn).toContain("Moment: flying out at 6am");
  });
});

describe("briefIdeaPatch and recipeFor", () => {
  it("keeps the old hook in hook_alt and takes the tested hook type", () => {
    const patch = briefIdeaPatch(brief(), { variable: "hook_type", value: "paradox", control: "question" }, held, "Old hook");
    expect(patch).toMatchObject({ hook: "Your 401k is slow on purpose.", hook_alt: "Old hook", hook_type: "paradox", status: "queued", score: 1 });
    expect(patch.outline).toEqual([{ beat: "Say the line." }, { beat: "Pause." }, { beat: "Give the one number." }]);
  });
  it("uses the held hook type when another variable is tested", () => {
    expect(briefIdeaPatch(brief(), { variable: "post_style", value: "text-broll", control: "talking-head" }, held, "x").hook_type).toBe("question");
  });
  it("recipeFor replaces the tested held value and adds message and topic", () => {
    expect(recipeFor({ variable: "post_style", value: "text-broll", control: "talking-head" }, held, "velocity", "401k fees")).toEqual({
      ...held,
      post_style: "text-broll",
      message: "velocity",
      topic: "401k fees",
    });
  });
});

describe("momentIdea", () => {
  it("requires a source_id", () => {
    expect(momentIdeaSchema.safeParse({ format: "reel", title: "t", hook: "h" }).success).toBe(false);
  });
  it("builds a Reel idea linked to the moment's source", () => {
    const idea = momentIdea(brief(), { variable: "hook_type", value: "story-moment", control: "question" }, held, "11111111-1111-4111-8111-111111111111", "2026-10-27");
    expect(idea).toMatchObject({ format: "reel", score: 1, batch_date: "2026-10-27", source_id: "11111111-1111-4111-8111-111111111111", hook_type: "story-moment" });
  });
});
