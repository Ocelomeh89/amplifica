import { describe, expect, it } from "vitest";
import { externalIdFromUrl, platformFromUrl } from "./posts";

describe("platformFromUrl", () => {
  it("recognizes the four platforms", () => {
    expect(platformFromUrl("https://www.instagram.com/reel/C9abc123/")).toBe("instagram");
    expect(platformFromUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromUrl("https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric")).toBe("beehiiv");
    expect(platformFromUrl("https://x.com/amplifica/status/1234567890")).toBe("x");
    expect(platformFromUrl("https://twitter.com/amplifica/status/1234567890")).toBe("x");
  });
  it("is null for anything else or an unparsable string", () => {
    expect(platformFromUrl("https://example.com/post")).toBeNull();
    expect(platformFromUrl("not a url")).toBeNull();
  });
});

describe("externalIdFromUrl", () => {
  it("takes the shortcode, video id, slug, or status id", () => {
    expect(externalIdFromUrl("https://www.instagram.com/reel/C9abc123/", "instagram")).toBe("C9abc123");
    expect(externalIdFromUrl("https://www.instagram.com/p/C9abc123/?igsh=xyz", "instagram")).toBe("C9abc123");
    expect(externalIdFromUrl("https://youtu.be/dQw4w9WgXcQ", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube")).toBe("dQw4w9WgXcQ");
    expect(externalIdFromUrl("https://newsletter.amplificawealth.com/p/net-worth-is-a-vanity-metric", "beehiiv")).toBe("net-worth-is-a-vanity-metric");
    expect(externalIdFromUrl("https://x.com/amplifica/status/1234567890", "x")).toBe("1234567890");
  });
});
