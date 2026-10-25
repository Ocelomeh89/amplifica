import { describe, expect, it, vi } from "vitest";
import {
  QUEUE_MAX,
  correctTags,
  getTagQueue,
  pickLocked,
  storeTags,
  type QueueRow,
  type TagsDb,
} from "./tags";
import type { PostTags } from "@/features/content/engine/tags";

const NOW = new Date("2026-10-26T12:00:00Z");
const ID_A = "5b9d1d1e-7c4e-4a39-9a55-0d8b3e1f2a10";
const ID_B = "6c0e2e2f-8d5f-4b4a-8b66-1e9c4f2a3b21";

type Stored = {
  tag_locks: string[];
  tag_confidence: Record<string, number>;
  values: Partial<PostTags>;
  tagged_at: string | null;
  version?: string;
};

function fakeDb(rows: Record<string, Stored>, queue: QueueRow[] = [], beforeWrite?: (id: string, attempt: number) => void) {
  const calls = { untagged: [] as { limit: number; since: Date }[], writes: [] as { id: string; patch: Partial<PostTags> }[] };
  let attempts = 0;
  let counter = 0;
  const db: TagsDb = {
    async untagged(limit, since) {
      calls.untagged.push({ limit, since });
      return { posts: queue.slice(0, limit), total: queue.length };
    },
    async locksFor(ids) {
      return new Map(ids.filter((i) => rows[i]).map((i) => [i, { ...rows[i], version: rows[i].version ?? "v0" }]));
    },
    async writeTags(id, patch, ifVersion) {
      beforeWrite?.(id, attempts++);
      const r = rows[id];
      if (ifVersion !== undefined && (r.version ?? "v0") !== ifVersion) return false;
      calls.writes.push({ id, patch });
      r.version = `v${++counter}`;
      const { tag_locks, tag_confidence, tagged_at, ...values } = patch;
      if (tag_locks) r.tag_locks = tag_locks;
      if (tag_confidence) r.tag_confidence = tag_confidence;
      if (tagged_at !== undefined) r.tagged_at = tagged_at;
      r.values = { ...r.values, ...values };
      return true;
    },
  };
  return { db, calls };
}

const row = (n: number): QueueRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  external_id: `SC${n}`,
  url: `https://instagram.com/reel/SC${n}/`,
  media_type: "reel",
  posted_at: "2026-10-20T10:00:00Z",
  caption: "c",
  hook_used: "",
  thumbnail_url: "t",
  tag_locks: [],
  locked: {},
});

describe("getTagQueue", () => {
  const lookup = async (codes: string[]) => new Map(codes.filter((c) => c !== "SC2").map((c) => [c, `https://cdn/${c}.mp4`]));

  it("defaults to 10, caps at 25, rejects a non-number, and reports what remains", async () => {
    const queue = Array.from({ length: 30 }, (_, i) => row(i));
    const a = fakeDb({}, queue);
    const def = await getTagQueue(a.db, lookup, null, NOW);
    expect((def.body as { posts: unknown[]; remaining: number }).posts).toHaveLength(10);
    expect((def.body as { remaining: number }).remaining).toBe(20);
    const big = await getTagQueue(a.db, lookup, "40", NOW);
    expect((big.body as { posts: unknown[] }).posts).toHaveLength(QUEUE_MAX);
    expect((await getTagQueue(a.db, lookup, "abc", NOW)).status).toBe(400);
    expect((await getTagQueue(a.db, lookup, "0", NOW)).status).toBe(400);
  });

  it("asks for posts from the last 90 days only", async () => {
    const a = fakeDb({}, [row(1)]);
    await getTagQueue(a.db, lookup, null, NOW);
    expect(a.calls.untagged[0].since.toISOString()).toBe(new Date(NOW.getTime() - 90 * 86_400_000).toISOString());
  });

  it("fills media_url, leaving it empty for a post the lookup misses", async () => {
    const a = fakeDb({}, [row(1), row(2)]);
    const r = await getTagQueue(a.db, lookup, null, NOW);
    const posts = (r.body as { posts: { external_id: string; media_url: string }[] }).posts;
    expect(posts.map((p) => p.media_url)).toEqual(["https://cdn/SC1.mp4", ""]);
  });

  it("still answers 200 with empty media_url when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = fakeDb({}, [row(1)]);
    const r = await getTagQueue(a.db, async () => { throw new Error("composio down"); }, null, NOW);
    expect(r.status).toBe(200);
    expect((r.body as { posts: { media_url: string }[] }).posts[0].media_url).toBe("");
    spy.mockRestore();
  });

  it("passes locks and locked values through", async () => {
    const q = { ...row(1), tag_locks: ["hook_type"], locked: { hook_type: "paradox" } };
    const a = fakeDb({}, [q]);
    const r = await getTagQueue(a.db, lookup, null, NOW);
    const p = (r.body as { posts: QueueRow[] }).posts[0];
    expect(p.tag_locks).toEqual(["hook_type"]);
    expect(p.locked).toEqual({ hook_type: "paradox" });
  });
});

describe("pickLocked", () => {
  it("returns only the locked tag fields", () => {
    expect(pickLocked({ hook_type: "paradox", message: "velocity", cover_face: true }, ["hook_type", "cover_face"])).toEqual({
      hook_type: "paradox",
      cover_face: true,
    });
  });
});

describe("storeTags", () => {
  const fresh = (): Stored => ({ tag_locks: [], tag_confidence: {}, values: {}, tagged_at: null });

  it("rejects a bad body and writes nothing", async () => {
    const a = fakeDb({ [ID_A]: fresh() });
    const r = await storeTags(a.db, { posts: [{ id: ID_A, hook_type: "nope" }] }, NOW);
    expect(r.status).toBe(400);
    expect(a.calls.writes).toHaveLength(0);
  });

  it("writes unlocked fields, skips locked ones including a cover flag, keeps locked confidence, stamps tagged_at", async () => {
    const stored: Stored = {
      tag_locks: ["hook_type", "cover_face"],
      tag_confidence: { hook_type: 1, cover_face: 1 },
      values: { hook_type: "paradox", cover_face: true },
      tagged_at: null,
    };
    const a = fakeDb({ [ID_A]: stored });
    const r = await storeTags(
      a.db,
      {
        posts: [
          {
            id: ID_A,
            hook_type: "question",
            cover_face: false,
            post_style: "animation",
            tag_confidence: { hook_type: 0.3, post_style: 0.9 },
          },
        ],
      },
      NOW
    );
    expect(r.status).toBe(200);
    const res = (r.body as { results: { id: string; written: string[]; skipped_locked: string[] }[] }).results[0];
    expect(res.written).toEqual(["post_style"]);
    expect(res.skipped_locked.sort()).toEqual(["cover_face", "hook_type"]);
    expect(stored.values).toMatchObject({ hook_type: "paradox", cover_face: true, post_style: "animation" });
    expect(stored.tag_confidence).toEqual({ hook_type: 1, cover_face: 1, post_style: 0.9 });
    expect(stored.tagged_at).toBe(NOW.toISOString());
  });

  it("reports an id it does not own as not_found and writes nothing for it", async () => {
    const a = fakeDb({ [ID_A]: fresh() });
    const r = await storeTags(a.db, { posts: [{ id: ID_B, post_style: "image" }, { id: ID_A, post_style: "image" }] }, NOW);
    const results = (r.body as { results: { id: string; error?: string }[] }).results;
    expect(results.find((x) => x.id === ID_B)?.error).toBe("not_found");
    expect(a.calls.writes.map((w) => w.id)).toEqual([ID_A]);
  });

  it("stores hook text and counts it as written", async () => {
    const a = fakeDb({ [ID_A]: fresh() });
    const r = await storeTags(a.db, { posts: [{ id: ID_A, hook_spoken: "hi", hook_onscreen: "yo" }] }, NOW);
    expect((r.body as { results: { written: string[] }[] }).results[0].written.sort()).toEqual(["hook_onscreen", "hook_spoken"]);
  });
});

describe("correctTags", () => {
  it("writes the field, locks it at confidence 1, and a later store leaves it alone", async () => {
    const stored: Stored = { tag_locks: [], tag_confidence: { post_style: 0.5 }, values: {}, tagged_at: null };
    const a = fakeDb({ [ID_A]: stored });
    expect(await correctTags(a.db, ID_A, { hook_type: "paradox", hook_spoken: "fixed words" })).toEqual({ error: null });
    expect(stored.tag_locks).toEqual(["hook_type"]);
    expect(stored.tag_confidence).toEqual({ post_style: 0.5, hook_type: 1 });
    expect(stored.tagged_at).toBeNull();
    await storeTags(a.db, { posts: [{ id: ID_A, hook_type: "question", post_style: "image" }] }, NOW);
    expect(stored.values.hook_type).toBe("paradox");
    expect(stored.values.post_style).toBe("image");
    expect(stored.tag_confidence.hook_type).toBe(1);
  });

  it("does not duplicate an existing lock", async () => {
    const stored: Stored = { tag_locks: ["hook_type"], tag_confidence: { hook_type: 1 }, values: { hook_type: "paradox" }, tagged_at: null };
    const a = fakeDb({ [ID_A]: stored });
    await correctTags(a.db, ID_A, { hook_type: "ranking" });
    expect(stored.tag_locks).toEqual(["hook_type"]);
  });

  it("errors on a post it does not own", async () => {
    const a = fakeDb({});
    expect((await correctTags(a.db, ID_A, { hook_type: "ranking" })).error).toMatch(/not found/i);
  });
});

describe("a correction landing between the read and the write", () => {
  it("storeTags re-reads, sees the new lock, and leaves the corrected field alone", async () => {
    const stored: Stored = { tag_locks: [], tag_confidence: {}, values: {}, tagged_at: null };
    const a = fakeDb({ [ID_A]: stored }, [], (_id, attempt) => {
      if (attempt === 0) {
        // Miguel corrects hook_type after the routine's read and before its write.
        stored.tag_locks = ["hook_type"];
        stored.tag_confidence = { hook_type: 1 };
        stored.values = { hook_type: "paradox" };
        stored.version = "concurrent";
      }
    });
    const r = await storeTags(a.db, { posts: [{ id: ID_A, hook_type: "question", post_style: "image", tag_confidence: { hook_type: 0.4, post_style: 0.9 } }] }, NOW);
    const res = (r.body as { results: { written: string[]; skipped_locked: string[] }[] }).results[0];
    expect(res.skipped_locked).toEqual(["hook_type"]);
    expect(res.written).toEqual(["post_style"]);
    expect(stored.values).toMatchObject({ hook_type: "paradox", post_style: "image" });
    expect(stored.tag_confidence).toEqual({ hook_type: 1, post_style: 0.9 });
  });

  it("storeTags reports a conflict rather than writing when the row keeps changing", async () => {
    const stored: Stored = { tag_locks: [], tag_confidence: {}, values: {}, tagged_at: null };
    const a = fakeDb({ [ID_A]: stored }, [], () => {
      stored.version = `churn-${Math.random()}`;
    });
    const r = await storeTags(a.db, { posts: [{ id: ID_A, post_style: "image" }] }, NOW);
    expect((r.body as { results: { error?: string }[] }).results[0].error).toBe("conflict");
    expect(stored.values).toEqual({});
  });

  it("correctTags keeps the routine's confidences written in between", async () => {
    const stored: Stored = { tag_locks: [], tag_confidence: {}, values: {}, tagged_at: null };
    const a = fakeDb({ [ID_A]: stored }, [], (_id, attempt) => {
      if (attempt === 0) {
        stored.tag_confidence = { post_style: 0.8 };
        stored.version = "routine-wrote";
      }
    });
    expect(await correctTags(a.db, ID_A, { hook_type: "paradox" })).toEqual({ error: null });
    expect(stored.tag_confidence).toEqual({ post_style: 0.8, hook_type: 1 });
    expect(stored.tag_locks).toEqual(["hook_type"]);
  });
});
