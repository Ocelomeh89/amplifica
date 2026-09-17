import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestSchema } from "./schema";

const example = JSON.parse(readFileSync("routines/examples/daily-ingest.json", "utf8"));

describe("ingestSchema", () => {
  it("accepts the routine's example payload", () => {
    const result = ingestSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it("rejects an idea whose source_ref names a source not in the payload", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = { kind: "granola", external_id: "nope" };
    const result = ingestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an idea with no provenance", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = null;
    delete bad.ideas[0].from_hook_backlog;
    const result = ingestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("allows a newsletter idea from the hook backlog to have no source", () => {
    const ok = structuredClone(example);
    ok.ideas[0].source_ref = null;
    ok.ideas[0].format = "newsletter";
    ok.ideas[0].from_hook_backlog = true;
    expect(ingestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects a reel idea from the hook backlog", () => {
    const bad = structuredClone(example);
    bad.ideas[0].source_ref = null;
    bad.ideas[0].format = "reel";
    bad.ideas[0].from_hook_backlog = true;
    expect(ingestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown format", () => {
    const bad = structuredClone(example);
    bad.ideas[0].format = "tiktok";
    expect(ingestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(ingestSchema.safeParse({ sources: [], ideas: [] }).success).toBe(false);
  });
});
