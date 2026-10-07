// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { subscribeToNewsletter } from "./beehiiv";

const fetchMock = vi.fn();

describe("subscribeToNewsletter", () => {
  const original = {
    key: process.env.BEEHIIV_API_KEY,
    pub: process.env.BEEHIIV_PUBLICATION_ID,
  };

  beforeEach(() => {
    process.env.BEEHIIV_API_KEY = "key";
    process.env.BEEHIIV_PUBLICATION_ID = "pub_123";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [k, v] of [
      ["BEEHIIV_API_KEY", original.key],
      ["BEEHIIV_PUBLICATION_ID", original.pub],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("skips and returns false when the keys are not set", async () => {
    delete process.env.BEEHIIV_API_KEY;
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the source as utm_source and the first name as a custom field", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ok = await subscribeToNewsletter({ email: "a@b.co", source: "quiz", firstName: "Sam" });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.beehiiv.com/v2/publications/pub_123/subscriptions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      email: "a@b.co",
      reactivate_existing: true,
      utm_source: "quiz",
      utm_medium: "organic",
      custom_fields: [{ name: "first_name", value: "Sam" }],
    });
    expect(init.headers.Authorization).toBe("Bearer key");
  });

  it("omits custom_fields when there is no first name", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await subscribeToNewsletter({ email: "a@b.co", source: "calculator" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.utm_source).toBe("calculator");
    expect(body).not.toHaveProperty("custom_fields");
  });

  it("returns false on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
  });

  it("returns false when the request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
  });
});
