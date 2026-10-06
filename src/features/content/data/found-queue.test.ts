import { describe, expect, it, vi } from "vitest";
import { buildQueuedResponse, getQueued, parseLimit, type QueueDb, type QueuedRow } from "./found-queue";

const row = (id: string, created_at: string, meta: Record<string, unknown>): QueuedRow => ({
  id, kind: "url", external_id: `https://example.com/${id}`, title: `Post ${id}`, url: `https://example.com/${id}`, meta, created_at,
});
const text = "x".repeat(60);

describe("parseLimit", () => {
  it("defaults, and clamps to 1..10", () => {
    expect(parseLimit(null)).toBe(5);
    expect(parseLimit("")).toBe(5);
    expect(parseLimit("abc")).toBe(5);
    expect(parseLimit("3")).toBe(3);
    expect(parseLimit("0")).toBe(1);
    expect(parseLimit("-3")).toBe(1);
    expect(parseLimit("99")).toBe(10);
    expect(parseLimit("2.9")).toBe(2);
  });
});

describe("buildQueuedResponse", () => {
  it("returns the oldest first, up to the limit, with only the fields the routine needs", () => {
    const rows = [
      row("b", "2026-10-02T00:00:00Z", { text, note: "n", angle: "twist", competitor: "R", storage_path: "u/h/f.txt", mime: "text/plain" }),
      row("a", "2026-10-01T00:00:00Z", { text }),
      row("c", "2026-10-03T00:00:00Z", { text }),
    ];
    const r = buildQueuedResponse(rows, 3, 2);
    expect(r.sources.map((s) => s.external_id)).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(r.remaining).toBe(1);
    expect(r.sources[1].meta).toEqual({ text, note: "n", angle: "twist", competitor: "R" });
    expect(r.sources[0].meta).toEqual({ text, note: "", angle: "open", competitor: "" });
  });
  it("orders timestamps with and without a fraction by code point, oldest first", () => {
    const rows = [
      row("b", "2026-10-01T10:00:00.5+00:00", { text }),
      row("a", "2026-10-01T10:00:00+00:00", { text }),
    ];
    expect(buildQueuedResponse(rows, 2, 5).sources.map((s) => s.title)).toEqual(["Post a", "Post b"]);
  });
  it("skips sources without stored text and does not count them as remaining", () => {
    const rows = [
      row("a", "2026-10-01T00:00:00Z", { text: "short" }),
      row("b", "2026-10-02T00:00:00Z", {}),
      row("c", "2026-10-03T00:00:00Z", { text }),
    ];
    const r = buildQueuedResponse(rows, 3, 5);
    expect(r.sources.map((s) => s.title)).toEqual(["Post c"]);
    expect(r.remaining).toBe(0);
  });
  it("counts rows beyond the fetch window as remaining", () => {
    const rows = [row("a", "2026-10-01T00:00:00Z", { text })];
    expect(buildQueuedResponse(rows, 40, 5)).toMatchObject({ remaining: 39 });
  });
  it("is empty when nothing is queued", () => {
    expect(buildQueuedResponse([], 0, 5)).toEqual({ sources: [], remaining: 0 });
  });
});

describe("getQueued", () => {
  it("reads the window from the db and applies the parsed limit", async () => {
    const db: QueueDb = {
      queuedFound: async () => ({
        rows: [row("a", "2026-10-01T00:00:00Z", { text }), row("b", "2026-10-02T00:00:00Z", { text })],
        total: 2,
      }),
    };
    const r = await getQueued(db, "1");
    expect(r.sources).toHaveLength(1);
    expect(r.remaining).toBe(1);
  });
  it("logs when rows are queued but none has usable text", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const db: QueueDb = { queuedFound: async () => ({ rows: [row("a", "2026-10-01T00:00:00Z", { text: "short" })], total: 1 }) };
      const r = await getQueued(db, null);
      expect(r.sources).toEqual([]);
      expect(spy).toHaveBeenCalledWith("found queue: rows are queued but none has usable text (under 40 characters)");
    } finally {
      spy.mockRestore();
    }
  });
});
