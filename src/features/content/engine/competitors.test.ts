import { describe, expect, it } from "vitest";
import {
  creatorMedians,
  isFresh,
  mapApifyItems,
  multipleOf,
  normalizeUsername,
  pullWindowDays,
  sharesCopiedRun,
} from "./competitors";

const now = new Date("2026-11-01T15:00:00Z");
const since = new Map([["micro.investing", new Date("2026-10-11T00:00:00Z")]]);
const item = (o: Record<string, unknown> = {}) => ({
  ownerUsername: "micro.investing",
  type: "Video",
  shortCode: "A1",
  url: "https://www.instagram.com/p/A1/",
  timestamp: "2026-10-20T12:00:00.000Z",
  caption: "You should max out your 401k",
  videoPlayCount: 5000,
  videoViewCount: 1200,
  likesCount: 300,
  commentsCount: 20,
  videoDuration: 31.4,
  displayUrl: "https://cdn.example/a1.jpg",
  ...o,
});
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("mapApifyItems", () => {
  it("drops collab items owned by another account, pinned items older than the window, carousels and junk", () => {
    const items = [
      item(),
      item({ ownerUsername: "someone.else", shortCode: "B2" }),
      item({ shortCode: "C3", timestamp: "2024-03-01T12:00:00Z" }),
      item({ shortCode: "D4", type: "Sidecar" }),
      { nonsense: true },
      null,
    ];
    expect(mapApifyItems(items, since).map((p) => p.shortcode)).toEqual(["A1"]);
  });

  it("maps the detailed fields, videoPlayCount as views", () => {
    expect(mapApifyItems([item({ ownerUsername: "Micro.Investing" })], since)[0]).toEqual({
      shortcode: "A1",
      url: "https://www.instagram.com/p/A1/",
      username: "micro.investing",
      posted_at: "2026-10-20T12:00:00.000Z",
      caption: "You should max out your 401k",
      views: 5000,
      likes: 300,
      comments: 20,
      duration_seconds: 31.4,
      thumbnail_url: "https://cdn.example/a1.jpg",
    });
  });

  it("missing counts become null, not zero", () => {
    const [p] = mapApifyItems([item({ videoPlayCount: undefined, likesCount: null, videoDuration: undefined, displayUrl: undefined })], since);
    expect([p.views, p.likes, p.duration_seconds, p.thumbnail_url]).toEqual([null, null, null, null]);
  });
});

describe("creatorMedians and multipleOf", () => {
  const posts = (creator: string, views: number[], age = 5) => views.map((v) => ({ creator_id: creator, posted_at: daysAgo(age), views: v }));

  it("a creator with no Reels in the window has no median and no multiple", () => {
    const m = creatorMedians([], now);
    expect(m.get("c1")).toBeUndefined();
    expect(multipleOf(5000, m.get("c1"))).toBeNull();
    expect(multipleOf(5000, { median: 0, count: 3, thin: true })).toBeNull();
    expect(multipleOf(null, { median: 100, count: 9, thin: false })).toBeNull();
  });

  it("median over the last 90 days only, ignoring null views; thin under 8", () => {
    const m = creatorMedians([...posts("c1", [100, 200, 300, 400, 500, 600, 700]), ...posts("c1", [99999], 120), { creator_id: "c1", posted_at: daysAgo(3), views: null }], now);
    expect(m.get("c1")).toEqual({ median: 400, count: 7, thin: true });
  });

  it("8 Reels is not thin; the multiple is views over median", () => {
    const m = creatorMedians(posts("c2", [100, 100, 100, 100, 200, 200, 200, 200]), now).get("c2")!;
    expect(m.thin).toBe(false);
    expect(multipleOf(450, m)).toBe(3);
  });
});

describe("isFresh", () => {
  it("is 14 days inclusive, on the Chicago calendar", () => {
    expect(isFresh("2026-10-18T15:00:00Z", "2026-11-01")).toBe(true);
    expect(isFresh("2026-10-17T15:00:00Z", "2026-11-01")).toBe(false);
    expect(isFresh("2026-10-18T03:00:00Z", "2026-11-01")).toBe(false); // still 17 October in Chicago
  });
});

describe("sharesCopiedRun", () => {
  it("flags a 6-word run copied from a source, ignoring case and punctuation", () => {
    expect(sharesCopiedRun("Stop! You should max out your 401k now", ["you SHOULD max out your 401k, they say"])).toBe(true);
  });
  it("five shared words in a row are fine", () => {
    expect(sharesCopiedRun("Maxing your 401k is slow money", ["you should max out your 401k"])).toBe(false);
    expect(sharesCopiedRun("they say max out your 401k early", ["you should max out your 401k"])).toBe(false);
  });
  it("empty sources never match", () => {
    expect(sharesCopiedRun("a b c d e f", ["", ""])).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it("strips @, URLs and case; rejects anything else", () => {
    expect(normalizeUsername(" @Micro.Investing ")).toBe("micro.investing");
    expect(normalizeUsername("https://www.instagram.com/ericsfinancials/")).toBe("ericsfinancials");
    expect(normalizeUsername("instagram.com/eric_s?igsh=abc")).toBe("eric_s");
    expect(normalizeUsername("bad name!")).toBeNull();
    expect(normalizeUsername("")).toBeNull();
  });
});

describe("pullWindowDays", () => {
  it("pulls 90 days when any creator is new, else 21", () => {
    expect(pullWindowDays([{ last_pulled_at: "2026-10-26T10:00:00Z" }, { last_pulled_at: null }])).toBe(90);
    expect(pullWindowDays([{ last_pulled_at: "2026-10-26T10:00:00Z" }])).toBe(21);
  });
});
