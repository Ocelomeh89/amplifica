import { describe, expect, it } from "vitest";
import {
  CTA_TYPES,
  HOOK_TYPES,
  MESSAGES,
  ONSCREEN_TEXT,
  POST_STYLES,
  captionLength,
  coverSummary,
  filterByTags,
  parseTagFilters,
  tagBodySchema,
  type PostTags,
} from "./tags";

const slug = /^[a-z]+(-[a-z]+)*$/;
const uuid = "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10";

const base = (over: Partial<PostTags & { caption: string }> = {}): PostTags & { caption: string } => ({
  hook_type: "",
  onscreen_text: "",
  message: "",
  cta_type: "",
  post_style: "",
  cover_face: null,
  cover_text: null,
  cover_number: null,
  hook_spoken: "",
  hook_onscreen: "",
  tag_confidence: {},
  tag_locks: [],
  tagged_at: null,
  caption: "",
  ...over,
});

describe("lists", () => {
  it("are unique and slug-shaped", () => {
    for (const list of [HOOK_TYPES, ONSCREEN_TEXT, MESSAGES, CTA_TYPES, POST_STYLES]) {
      expect(new Set(list).size).toBe(list.length);
      for (const v of list) expect(v).toMatch(slug);
    }
  });
  it("keeps the seven hook types the idea routine already used", () => {
    for (const v of ["belief-attacking", "paradox", "failure-lesson", "ranking", "identity", "question", "real-numbers"]) {
      expect(HOOK_TYPES).toContain(v);
    }
  });
});

describe("captionLength", () => {
  const words = (n: number) => Array.from({ length: n }, () => "w").join(" ");
  it("splits at 40 and 150 words", () => {
    expect(captionLength(words(39))).toBe("short");
    expect(captionLength(words(40))).toBe("medium");
    expect(captionLength(words(150))).toBe("medium");
    expect(captionLength(words(151))).toBe("long");
    expect(captionLength("")).toBe("short");
  });
});

describe("coverSummary", () => {
  it("names what the cover has", () => {
    expect(coverSummary({ cover_face: true, cover_text: true, cover_number: false })).toBe("face + text");
    expect(coverSummary({ cover_face: false, cover_text: false, cover_number: true })).toBe("no face + number");
    expect(coverSummary({ cover_face: null, cover_text: null, cover_number: null })).toBe("");
  });
});

describe("parseTagFilters", () => {
  it("drops unknown names and values and collapses duplicates", () => {
    expect(
      parseTagFilters(["hook_type:paradox", "hook_type:paradox", "bogus:x", "message:nope", "caption_length:long"])
    ).toEqual([
      { name: "hook_type", value: "paradox" },
      { name: "caption_length", value: "long" },
    ]);
  });
  it("accepts booleans for the cover flags only when valid", () => {
    expect(parseTagFilters("cover_face:true")).toEqual([{ name: "cover_face", value: "true" }]);
    expect(parseTagFilters("cover_face:maybe")).toEqual([]);
  });
  it("returns nothing for no param", () => {
    expect(parseTagFilters(undefined)).toEqual([]);
  });
});

describe("filterByTags", () => {
  const a = base({ hook_type: "paradox", post_style: "animation", caption: "short" });
  const b = base({ hook_type: "paradox", post_style: "talking-head" });
  const c = base({ hook_type: "question", post_style: "animation" });
  const untagged = base({ caption: Array.from({ length: 200 }, () => "w").join(" ") });
  const all = [a, b, c, untagged];
  it("returns everyone with no filters", () => {
    expect(filterByTags(all, [])).toEqual(all);
  });
  it("filters on one tag", () => {
    expect(filterByTags(all, [{ name: "hook_type", value: "paradox" }])).toEqual([a, b]);
  });
  it("ANDs two tags", () => {
    expect(
      filterByTags(all, [
        { name: "hook_type", value: "paradox" },
        { name: "post_style", value: "animation" },
      ])
    ).toEqual([a]);
  });
  it("never matches an untagged post on a tag, but derives caption length", () => {
    expect(filterByTags([untagged], [{ name: "hook_type", value: "paradox" }])).toEqual([]);
    expect(filterByTags([untagged], [{ name: "caption_length", value: "long" }])).toEqual([untagged]);
  });
  it("matches cover flags", () => {
    const f = base({ cover_face: true });
    expect(filterByTags([f, a], [{ name: "cover_face", value: "true" }])).toEqual([f]);
  });
});

describe("tagBodySchema", () => {
  it("accepts a partial entry", () => {
    expect(tagBodySchema.safeParse({ posts: [{ id: uuid, post_style: "animation" }] }).success).toBe(true);
  });
  it("rejects an unknown value, unknown field, oversize batch and empty batch", () => {
    expect(tagBodySchema.safeParse({ posts: [{ id: uuid, hook_type: "nope" }] }).success).toBe(false);
    expect(tagBodySchema.safeParse({ posts: [{ id: uuid, pillar: "method" }] }).success).toBe(false);
    expect(tagBodySchema.safeParse({ posts: Array.from({ length: 26 }, () => ({ id: uuid })) }).success).toBe(false);
    expect(tagBodySchema.safeParse({ posts: [] }).success).toBe(false);
  });
  it("rejects a confidence outside 0 to 1", () => {
    expect(tagBodySchema.safeParse({ posts: [{ id: uuid, tag_confidence: { hook_type: 1.2 } }] }).success).toBe(false);
    expect(tagBodySchema.safeParse({ posts: [{ id: uuid, tag_confidence: { hook_type: 0.8 } }] }).success).toBe(true);
  });
});
