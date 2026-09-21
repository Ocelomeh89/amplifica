import { describe, expect, it, vi } from "vitest";
import { composioExecute, igFormat, insightMetricsFor, mapIgMedia, mapInsights, pullInstagram, type IgMedia } from "./instagram";

const reel: IgMedia = {
  id: "17958519123208964",
  caption: "I was offered a new job. I accepted gladly.",
  media_type: "VIDEO",
  media_product_type: "REELS",
  permalink: "https://www.instagram.com/reel/Ddh0MkWxvTI/",
  timestamp: "2026-09-21T00:00:00+0000",
  like_count: 32,
  comments_count: 4,
};
const carousel: IgMedia = {
  id: "18085598981296148",
  caption: "You automated the saving part years ago.",
  media_type: "CAROUSEL_ALBUM",
  media_product_type: "FEED",
  permalink: "https://www.instagram.com/p/DdepM2dEdAU/",
  timestamp: "2026-09-19T18:22:22+0000",
  like_count: 5,
  comments_count: 0,
};
const insightRows = [
  { name: "views", values: [{ value: 591 }] },
  { name: "reach", values: [{ value: 384 }] },
  { name: "saved", values: [{ value: 2 }] },
  { name: "likes", values: [{ value: 32 }] },
  { name: "comments", values: [{ value: 4 }] },
  { name: "shares", values: [{ value: 1 }] },
  { name: "ig_reels_avg_watch_time", values: [{ value: 9826 }] },
];
const commentRows = [
  { id: "17908579638504125", text: "Congrats!!", timestamp: "2026-09-21T12:55:02+0000", from: { id: "1", username: "karipesch" } },
  { id: "18066771095784333", text: "congratulations bro!", timestamp: "2026-09-21T00:50:28+0000", from: { id: "2", username: "jxrx21" } },
];

describe("mappers", () => {
  it("formats: REELS is a reel, FEED is unqueued, STORY is a story", () => {
    expect(igFormat(reel)).toBe("reel");
    expect(igFormat(carousel)).toBe("");
    expect(igFormat({ ...reel, media_product_type: "STORY" })).toBe("story");
  });
  it("asks for reels metrics only on reels", () => {
    expect(insightMetricsFor("REELS")).toContain("ig_reels_avg_watch_time");
    expect(insightMetricsFor("FEED")).not.toContain("ig_reels_avg_watch_time");
  });
  it("maps insights to the metric keys, watch time in seconds", () => {
    expect(mapInsights(insightRows)).toEqual({ views: 591, reach: 384, likes: 32, comments: 4, saves: 2, shares: 1, avg_watch_time_s: 9.826 });
  });
  it("keys the post by the permalink shortcode and carries comments", () => {
    const out = mapIgMedia(reel, insightRows, commentRows);
    expect(out.platform).toBe("instagram");
    expect(out.external_id).toBe("Ddh0MkWxvTI");
    expect(out.url).toBe("https://www.instagram.com/reel/Ddh0MkWxvTI/");
    expect(out.posted_at).toBe("2026-09-21T00:00:00.000Z");
    expect(out.comments).toEqual([
      { external_id: "17908579638504125", author: "karipesch", text: "Congrats!!", occurred_at: "2026-09-21T12:55:02.000Z" },
      { external_id: "18066771095784333", author: "jxrx21", text: "congratulations bro!", occurred_at: "2026-09-21T00:50:28.000Z" },
    ]);
    expect(mapIgMedia(carousel, [], []).external_id).toBe("DdepM2dEdAU");
  });
  it("falls back to like_count and comments_count when insights are missing", () => {
    expect(mapIgMedia(reel, null, []).metrics).toEqual({ likes: 32, comments: 4 });
  });
});

describe("composioExecute", () => {
  it("posts the slug with the key and connection, and unwraps data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ successful: true, data: { ok: 1 }, error: null }), { status: 200 }));
    const out = await composioExecute<{ ok: number }>("X_Y", { a: 1 }, { apiKey: "key", connectionId: "ca_1" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://backend.composio.dev/api/v3.1/tools/execute/X_Y");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("key");
    expect(JSON.parse(init.body as string)).toEqual({ connected_account_id: "ca_1", arguments: { a: 1 } });
  });
  it("throws on HTTP failure and on successful:false", async () => {
    const env = { apiKey: "k", connectionId: "c" };
    await expect(composioExecute("X", {}, env, (async () => new Response("", { status: 401 })) as unknown as typeof fetch)).rejects.toThrow("401");
    const failed = async () => new Response(JSON.stringify({ successful: false, data: {}, error: "API Error: bad metric" }), { status: 200 });
    await expect(composioExecute("X", {}, env, failed as unknown as typeof fetch)).rejects.toThrow("bad metric");
  });
});

describe("pullInstagram", () => {
  const env = { apiKey: "k", connectionId: "c" };
  function fake(routes: Record<string, (args: Record<string, unknown>) => unknown>) {
    return vi.fn(async (url: string, init: RequestInit) => {
      const slug = url.split("/").pop()!;
      const { arguments: args } = JSON.parse(init.body as string);
      const handler = routes[slug];
      if (!handler) return new Response(JSON.stringify({ successful: false, data: {}, error: `no ${slug}` }), { status: 200 });
      return new Response(JSON.stringify({ successful: true, data: handler(args), error: null }), { status: 200 });
    });
  }

  it("lists media, then insights and comments per item", async () => {
    const fetchImpl = fake({
      INSTAGRAM_GET_IG_USER_MEDIA: () => ({ data: [reel, carousel], paging: {} }),
      INSTAGRAM_GET_IG_MEDIA_INSIGHTS: (a) => ({ data: a.ig_media_id === reel.id ? insightRows : [{ name: "reach", values: [{ value: 43 }] }] }),
      INSTAGRAM_GET_IG_MEDIA_COMMENTS: (a) => ({ data: a.ig_media_id === reel.id ? commentRows : [] }),
    });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => p.external_id)).toEqual(["Ddh0MkWxvTI", "DdepM2dEdAU"]);
    expect(out.posts[0].metrics.avg_watch_time_s).toBe(9.826);
    expect(out.posts[1].metrics.reach).toBe(43);
    expect(out.posts[0].comments).toHaveLength(2);
  });

  it("follows the media paging cursor", async () => {
    const fetchImpl = fake({
      INSTAGRAM_GET_IG_USER_MEDIA: (a) => (a.after ? { data: [carousel], paging: {} } : { data: [reel], paging: { cursors: { after: "CUR" } } }),
      INSTAGRAM_GET_IG_MEDIA_INSIGHTS: () => ({ data: [] }),
      INSTAGRAM_GET_IG_MEDIA_COMMENTS: () => ({ data: [] }),
    });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.posts).toHaveLength(2);
  });

  it("keeps the post and records an error when insights or comments fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = fake({ INSTAGRAM_GET_IG_USER_MEDIA: () => ({ data: [reel], paging: {} }) });
    const out = await pullInstagram(env, fetchImpl as unknown as typeof fetch);
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0].metrics).toEqual({ likes: 32, comments: 4 });
    expect(out.errors).toHaveLength(2);
  });

  it("reports a missing env as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullInstagram({}, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set"] });
  });
});
