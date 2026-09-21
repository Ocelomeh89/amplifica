import { describe, expect, it, vi } from "vitest";
import { mapVideo, parseIsoDuration, pullYouTube, ytFormat, type YtVideo } from "./youtube";

const long: YtVideo = {
  id: "abc123XYZ",
  snippet: { title: "The CYCLE explained", description: "d", publishedAt: "2026-09-10T15:00:00Z" },
  statistics: { viewCount: "1200", likeCount: "40", commentCount: "3" },
  contentDetails: { duration: "PT12M4S" },
};
const short: YtVideo = { ...long, id: "short1", contentDetails: { duration: "PT58S" } };
const thread = {
  id: "th1",
  snippet: { totalReplyCount: 0, topLevelComment: { snippet: { textDisplay: "Great video", authorDisplayName: "Sam", publishedAt: "2026-09-11T00:00:00Z" } } },
};

describe("duration and format", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT12M4S")).toBe(724);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT58S")).toBe(58);
    expect(parseIsoDuration("P1DT2H3M4S")).toBe(93784);
    expect(parseIsoDuration("PT4.5S")).toBe(4.5);
    expect(parseIsoDuration("garbage")).toBe(null);
  });
  it("a video of 60 seconds or less is a reel", () => {
    expect(ytFormat(60)).toBe("reel");
    expect(ytFormat(61)).toBe("youtube");
    expect(ytFormat(null)).toBe("youtube");
  });
});

describe("mapVideo", () => {
  it("maps statistics to numbers and keys by video id", () => {
    const out = mapVideo(long, [thread]);
    expect(out).toEqual({
      platform: "youtube",
      external_id: "abc123XYZ",
      url: "https://www.youtube.com/watch?v=abc123XYZ",
      format: "youtube",
      posted_at: "2026-09-10T15:00:00Z",
      caption: "The CYCLE explained",
      metrics: { views: 1200, likes: 40, comments: 3 },
      comments: [{ external_id: "th1", author: "Sam", text: "Great video", occurred_at: "2026-09-11T00:00:00Z" }],
    });
    expect(mapVideo(short, []).format).toBe("reel");
  });
  it("uses null for hidden counts", () => {
    expect(mapVideo({ ...long, statistics: { viewCount: "5" } }, []).metrics).toEqual({ views: 5, likes: null, comments: null });
  });
  it("treats missing contentDetails as youtube format", () => {
    expect(mapVideo({ ...long, contentDetails: undefined }, []).format).toBe("youtube");
  });
});

describe("pullYouTube", () => {
  const env = { apiKey: "k", handle: "amplificawealth" };
  function fake(disableComments = false) {
    return vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.searchParams.get("key")).toBe("k");
      if (u.pathname.endsWith("/channels")) {
        expect(u.searchParams.get("forHandle")).toBe("amplificawealth");
        return new Response(JSON.stringify({ items: [{ id: "UCx", contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] }));
      }
      if (u.pathname.endsWith("/playlistItems")) {
        expect(u.searchParams.get("playlistId")).toBe("UUx");
        return new Response(JSON.stringify({ items: [{ contentDetails: { videoId: "abc123XYZ" } }, { contentDetails: { videoId: "short1" } }] }));
      }
      if (u.pathname.endsWith("/videos")) {
        expect(u.searchParams.get("id")).toBe("abc123XYZ,short1");
        return new Response(JSON.stringify({ items: [long, short] }));
      }
      if (u.pathname.endsWith("/commentThreads")) {
        if (disableComments) return new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 });
        return new Response(JSON.stringify({ items: u.searchParams.get("videoId") === "abc123XYZ" ? [thread] : [] }));
      }
      return new Response("nope", { status: 404 });
    });
  }

  it("resolves the channel by handle, lists uploads, and maps videos with comments", async () => {
    const out = await pullYouTube(env, fake() as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => [p.external_id, p.format])).toEqual([["abc123XYZ", "youtube"], ["short1", "reel"]]);
    expect(out.posts[0].comments).toHaveLength(1);
  });

  it("uses the channel id directly when given", async () => {
    const fetchImpl = fake();
    await pullYouTube({ ...env, channelId: "UCx" }, fetchImpl as unknown as typeof fetch);
    const first = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(first.searchParams.get("id")).toBe("UCx");
    expect(first.searchParams.get("forHandle")).toBeNull();
  });

  it("keeps videos whose comments are disabled and records the error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await pullYouTube(env, fake(true) as unknown as typeof fetch);
    expect(out.posts).toHaveLength(2);
    expect(out.posts[0].comments).toEqual([]);
    expect(out.errors).toHaveLength(2);
  });

  it("reports a missing key as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullYouTube({ handle: "x" }, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["youtube: YOUTUBE_API_KEY not set"] });
  });
});
