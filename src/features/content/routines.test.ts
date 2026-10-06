import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestSchema } from "@/features/content/engine/schema";

// routines/content-found.md is a prompt, not code, but it depends on the exact
// endpoints and ingest shape. Pin them the way ideas.test.ts pins the prompt.
const routine = readFileSync("routines/content-found.md", "utf8");

describe("routines/content-found.md", () => {
  it("names the environment, the three endpoints, and the files it reads", () => {
    for (const needle of [
      "CONTENT_API_BASE",
      "CONTENT_ENGINE_SECRET",
      "/api/content/context",
      "/api/content/found/queued",
      "/api/content/ingest",
      "src/features/content/engine/prompts/ideas.ts",
      "src/features/content/engine/angle.ts",
    ]) {
      expect(routine, needle).toContain(needle);
    }
  });
  it("describes both modes and the paging contract", () => {
    for (const needle of ["Queue mode", "Direct mode", "remaining", "mined_at", "one ingest body per source"]) {
      expect(routine, needle).toContain(needle);
    }
  });
  it("embeds an example ingest body that passes the real ingest schema", () => {
    const match = routine.match(/```json\n([\s\S]*?)\n```/);
    expect(match, "a json code block").not.toBeNull();
    const parsed = ingestSchema.safeParse(JSON.parse(match![1]));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sources).toHaveLength(1);
      expect(parsed.data.sources[0].mined_at).toBeTruthy();
      expect(parsed.data.ideas.length).toBeGreaterThan(0);
    }
  });
});
