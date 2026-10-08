import { describe, expect, it } from "vitest";
import { BANNED_VOCABULARY, HUMANIZE_PROMPT } from "./humanize";
import { BRAND_GUARDRAILS, DRAFT_PROMPT, FORMAT_TEMPLATES } from "./draft";
import { FORMATS } from "../types";

describe("humanize prompt", () => {
  it("embeds the whole banned vocabulary", () => {
    for (const w of BANNED_VOCABULARY) expect(HUMANIZE_PROMPT, w).toContain(w);
  });
  it("keeps the voice-preserving principle and the reframe ban", () => {
    expect(HUMANIZE_PROMPT).toContain("minimum effective edit");
    expect(HUMANIZE_PROMPT).toContain("Reframe ban");
    expect(HUMANIZE_PROMPT).toContain("voice profile");
  });
});

describe("draft prompt", () => {
  it("has a template for every format, and the prompt includes each", () => {
    for (const f of FORMATS) {
      expect(FORMAT_TEMPLATES[f].length, f).toBeGreaterThan(40);
      expect(DRAFT_PROMPT, f).toContain(FORMAT_TEMPLATES[f]);
    }
  });
  it("includes the brand guardrails", () => {
    expect(DRAFT_PROMPT).toContain(BRAND_GUARDRAILS);
  });
  it("fixes the headings the linter reads", () => {
    expect(FORMAT_TEMPLATES.reel).toContain("## Script");
    expect(FORMAT_TEMPLATES.story).toContain("## Slides");
  });
});
