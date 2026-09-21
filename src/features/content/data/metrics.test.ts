import { describe, expect, it, vi } from "vitest";
import { runMetricsCron, storePull, type MetricsDb } from "./metrics";
import type { Pull, PulledPost } from "./pulls/types";

const post: PulledPost = {
  platform: "instagram",
  external_id: "Ddh0MkWxvTI",
  url: "https://www.instagram.com/reel/Ddh0MkWxvTI/",
  format: "reel",
  posted_at: "2026-09-21T00:00:00.000Z",
  caption: "I was offered a new job.",
  metrics: { reach: 384, saves: 2 },
  comments: [{ external_id: "17908579638504125", author: "karipesch", text: "Congrats!!", occurred_at: "2026-09-21T12:55:02.000Z" }],
};

function fakeDb() {
  const calls: Record<string, unknown[]> = { upsertPosts: [], insertSnapshots: [], upsertComments: [] };
  const db: MetricsDb = {
    async upsertPosts(rows) {
      calls.upsertPosts.push(rows);
      return rows.map((r, i) => ({ id: `post-${i}`, platform: r.platform, external_id: r.external_id }));
    },
    async insertSnapshots(rows) {
      calls.insertSnapshots.push(rows);
      return rows.length;
    },
    async upsertComments(rows) {
      calls.upsertComments.push(rows);
      return rows.length;
    },
  };
  return { db, calls };
}

describe("storePull", () => {
  it("writes posts, one snapshot per post, and comments as sources keyed to the post", async () => {
    const { db, calls } = fakeDb();
    const out = await storePull(db, "user-1", { posts: [post], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(out).toEqual({ posts: 1, snapshots: 1, comments: 1 });
    expect(calls.upsertPosts[0]).toEqual([
      { user_id: "user-1", platform: "instagram", external_id: "Ddh0MkWxvTI", url: post.url, format: "reel", posted_at: post.posted_at, caption: post.caption },
    ]);
    expect(calls.insertSnapshots[0]).toEqual([{ user_id: "user-1", post_id: "post-0", captured_at: "2026-09-22T10:00:00.000Z", metrics: { reach: 384, saves: 2 } }]);
    expect(calls.upsertComments[0]).toEqual([
      {
        user_id: "user-1",
        kind: "comment",
        external_id: "instagram:17908579638504125",
        title: "karipesch: Congrats!!",
        url: post.url,
        occurred_at: "2026-09-21T12:55:02.000Z",
        status: "allowed",
        meta: { post_id: "post-0", platform: "instagram", author: "karipesch", text: "Congrats!!", replied: false },
      },
    ]);
  });

  it("skips a snapshot for a post the db did not return an id for", async () => {
    const { db } = fakeDb();
    db.upsertPosts = async () => [];
    const out = await storePull(db, "u", { posts: [post], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(out).toEqual({ posts: 0, snapshots: 0, comments: 0 });
  });

  it("does nothing on an empty pull", async () => {
    const { db, calls } = fakeDb();
    await storePull(db, "u", { posts: [], errors: [] }, "2026-09-22T10:00:00.000Z");
    expect(calls.upsertPosts).toEqual([]);
  });
});

describe("runMetricsCron", () => {
  it("runs every pull, isolates a throwing one, and reports per platform", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();
    const ok: Pull = { posts: [post], errors: ["instagram: insights x: boom"] };
    const report = await runMetricsCron({
      db,
      userId: "u",
      now: new Date("2026-09-22T10:00:00.000Z"),
      pulls: {
        instagram: async () => ok,
        youtube: async () => { throw new Error("quota"); },
        beehiiv: async () => ({ posts: [], errors: [] }),
      },
    });
    expect(report.ok).toBe(true);
    expect(report.platforms.instagram).toEqual({ posts: 1, snapshots: 1, comments: 1, errors: ["instagram: insights x: boom"] });
    expect(report.platforms.youtube).toEqual({ posts: 0, snapshots: 0, comments: 0, errors: ["youtube: quota"] });
    expect(report.platforms.beehiiv.posts).toBe(0);
  });

  it("is not ok when every pull failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb();
    const boom = async () => { throw new Error("x"); };
    const report = await runMetricsCron({ db, userId: "u", now: new Date(), pulls: { instagram: boom, youtube: boom, beehiiv: boom } });
    expect(report.ok).toBe(false);
  });
});
