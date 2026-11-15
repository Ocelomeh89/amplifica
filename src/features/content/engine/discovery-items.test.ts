import { describe, expect, it } from "vitest";
import profiles from "../data/pulls/fixtures/discovery-profiles.json";
import reels from "../data/pulls/fixtures/discovery-reels.json";
import search from "../data/pulls/fixtures/discovery-search.json";
import { SEARCH_ACTOR, SEARCH_PHRASES, PROFILE_ACTOR, foundVia, mapProfileItems, mapSampleItems, mapSearchItems, profilesInput, reelsInput, searchInput } from "./discovery-items";

const reelItem = (owner: string, n: number, over: Record<string, unknown> = {}) => ({
  shortCode: `${owner}-${n}`,
  url: `https://www.instagram.com/reel/${owner}-${n}/`,
  ownerUsername: owner,
  type: "Video",
  productType: "clips",
  videoViewCount: 1000 + n,
  timestamp: new Date(Date.UTC(2026, 10, 14) - n * 86_400_000).toISOString(),
  caption: `caption ${n}`,
  ...over,
});

describe("discovery inputs", () => {
  it("the profile run takes the usernames; the Reel run asks for 12 posts each", () => {
    expect(PROFILE_ACTOR).toBe("apify~instagram-profile-scraper");
    expect(profilesInput(["a", "b"])).toEqual({ usernames: ["a", "b"] });
    expect(reelsInput(["a", "b"])).toEqual({ username: ["a", "b"], resultsLimit: 12, dataDetailLevel: "detailedData", skipPinnedPosts: true });
  });

  it("the search run asks for 30 users per phrase", () => {
    expect(SEARCH_ACTOR).toBe("apify~instagram-search-scraper");
    expect(SEARCH_PHRASES).toEqual(["financial freedom", "private lending", "cash flow investing"]);
    expect(searchInput("private lending")).toEqual({ search: "private lending", searchType: "user", searchLimit: 30 });
  });

  it("found-via lines", () => {
    expect(foundVia("related", "ericsfinancials")).toBe("related to ericsfinancials");
    expect(foundVia("mentions", "ericsfinancials")).toBe("tagged by ericsfinancials");
    expect(foundVia("keywords", "cash flow investing")).toBe("search: cash flow investing");
  });
});

describe("discovery mappers", () => {
  it("a profile item maps to username, followers, bio and related accounts", () => {
    const out = mapProfileItems(profiles);
    expect(out[0]).toEqual({ username: "ericsfinancials", followers: 42056, bio: expect.stringContaining("Helping Gen Z"), isPrivate: false, related: [] });
    expect(out.find((p) => p.username === "amyalberse")?.isPrivate).toBe(true);
  });

  it("a profile with no follower count maps to null, not 0", () => {
    expect(mapProfileItems([{ username: "ghost", biography: "x" }])[0].followers).toBeNull();
    expect(mapProfileItems([{ username: "zero", followersCount: 0 }])[0].followers).toBe(0);
    expect(mapProfileItems([{ nothing: true }, null, "junk"])).toEqual([]);
  });

  it("related profiles carry their own follower count when the actor gives one", () => {
    const out = mapProfileItems([{ username: "a", followersCount: 10, relatedProfiles: [{ username: "B", followersCount: 99 }, { username: "c" }] }]);
    expect(out[0].related).toEqual([{ username: "b", followers: 99 }, { username: "c", followers: null }]);
  });

  it("sample items keep Reels by the listed owners, newest first, 12 at most", () => {
    const items = [
      ...(reels as unknown[]),
      reelItem("manyreels", 0, { videoViewCount: 7 }),
      ...Array.from({ length: 14 }, (_, i) => reelItem("manyreels", i + 1)),
      reelItem("someoneelse", 1),
      reelItem("manyreels", 99, { type: "Sidecar", productType: "feed" }),
    ];
    const out = mapSampleItems(items, ["omnitheinvestorguy", "cashflowbreakfastclub", "manyreels", "nopostsatall"]);
    expect(out.get("omnitheinvestorguy")?.length).toBe(3);
    expect(out.get("cashflowbreakfastclub")).toEqual([]);
    expect(out.get("nopostsatall")).toEqual([]);
    expect(out.has("someoneelse")).toBe(false);
    const many = out.get("manyreels") ?? [];
    expect(many).toHaveLength(12);
    expect(many[0].posted_at >= many[11].posted_at).toBe(true);
    expect(many[0]).toMatchObject({ shortcode: "manyreels-0", views: 7, caption: "caption 0" });
  });

  it("views come from videoViewCount, falling back to videoPlayCount", () => {
    const out = mapSampleItems([reelItem("a", 1, { videoViewCount: undefined, videoPlayCount: 55 }), reelItem("a", 2, { videoViewCount: 77 }), reelItem("a", 3, { videoViewCount: null })], ["a"]);
    expect(out.get("a")?.map((r) => r.views)).toEqual([55, 77, null]);
  });

  it("search items skip errors and carry followers and the private flag", () => {
    const out = mapSearchItems(search, "financial freedom");
    expect(out.map((o) => o.username)).not.toContain("xfinancialfreedom");
    expect(out.find((o) => o.username === "her.financialfreedom")).toEqual({ username: "her.financialfreedom", found_via: "search: financial freedom", followers: 6616, isPrivate: false });
    expect(out.find((o) => o.username === "iam.financial.freedom")?.isPrivate).toBe(true);
  });
});
