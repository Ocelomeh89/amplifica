import { describe, expect, it } from "vitest";
import { VOICE_MAX_AGE_DAYS, voicePostSchema, voiceStale } from "./voice";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("voiceStale", () => {
  it("is stale with no build", () => {
    expect(voiceStale(null, NOW)).toBe(true);
  });
  it("is fresh at exactly the limit and stale beyond it", () => {
    expect(voiceStale(daysAgo(VOICE_MAX_AGE_DAYS), NOW)).toBe(false);
    expect(voiceStale(daysAgo(VOICE_MAX_AGE_DAYS + 1), NOW)).toBe(true);
  });
  it("treats an unparsable date as stale", () => {
    expect(voiceStale("garbage", NOW)).toBe(true);
  });
});

describe("voicePostSchema", () => {
  const ex = { path: "C - Writing/Blog - Post nomadic life/5 - My investment journey.md", excerpt: "x".repeat(300) };
  const file = { path: "C - Writing/Journal 2026.md", mtime: "2026-10-07T01:00:00Z", bytes: 1234 };
  const good = { profile_md: "p".repeat(400), exemplars: [ex], files: [file] };
  it("accepts a good body", () => {
    expect(voicePostSchema.safeParse(good).success).toBe(true);
  });
  it("rejects a thin profile, no exemplars, more than 12 exemplars, and no files", () => {
    expect(voicePostSchema.safeParse({ ...good, profile_md: "short" }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...good, exemplars: [] }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...good, exemplars: Array(13).fill(ex) }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...good, files: [] }).success).toBe(false);
  });
});
