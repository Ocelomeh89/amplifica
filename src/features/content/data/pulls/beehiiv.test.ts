import { describe, expect, it, vi } from "vitest";
import { mapBeehiivPost, pullBeehiiv, type BeehiivPost } from "./beehiiv";

const post: BeehiivPost = {
  id: "post_4142b3a0-0fd3-4ecf-9485-795f26131ec2",
  title: "Net worth is a vanity metric",
  slug: "net-worth-is-a-vanity-metric",
  web_url: "https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric",
  publish_date: 1789657200,
  status: "confirmed",
  stats: {
    email: { recipients: 57, delivered: 57, opens: 52, unique_opens: 36, open_rate: 63.16, clicks: 3, unique_clicks: 2, click_rate: 5.56, unsubscribes: 0 },
    web: { views: 4, clicks: 0 },
  },
};

describe("mapBeehiivPost", () => {
  it("maps a confirmed post to a newsletter post keyed by slug, rates as decimals", () => {
    const out = mapBeehiivPost(post);
    expect(out).toEqual({
      platform: "beehiiv",
      external_id: "net-worth-is-a-vanity-metric",
      url: "https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric",
      format: "newsletter",
      posted_at: new Date(1789657200 * 1000).toISOString(),
      caption: "Net worth is a vanity metric",
      metrics: { views: 4, opens: 36, open_rate: 0.6316, clicks: 2, click_rate: 0.0556, unsubscribes: 0 },
      comments: [],
    });
  });
  it("uses null for missing stats", () => {
    expect(mapBeehiivPost({ ...post, stats: undefined }).metrics).toEqual({ views: null, opens: null, open_rate: null, clicks: null, click_rate: null, unsubscribes: null });
  });
});

describe("pullBeehiiv", () => {
  const env = { apiKey: "k", publicationId: "pub_1" };

  it("pages through confirmed posts with stats expanded", async () => {
    const pages = [
      { data: [post], page: 1, total_pages: 2 },
      { data: [{ ...post, slug: "second", web_url: "https://newsletter.amplificawealth.com/p/second" }], page: 2, total_pages: 2 },
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify(pages[page - 1]), { status: 200 });
    });
    const out = await pullBeehiiv(env, fetchImpl as unknown as typeof fetch);
    expect(out.errors).toEqual([]);
    expect(out.posts.map((p) => p.external_id)).toEqual(["net-worth-is-a-vanity-metric", "second"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v2/publications/pub_1/posts?");
    expect(url).toContain("expand%5B%5D=stats");
    expect(url).toContain("status=confirmed");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("reports a missing env or a failed response as an error, never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await pullBeehiiv({}, vi.fn() as unknown as typeof fetch)).toEqual({ posts: [], errors: ["beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set"] });
    const bad = vi.fn(async () => new Response("nope", { status: 500 }));
    const out = await pullBeehiiv(env, bad as unknown as typeof fetch);
    expect(out.posts).toEqual([]);
    expect(out.errors[0]).toContain("500");
  });
});
