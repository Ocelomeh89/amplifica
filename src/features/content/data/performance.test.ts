// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPostsForMath, loadSnapshotRows } from "./performance";

type Row = { post_id: string; captured_at: string; metrics: unknown };

function fakeClient(rows: Row[]) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: (col: string) => {
      orders.push(col);
      return builder;
    },
    range: async (from: number, to: number) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  const client = { from: () => builder };
  return { client: client as unknown as Parameters<typeof loadSnapshotRows>[0], ranges, orders };
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
  it("breaks ties on id so a page boundary inside one cron run's rows cannot skip or repeat a snapshot", async () => {
    const { client, orders } = fakeClient([]);
    await loadSnapshotRows(client, "user-1", ["p"]);
    expect(orders).toEqual(["captured_at", "id"]);
  });
});

describe("as-of reads", () => {
  type PostRow = { id: string; posted_at: string };
  function asOfClient(posts: PostRow[], snaps: Row[]) {
    const lts: [string, string][] = [];
    const make = (table: string) => {
      let rows: Record<string, unknown>[] = (table === "content_posts" ? posts : snaps).map((r) => ({ ...r }));
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        lt: (col: string, v: string) => {
          lts.push([col, v]);
          rows = rows.filter((r) => String(r[col]) < v);
          return b;
        },
        order: () => b,
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
      };
      return b;
    };
    return { client: { from: make } as unknown as Parameters<typeof loadPostsForMath>[0], lts };
  }
  const postRow = (id: string, posted_at: string) => ({ id, posted_at, platform: "instagram", format: "reel", media_type: "reel", thumbnail_url: "", pillar: "", hook_type: "", hook_used: "", caption: "", url: "", idea_id: null, onscreen_text: "", message: "", topic: "", cta_type: "", post_style: "", cover_face: null, cover_text: null, cover_number: null, hook_spoken: "", hook_onscreen: "", tag_confidence: {}, tag_locks: [], tagged_at: null });
  const snap = (post_id: string, captured_at: string, views: number) => ({ post_id, captured_at, metrics: { views, saves: views / 10, shares: 2 } });
  const posts = [postRow("a", "2026-11-01T00:00:00Z"), postRow("b", "2026-11-12T00:00:00Z")];
  const snaps = [snap("a", "2026-11-05T00:00:00Z", 100), snap("a", "2026-11-14T00:00:00Z", 300), snap("b", "2026-11-13T00:00:00Z", 50)];

  it("with before, later snapshots and later posts are not loaded", async () => {
    const { client, lts } = asOfClient(posts as unknown as PostRow[], snaps);
    const out = await loadPostsForMath(client, "u1", { before: new Date("2026-11-10T00:00:00Z") });
    expect(out.map((p) => p.id)).toEqual(["a"]);
    expect(out[0].series.map((s) => s.views)).toEqual([100]);
    expect(lts).toContainEqual(["posted_at", "2026-11-10T00:00:00.000Z"]);
    expect(lts).toContainEqual(["captured_at", "2026-11-10T00:00:00.000Z"]);
  });

  it("without it nothing changes, and every series point carries saves and shares", async () => {
    const { client, lts } = asOfClient(posts as unknown as PostRow[], snaps);
    const out = await loadPostsForMath(client, "u1");
    expect(out.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(lts).toEqual([]);
    const a = out.find((p) => p.id === "a")!;
    expect(a.series).toEqual([{ at: "2026-11-05T00:00:00Z", views: 100, saves: 10, shares: 2 }, { at: "2026-11-14T00:00:00Z", views: 300, saves: 30, shares: 2 }]);
  });
});
