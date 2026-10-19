// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadSnapshotRows } from "./performance";

type Row = { post_id: string; captured_at: string; metrics: unknown };

function fakeClient(rows: Row[]) {
  const ranges: [number, number][] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  const client = { from: () => builder };
  return { client: client as unknown as Parameters<typeof loadSnapshotRows>[0], ranges };
}

describe("loadSnapshotRows", () => {
  it("reads every page until a short one and keeps the order", async () => {
    const rows = Array.from({ length: 2350 }, (_, i) => ({
      post_id: "p",
      captured_at: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 24), i % 24)).toISOString(),
      metrics: { views: i },
    }));
    const { client, ranges } = fakeClient(rows);
    const out = await loadSnapshotRows(client, "user-1", ["p"]);
    expect(out).toHaveLength(2350);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(out[2349].metrics).toEqual({ views: 2349 });
  });
  it("stops after one request when the first page is short", async () => {
    const { client, ranges } = fakeClient([{ post_id: "p", captured_at: "2026-10-01T00:00:00Z", metrics: {} }]);
    expect(await loadSnapshotRows(client, "user-1", ["p"])).toHaveLength(1);
    expect(ranges).toEqual([[0, 999]]);
  });
});
