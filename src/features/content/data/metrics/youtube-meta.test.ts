import { describe, expect, it, vi } from "vitest";
import { fetchVideoMeta } from "./youtube-meta";

const reply = (body: unknown, ok = true, status = 200) =>
  vi.fn(async (_url: string) => ({ ok, status, json: async () => body })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("fetchVideoMeta", () => {
  it("returns the title and description", async () => {
    const f = reply({ items: [{ snippet: { title: "T", description: "D" } }] });
    expect(await fetchVideoMeta("abc", "KEY", f)).toEqual({ title: "T", description: "D" });
    const called = String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(called).toContain("id=abc");
    expect(called).toContain("key=KEY");
  });
  it("returns null with no key, no id, or no such video", async () => {
    expect(await fetchVideoMeta("abc", undefined, reply({}))).toBeNull();
    expect(await fetchVideoMeta("", "KEY", reply({}))).toBeNull();
    expect(await fetchVideoMeta("abc", "KEY", reply({ items: [] }))).toBeNull();
  });
  it("throws a readable error when the API refuses", async () => {
    await expect(fetchVideoMeta("abc", "KEY", reply({}, false, 403))).rejects.toThrow(/403/);
  });
});
