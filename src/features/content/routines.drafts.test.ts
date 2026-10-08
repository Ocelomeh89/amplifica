import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { draftPostSchema, parseVaultPath } from "@/features/content/engine/drafts";
import { voicePostSchema } from "@/features/content/engine/voice";

const draftDoc = readFileSync("routines/content-draft.md", "utf8");
const voiceDoc = readFileSync("routines/content-voice.md", "utf8");
const read = (f: string) => readFileSync(f, "utf8");

describe("routines/content-draft.md", () => {
  it("names the environment, endpoints, vault folder, and the safety rules", () => {
    for (const needle of [
      "CONTENT_API_BASE",
      "CONTENT_ENGINE_SECRET",
      "/api/content/drafts/queue",
      "/api/content/drafts",
      "voice_stale",
      "C - Writing/Content",
      "--redo",
      "never edit",
      "after the POST succeeds",
      "(2).md",
      "/content-voice",
    ]) {
      expect(draftDoc, needle).toContain(needle);
    }
  });
  it("embeds an example body that passes the real draft schema and path rules", () => {
    const body = JSON.parse(read("routines/examples/draft-post.json"));
    const parsed = draftPostSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    expect(parseVaultPath(body.obsidian_path)).not.toBeNull();
    expect(draftDoc).toContain("routines/examples/draft-post.json");
  });
});

describe("routines/content-voice.md", () => {
  it("names the endpoint, sources, and the consent steps", () => {
    for (const needle of [
      "/api/content/voice",
      "CONTENT_ENGINE_SECRET",
      "Miguel Graf Writing Style Profile and Investment Philosophy.md",
      "My Tone.md",
      "C - Writing/Content",
      "show Miguel the list",
      "never quote",
      "mtime",
    ]) {
      expect(voiceDoc, needle).toContain(needle);
    }
  });
  it("embeds an example body that passes the real voice schema", () => {
    const parsed = voicePostSchema.safeParse(JSON.parse(read("routines/examples/voice-post.json")));
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    expect(voiceDoc).toContain("routines/examples/voice-post.json");
  });
});

describe("the skills", () => {
  it("point at their routine files and keep the secret out of the transcript", () => {
    for (const [skill, routine] of [["content-draft", "routines/content-draft.md"], ["content-voice", "routines/content-voice.md"]]) {
      const text = read(`.claude/skills/${skill}/SKILL.md`);
      expect(text, skill).toContain(routine);
      expect(text, skill).toContain("Never run that grep");
      expect(text, skill).toContain("https://amplificawealth.com");
    }
  });
});
