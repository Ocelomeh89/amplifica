import { describe, expect, it } from "vitest";
import { filterByFormat, formatCounts, parseFormatParam, rankIdeas, type Rankable } from "./inbox";

const idea = (id: string, format: Rankable["format"], score: number, created_at: string): Rankable => ({ id, format, score, created_at });

describe("parseFormatParam", () => {
  it("accepts a real format and treats everything else as All", () => {
    expect(parseFormatParam("reel")).toBe("reel");
    expect(parseFormatParam("newsletter")).toBe("newsletter");
    expect(parseFormatParam("bogus")).toBeNull();
    expect(parseFormatParam("")).toBeNull();
    expect(parseFormatParam(undefined)).toBeNull();
    expect(parseFormatParam(["story", "x"])).toBe("story");
  });
});

describe("rankIdeas", () => {
  it("orders by score descending, then newest first, then id", () => {
    const ranked = rankIdeas([
      idea("b", "reel", 0.5, "2026-10-01T10:00:00Z"),
      idea("a", "reel", 0.9, "2026-09-30T10:00:00Z"),
      idea("d", "x", 0.9, "2026-10-02T10:00:00Z"),
      idea("c", "x", 0.9, "2026-10-02T10:00:00Z"),
    ]);
    expect(ranked.map((i) => i.id)).toEqual(["c", "d", "a", "b"]);
  });
  it("does not mutate its input", () => {
    const input = [idea("a", "reel", 0.1, "2026-10-01T00:00:00Z"), idea("b", "reel", 0.9, "2026-10-01T00:00:00Z")];
    rankIdeas(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("is stable across calls for tied scores", () => {
    const input = [idea("m", "reel", 0.5, "2026-10-01T00:00:00Z"), idea("k", "reel", 0.5, "2026-10-01T00:00:00Z")];
    expect(rankIdeas(input).map((i) => i.id)).toEqual(rankIdeas([...input].reverse()).map((i) => i.id));
  });
});

describe("filterByFormat and formatCounts", () => {
  const ideas = [idea("1", "reel", 0.9, "t"), idea("2", "reel", 0.8, "t"), idea("3", "story", 0.7, "t")];
  it("filters to one format, or returns a copy for All", () => {
    expect(filterByFormat(ideas, "reel").map((i) => i.id)).toEqual(["1", "2"]);
    expect(filterByFormat(ideas, "x")).toEqual([]);
    const all = filterByFormat(ideas, null);
    expect(all).toEqual(ideas);
    expect(all).not.toBe(ideas);
  });
  it("counts every format, including zeros, and the total", () => {
    expect(formatCounts(ideas)).toEqual({ all: 3, reel: 2, youtube: 0, newsletter: 0, story: 1, x: 0 });
    expect(formatCounts([])).toEqual({ all: 0, reel: 0, youtube: 0, newsletter: 0, story: 0, x: 0 });
  });
});
