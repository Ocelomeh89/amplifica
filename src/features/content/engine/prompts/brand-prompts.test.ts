import { describe, expect, it } from "vitest";
import { PILLARS } from "../brand";
import { IDEAS_PROMPT } from "./ideas";
import { DRAFT_PROMPT } from "./draft";
import { sharpenSystemPrompt } from "../sharpen";
import { briefSystemPrompt } from "../today-brief";
import { recreateSystemPrompt } from "../recreate";
import { proposalSystemPrompt } from "../taste";

const prompts: Record<string, string> = {
  ideas: IDEAS_PROMPT,
  draft: DRAFT_PROMPT,
  sharpen: sharpenSystemPrompt(["Keep hooks short."]),
  brief: briefSystemPrompt(["Keep hooks short."]),
  recreate: recreateSystemPrompt(),
  taste: proposalSystemPrompt(),
};

describe("generation prompts speak the brand", () => {
  for (const [name, p] of Object.entries(prompts)) {
    it(`${name} names both readers and every pillar, and none of the retired positioning`, () => {
      expect(p).toContain("Daniel");
      expect(p).toContain("Stephen");
      for (const pl of PILLARS) expect(p).toContain(pl.name);
      for (const gone of ["steady savers", "Content positioning", "canon message", "saver who wants"]) expect(p).not.toContain(gone);
    });
  }

  it("the ideas prompt keeps the source permission rules and asks for a pillar slug", () => {
    expect(IDEAS_PROMPT).toContain("never open denied or pending sources");
    for (const pl of PILLARS) expect(IDEAS_PROMPT).toContain(pl.slug);
    expect(IDEAS_PROMPT).not.toContain('"income-assets"');
  });

  it("where taste rules are listed, the brand wins a conflict", () => {
    for (const name of ["sharpen", "brief"]) expect(prompts[name]).toContain("If a taste rule conflicts with the brand, the brand wins.");
  });
});
