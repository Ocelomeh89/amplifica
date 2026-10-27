import { describe, expect, it } from "vitest";
import { ingestIdeaSchema } from "./schema";
import { MESSAGES } from "./tags";
import {
  RECREATE_TOOL_NAME,
  canRecreate,
  recreateOutputSchema,
  recreateSystemPrompt,
  recreateToolSchema,
  recreatedIdea,
  recreatedIdeaSchema,
  renderRecreateTurn,
  type RecreateSource,
} from "./recreate";
import type { WinnerInsights } from "./winners";

const opt = (topic: string, message = "velocity") => ({ hook: `Hook about ${topic}`, angle: `Angle on ${topic}`, topic, message });
const three = (message?: string) => [opt("a", message), opt("b", message), opt("c", message)];

describe("recreateOutputSchema", () => {
  const same = recreateOutputSchema("same-recipe", "velocity");
  it("accepts exactly 3 options", () => {
    expect(same.safeParse({ options: three() }).success).toBe(true);
  });
  it("rejects 2 or 4 options", () => {
    expect(same.safeParse({ options: three().slice(0, 2) }).success).toBe(false);
    expect(same.safeParse({ options: [...three(), opt("d")] }).success).toBe(false);
  });
  it("rejects duplicate topics, ignoring case and spacing", () => {
    expect(same.safeParse({ options: [opt("Cash flow"), opt("  cash   FLOW "), opt("c")] }).success).toBe(false);
  });
  it("adjacent rejects none, blank, the source message, and values outside MESSAGES", () => {
    const adj = recreateOutputSchema("adjacent", "velocity");
    for (const bad of ["none", "", "velocity", "made-up"]) {
      expect(adj.safeParse({ options: [opt("a", bad), opt("b", "scoreboard"), opt("c", "forced-sale")] }).success).toBe(false);
    }
    expect(adj.safeParse({ options: [opt("a", "scoreboard"), opt("b", "forced-sale"), opt("c", "credit-ladder")] }).success).toBe(true);
  });
  it("same-recipe requires message equal to the source message", () => {
    expect(same.safeParse({ options: [opt("a", "scoreboard"), opt("b"), opt("c")] }).success).toBe(false);
  });
  it("same-recipe with a blank or none source accepts any canon message or none", () => {
    for (const src of ["", "none"]) {
      const s = recreateOutputSchema("same-recipe", src);
      expect(s.safeParse({ options: [opt("a", "none"), opt("b", "scoreboard"), opt("c", "forced-sale")] }).success).toBe(true);
      expect(s.safeParse({ options: [opt("a", "nonsense"), opt("b"), opt("c")] }).success).toBe(false);
    }
  });
});

describe("recreateToolSchema", () => {
  it("requires options with hook, angle, topic and message", () => {
    const s = recreateToolSchema() as { required: string[]; properties: { options: { minItems: number; maxItems: number; items: { required: string[] } } } };
    expect(s.required).toEqual(["options"]);
    expect(s.properties.options.minItems).toBe(3);
    expect(s.properties.options.maxItems).toBe(3);
    expect(s.properties.options.items.required).toEqual(["hook", "angle", "topic", "message"]);
    expect(RECREATE_TOOL_NAME).toBe("record_options");
  });
});

const source: RecreateSource = {
  hook_type: "question",
  onscreen_text: "repeats-hook",
  message: "system-over-willpower",
  cta_type: "follow",
  post_style: "talking-head-text",
  cover_face: true,
  cover_text: true,
  cover_number: false,
  hook_spoken: "Do you have a system or are you winging it?",
  hook_onscreen: "Do you have a system or are you winging it?",
  tag_confidence: {},
  tag_locks: [],
  tagged_at: "2026-10-26T00:00:00Z",
  caption: "No system is the same as a bad system.",
  media_type: "reel",
  figures: ["Views: 41,200 vs posts at the same age"],
};
const ok: WinnerInsights = { state: "ok", winners: 10, winnerIds: [], rest: 20, shared: ["Question hooks: 6 of your top 10, 4 of the other 20."], message: null, lacks: null, caveat: "Small sample." };

describe("renderRecreateTurn", () => {
  const base = { source, insights: ok, winnerHooks: ["Winner hook one"], recentHooks: ["A hook already in the Inbox"] };
  it("names the mode rule and the source hook", () => {
    const t = renderRecreateTurn({ ...base, mode: "same-recipe" });
    expect(t).toContain("Keep the hook type question");
    expect(t).toContain("system-over-willpower");
    expect(t).toContain("Do you have a system or are you winging it?");
  });
  it("adjacent asks for a different canon message per option", () => {
    const t = renderRecreateTurn({ ...base, mode: "adjacent" });
    expect(t).toContain("other than system-over-willpower");
  });
  it("same-recipe frees the topic and message when the source has none", () => {
    const t = renderRecreateTurn({ ...base, mode: "same-recipe", source: { ...source, message: "none" } });
    expect(t).toContain("The topic is free");
  });
  it("uses the caption when there is no hook text", () => {
    const t = renderRecreateTurn({ ...base, mode: "same-recipe", source: { ...source, hook_spoken: "", hook_onscreen: "", caption: "Carousel caption text" } });
    expect(t).toContain("Carousel caption text");
    expect(t).toContain("no hook text");
  });
  it("lists recent hooks to avoid and the winners' hooks", () => {
    const t = renderRecreateTurn({ ...base, mode: "same-recipe" });
    expect(t).toContain("A hook already in the Inbox");
    expect(t).toContain("Winner hook one");
  });
  it("includes winner sentences only when insights are ok", () => {
    expect(renderRecreateTurn({ ...base, mode: "same-recipe" })).toContain("Question hooks: 6 of your top 10");
    const thin = renderRecreateTurn({ ...base, mode: "same-recipe", insights: { state: "thin", have: 9, need: 15 } });
    expect(thin).not.toContain("Question hooks: 6 of your top 10");
  });
});

describe("recreateSystemPrompt", () => {
  it("carries the hook rules and the brand guardrails from the ideas prompt", () => {
    const p = recreateSystemPrompt();
    expect(p).toContain("What makes an idea good here");
    expect(p).toContain("Brand guardrails, non-negotiable");
    expect(p).not.toContain("Ranking and dedupe");
  });
  it("lists every canon message with a one-line meaning", () => {
    const p = recreateSystemPrompt();
    for (const m of MESSAGES.filter((x) => x !== "none")) expect(p).toContain(`- ${m}: `);
  });
});

describe("recreatedIdea", () => {
  const id = "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10";
  it("is a reel at score 1 with source_post_id and passes its schema", () => {
    const idea = recreatedIdea(opt("cash flow"), { id, hook_type: "question", pillar: "method" }, "2026-10-26");
    expect(recreatedIdeaSchema.safeParse(idea).success).toBe(true);
    expect(idea).toMatchObject({
      format: "reel",
      score: 1,
      source_post_id: id,
      hook: "Hook about cash flow",
      title: "Angle on cash flow",
      why_it_stops: "Topic: cash flow",
      hook_type: "question",
      pillar: "method",
      batch_date: "2026-10-26",
    });
  });
  it("drops an unknown source hook type to blank", () => {
    expect(recreatedIdea(opt("x"), { id, hook_type: "weird", pillar: "" }, "2026-10-26").hook_type).toBe("");
  });
  it("cuts a long angle to a 200-character title", () => {
    const o = { ...opt("x"), angle: "a".repeat(300) };
    expect(recreatedIdea(o, { id, hook_type: "", pillar: "" }, "2026-10-26").title).toHaveLength(200);
  });
});

describe("shared contract", () => {
  it("ingestIdeaSchema is unchanged", () => {
    expect(Object.keys(ingestIdeaSchema.shape)).not.toContain("source_post_id");
  });
  it("canRecreate needs tagged_at", () => {
    expect(canRecreate({ tagged_at: null })).toBe(false);
    expect(canRecreate({ tagged_at: "2026-10-01T00:00:00Z" })).toBe(true);
  });
});
