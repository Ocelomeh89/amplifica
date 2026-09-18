import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { IDEAS_PROMPT } from "./ideas";
import { ingestIdeaSchema } from "../schema";
import { FORMATS } from "../types";

// The prompt and the schema must not drift: every field a routine has to
// produce is named in the rules it reads.
describe("IDEAS_PROMPT", () => {
  it("names every ingest idea field", () => {
    for (const key of Object.keys(ingestIdeaSchema.shape)) {
      expect(IDEAS_PROMPT, key).toContain(`\`${key}\``);
    }
  });
  it("names every format and the brand guardrails", () => {
    for (const f of FORMATS) expect(IDEAS_PROMPT).toContain(`\`${f}\``);
    for (const banned of ["guaranteed", "low risk", "leverage", "Part 2 of 5"]) {
      expect(IDEAS_PROMPT).toContain(banned);
    }
  });
});

describe("routines/content-daily.md", () => {
  const md = readFileSync("routines/content-daily.md", "utf8");
  it("points at both endpoints, the digest channel, and the Plaud highlight block", () => {
    for (const s of ["/api/content/context", "/api/content/ingest", "7-9011777568-8", "mark_memo", "transaction_polish"]) {
      expect(md).toContain(s);
    }
  });
  it("states the confidentiality rule and reads the prompt file", () => {
    expect(md).toContain("never open");
    expect(md).toContain("src/features/content/engine/prompts/ideas.ts");
    expect(md).toContain("CONTENT_ENGINE_SECRET");
  });
});
