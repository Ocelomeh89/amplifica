import { describe, expect, it } from "vitest";
import { HOOK_TYPES } from "./tags";
import {
  COMPETITOR_TAG_TOOL,
  competitorTagSchema,
  competitorTagSystemPrompt,
  competitorTagToolSchema,
  renderCompetitorTagTurn,
} from "./competitor-tags";

const valid = () => ({
  hook_type: "paradox",
  onscreen_text: "repeats-hook",
  cover_face: true,
  cover_text: true,
  cover_number: false,
  cta_type: "comment-keyword",
  post_style: "talking-head-text",
  message: "",
  hook_text: "Maxing your 401k is the slow lane",
  tag_confidence: { hook_type: 0.8, onscreen_text: 0.7, message: 0.3, cta_type: 0.9, post_style: 0.8, cover_face: 0.95, cover_text: 0.9, cover_number: 0.9 },
  pushes_belief: "max out your 401k",
  format_note: null,
});

describe("competitorTagSchema", () => {
  it("accepts a valid answer", () => {
    expect(competitorTagSchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects a format note beside a post style, and accepts it with a blank style", () => {
    expect(competitorTagSchema.safeParse({ ...valid(), format_note: "split screen" }).success).toBe(false);
    expect(competitorTagSchema.safeParse({ ...valid(), post_style: "", format_note: "split screen" }).success).toBe(true);
  });
  it("rejects carousel and image styles and out-of-range confidence", () => {
    expect(competitorTagSchema.safeParse({ ...valid(), post_style: "carousel" }).success).toBe(false);
    expect(competitorTagSchema.safeParse({ ...valid(), tag_confidence: { ...valid().tag_confidence, hook_type: 1.4 } }).success).toBe(false);
  });
});

describe("competitorTagToolSchema", () => {
  it("lists every hook type and excludes carousel and image styles", () => {
    const props = (competitorTagToolSchema() as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.hook_type.enum).toEqual([...HOOK_TYPES, ""]);
    expect(props.post_style.enum).not.toContain("carousel");
    expect(props.post_style.enum).not.toContain("image");
    expect(COMPETITOR_TAG_TOOL).toBe("record_competitor_tags");
  });
});

describe("prompt", () => {
  it("names pushes_belief, format_note and the low-confidence rule", () => {
    const p = competitorTagSystemPrompt();
    expect(p).toContain("pushes_belief");
    expect(p).toContain("format_note");
    expect(p).toContain("0.6");
  });
  it("the turn carries the creator, caption and duration", () => {
    const t = renderCompetitorTagTurn({ username: "micro.investing", caption: "Max out your 401k", duration_seconds: 31.4 });
    expect(t).toContain("@micro.investing");
    expect(t).toContain("Max out your 401k");
    expect(t).toContain("31 seconds");
  });
});
