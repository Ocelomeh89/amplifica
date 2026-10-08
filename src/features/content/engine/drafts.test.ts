import { describe, expect, it } from "vitest";
import { draftFilename, draftPostSchema, parseLintHits, parseVaultPath, slugify, summarizeDraft, vaultPath } from "./drafts";

const ID = "7b1f6c52-0a6e-4f43-9d1e-2f6b8f7d3a10";
const base = {
  idea_id: ID,
  raw: "raw text",
  humanized: "humanized text",
  obsidian_path: "C - Writing/Content/reel/2026-10-07 a-w-2-is-a-runway.md",
};

describe("slugify and filenames", () => {
  it("makes a short lowercase slug", () => {
    expect(slugify("A W-2 is a runway, not a cage!")).toBe("a-w-2-is-a-runway-not-a-cage");
  });
  it("strips accents and caps the length without a trailing dash", () => {
    expect(slugify("Café économie")).toBe("cafe-economie");
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
  it("falls back to 'idea' for emoji, slashes and symbols", () => {
    expect(slugify("🔥🔥 // ../..")).toBe("idea");
    expect(slugify("")).toBe("idea");
  });
  it("builds the filename and vault path", () => {
    expect(draftFilename("Hello World", "2026-10-07")).toBe("2026-10-07 hello-world.md");
    expect(vaultPath("reel", "2026-10-07 hello-world.md")).toBe("C - Writing/Content/reel/2026-10-07 hello-world.md");
  });
});

describe("parseVaultPath", () => {
  it("accepts the one allowed shape", () => {
    expect(parseVaultPath("C - Writing/Content/newsletter/2026-10-07 x.md")).toEqual({
      format: "newsletter",
      filename: "2026-10-07 x.md",
    });
  });
  it.each([
    "../C - Writing/Content/reel/x.md",
    "C - Writing/Content/reel/../../x.md",
    "/C - Writing/Content/reel/x.md",
    "C - Writing/Content/reel/x.txt",
    "C - Writing/Content/podcast/x.md",
    "C - Writing/Content/reel/sub/x.md",
    "C - Writing/Content/x.md",
    "C - Writing/Other/reel/x.md",
    "C - Writing\\Content\\reel\\x.md",
    "C - Writing/Content/reel/..md",
    "",
  ])("rejects %j", (p) => {
    expect(parseVaultPath(p)).toBeNull();
  });
});

describe("draftPostSchema", () => {
  it("accepts a good body and defaults model and redo", () => {
    const r = draftPostSchema.parse(base);
    expect(r.model).toBe("");
    expect(r.redo).toBe(false);
  });
  it("rejects a bad id, empty text, an oversize body and a bad path", () => {
    expect(draftPostSchema.safeParse({ ...base, idea_id: "nope" }).success).toBe(false);
    expect(draftPostSchema.safeParse({ ...base, raw: "" }).success).toBe(false);
    expect(draftPostSchema.safeParse({ ...base, humanized: "x".repeat(20_001) }).success).toBe(false);
    expect(draftPostSchema.safeParse({ ...base, obsidian_path: "C - Writing/Content/reel/../x.md" }).success).toBe(false);
  });
});

describe("parseLintHits and summarizeDraft", () => {
  const hits = [
    { level: "block", rule: "guarantee", excerpt: "x" },
    { level: "warn", rule: "em-dash", excerpt: "y" },
    { level: "warn", rule: "leverage", excerpt: "z" },
  ];
  it("keeps only well-formed hits", () => {
    expect(parseLintHits([...hits, { level: "bogus" }, null, "str"])).toEqual(hits);
    expect(parseLintHits("not an array")).toEqual([]);
  });
  it("summarizes the highest version", () => {
    expect(
      summarizeDraft([
        { version: 1, stage: "raw", lint: [] },
        { version: 2, stage: "humanized", lint: hits },
      ])
    ).toEqual({ stage: "humanized", version: 2, block: 1, warn: 2 });
  });
  it("is null with no rows", () => {
    expect(summarizeDraft([])).toBeNull();
  });
});
