import { describe, expect, it } from "vitest";
import {
  SHARP_MARKS,
  SHARPEN_TOOL_NAME,
  sharpenIdeaPatch,
  sharpenOutputSchema,
  sharpenSystemPrompt,
  sharpenToolSchema,
  renderSharpenTurn,
  type SharpenIdea,
  type SharpenOption,
} from "./sharpen";

const option = (over: Partial<SharpenOption> = {}): SharpenOption => ({
  title: "Why your 401k is slow",
  hook: "Maxing your 401k can cost you 6 figures",
  hook_type: "belief-attacking",
  belief_attacked: "Maxing the 401k is always right.",
  value_to_listener: "A number to check before you max it.",
  why_it_stops: "It names a cost most people never calculate.",
  outline: ["State the belief.", "Give the 6-figure number.", "Say what to check instead."],
  what_changed: "Opens on a cost, not a question.",
  ...over,
});
const idea: SharpenIdea = {
  title: "401k thoughts",
  hook: "Should you max your 401k?",
  belief_attacked: "401k first",
  value_to_listener: "A better order",
  why_it_stops: "It questions the default",
  outline: ["Intro", "Compare", "Close"],
  pillar: "method",
  format: "reel",
};

describe("sharpenOutputSchema", () => {
  const schema = sharpenOutputSchema;
  it("accepts exactly three valid rewrites", () => {
    expect(schema.safeParse({ options: [option(), option(), option()] }).success).toBe(true);
  });
  it("rejects two rewrites", () => {
    expect(schema.safeParse({ options: [option(), option()] }).success).toBe(false);
  });
  it("rejects a 141-character hook, a 2-beat outline and an unknown hook type", () => {
    expect(schema.safeParse({ options: [option({ hook: "x".repeat(141) }), option(), option()] }).success).toBe(false);
    expect(schema.safeParse({ options: [option({ outline: ["a", "b"] }), option(), option()] }).success).toBe(false);
    expect(schema.safeParse({ options: [option({ hook_type: "nonsense" as never }), option(), option()] }).success).toBe(false);
  });
  it("the tool schema is named and requires options", () => {
    expect(SHARPEN_TOOL_NAME).toBe("record_rewrites");
    expect((sharpenToolSchema() as { required: string[] }).required).toEqual(["options"]);
  });
});

describe("sharpenSystemPrompt", () => {
  it("states the four marks, keeps the topic, and lists the approved rules under their heading", () => {
    const p = sharpenSystemPrompt(["Open on the belief, never on a question."]);
    expect(p).toContain(SHARP_MARKS);
    expect(p).toContain("Keep the idea's topic and format");
    expect(p).toContain("Miguel's approved rules");
    expect(p).toContain("- Open on the belief, never on a question.");
  });
  it("leaves the rules heading out when there are none", () => {
    expect(sharpenSystemPrompt([])).not.toContain("Miguel's approved rules");
  });
});

describe("renderSharpenTurn", () => {
  it("carries the idea and what is off", () => {
    const t = renderSharpenTurn({ idea, chips: ["Hook too weak", "No numbers"], text: "too generic" });
    expect(t).toContain(idea.hook);
    expect(t).toContain("What is off: Hook too weak; No numbers");
    expect(t).toContain("Miguel adds: too generic");
  });
  it("omits the added line when there is no text", () => {
    expect(renderSharpenTurn({ idea, chips: ["Too vague"], text: "" })).not.toContain("Miguel adds");
  });
});

describe("sharpenIdeaPatch", () => {
  it("moves the old hook to hook_alt and touches nothing else", () => {
    const patch = sharpenIdeaPatch(option(), "old hook");
    expect(Object.keys(patch).sort()).toEqual(["belief_attacked", "hook", "hook_alt", "hook_type", "outline", "title", "value_to_listener", "why_it_stops"]);
    expect(patch.hook_alt).toBe("old hook");
    expect(patch.outline).toEqual([{ beat: "State the belief." }, { beat: "Give the 6-figure number." }, { beat: "Say what to check instead." }]);
  });
});
