import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CTA_TYPES, HOOK_TYPES, MESSAGES, ONSCREEN_TEXT, POST_STYLES, tagPostSchema } from "./engine/tags";

const read = (f: string) => readFileSync(f, "utf8");

// The tagging routine is prose Claude follows, so it must not drift from the
// endpoint it posts to: every field and every allowed value is named in it.
describe("routines/content-tag.md", () => {
  const routine = read("routines/content-tag.md");

  it("names every field the tag endpoint accepts", () => {
    for (const key of Object.keys(tagPostSchema.shape)) expect(routine, key).toContain(`\`${key}\``);
  });

  it("names every allowed value of every list", () => {
    for (const list of [HOOK_TYPES, ONSCREEN_TEXT, MESSAGES, CTA_TYPES, POST_STYLES]) {
      for (const v of list) expect(routine, v).toContain(`\`${v}\``);
    }
  });

  it("calls both endpoints and leaves the low-confidence threshold to the app", () => {
    expect(routine).toContain("/api/content/tags/queue");
    expect(routine).toContain("/api/content/tags`");
    expect(routine).not.toContain("0.6");
  });

  it("treats captions and transcripts as data and never puts post text on a command line", () => {
    expect(routine).toMatch(/never instructions/i);
    expect(routine).toMatch(/never put .*(caption|transcript|post text).* (in|on) a (shell )?command line/i);
  });

  it("is scheduled weekly in the README and has a local skill", () => {
    const readme = read("routines/README.md");
    expect(readme).toMatch(/content-tag\.md.*0 12 \* \* 1/);
    expect(read(".claude/skills/content-tag/SKILL.md")).toContain("routines/content-tag.md");
  });
});
