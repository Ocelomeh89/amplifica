import { describe, expect, it } from "vitest";
import { fetchPublicPage } from "./fetch-page";

type Reply = { status: number; headers?: Record<string, string>; body?: string };
function fakes(replies: Record<string, Reply>, hosts: Record<string, string> = {}) {
  const requested: string[] = [];
  const fetchImpl = (async (url: string) => {
    requested.push(url);
    const r = replies[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    const headers = { "content-type": "text/html; charset=utf-8", ...(r.headers ?? {}) };
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (k: string) => headers[k.toLowerCase() as keyof typeof headers] ?? null },
      text: async () => r.body ?? "",
    };
  }) as unknown as typeof fetch;
  const lookup = async (host: string) => [{ address: hosts[host] ?? "93.184.216.34" }];
  return { fetchImpl, lookup, requested };
}

describe("fetchPublicPage", () => {
  it("returns the html and final url for a public page", async () => {
    const f = fakes({ "https://example.com/a": { status: 200, body: "<p>hi</p>" } });
    expect(await fetchPublicPage("https://example.com/a", f)).toEqual({ html: "<p>hi</p>", finalUrl: "https://example.com/a" });
  });
  it("refuses a host that resolves to a private address, without requesting it", async () => {
    const f = fakes({}, { "evil.example": "10.0.0.5" });
    await expect(fetchPublicPage("https://evil.example/", f)).rejects.toThrow(/private/);
    expect(f.requested).toEqual([]);
  });
  it("follows a redirect to another public page", async () => {
    const f = fakes({
      "https://example.com/a": { status: 301, headers: { location: "/b" } },
      "https://example.com/b": { status: 200, body: "ok" },
    });
    expect((await fetchPublicPage("https://example.com/a", f)).finalUrl).toBe("https://example.com/b");
  });
  it("refuses a redirect to the cloud metadata address", async () => {
    const f = fakes({ "https://example.com/a": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } } });
    await expect(fetchPublicPage("https://example.com/a", f)).rejects.toThrow(/private/);
    expect(f.requested).toEqual(["https://example.com/a"]);
  });
  it("refuses a redirect to a hostname that resolves privately", async () => {
    const f = fakes(
      { "https://example.com/a": { status: 302, headers: { location: "https://rebind.example/x" } } },
      { "rebind.example": "192.168.0.10" }
    );
    await expect(fetchPublicPage("https://example.com/a", f)).rejects.toThrow(/private/);
  });
  it("gives up on a redirect loop", async () => {
    const f = fakes({ "https://example.com/a": { status: 302, headers: { location: "https://example.com/a" } } });
    await expect(fetchPublicPage("https://example.com/a", f)).rejects.toThrow(/too many/i);
  });
  it("rejects non-pages and error statuses", async () => {
    const pdf = fakes({ "https://example.com/f": { status: 200, headers: { "content-type": "application/pdf" } } });
    await expect(fetchPublicPage("https://example.com/f", pdf)).rejects.toThrow(/isn't a web page/);
    const gone = fakes({ "https://example.com/g": { status: 404 } });
    await expect(fetchPublicPage("https://example.com/g", gone)).rejects.toThrow(/404/);
  });
});

describe("fetchPublicPage body bounds", () => {
  const MIB = 1024 * 1024;
  it("rejects a content-length over 20 MiB without reading the body", async () => {
    let read = false;
    const fetchImpl = (async () => ({
      status: 200,
      ok: true,
      headers: { get: (k: string) => ({ "content-type": "text/html", "content-length": String(30 * MIB) } as Record<string, string>)[k.toLowerCase()] ?? null },
      text: async () => {
        read = true;
        return "";
      },
      body: {
        getReader: () => {
          read = true;
          throw new Error("should not read");
        },
      },
    })) as unknown as typeof fetch;
    const lookup = async () => [{ address: "93.184.216.34" }];
    await expect(fetchPublicPage("https://example.com/big", { fetchImpl, lookup })).rejects.toThrow(/too large/);
    expect(read).toBe(false);
  });
  it("truncates a streamed body at the cap and stops reading early", async () => {
    const cap = 2 * MIB;
    const chunk = new Uint8Array(512 * 1024).fill(97);
    let pulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
        if (pulled >= 100) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = (async () => ({
      status: 200,
      ok: true,
      headers: { get: (k: string) => ({ "content-type": "text/html" } as Record<string, string>)[k.toLowerCase()] ?? null },
      body: stream,
    })) as unknown as typeof fetch;
    const lookup = async () => [{ address: "93.184.216.34" }];
    const r = await fetchPublicPage("https://example.com/stream", { fetchImpl, lookup });
    expect(r.html.length).toBe(cap);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });
});
