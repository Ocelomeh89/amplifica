import { describe, expect, it, vi } from "vitest";
import type { ToolCaller } from "./claude";
import { addCreator, buildCreatorsPage, collectRuns, startWeeklyPull, tagPopular, type CreatorRow } from "./competitors";
import { competitorPost, fakeApify, fakeCompetitorsDb } from "./competitors.fake";

const MONDAY = new Date("2026-11-02T11:00:00Z"); // 05:00 Chicago, Monday
const TUESDAY = new Date("2026-11-03T11:00:00Z");
const creator = (over: Partial<CreatorRow> = {}): CreatorRow => ({ id: "c1", username: "micro.investing", status: "watching", last_pulled_at: null, last_pull_status: null, ...over });
const run = (over: Record<string, unknown> = {}) => ({ id: "r1", apify_run_id: "apify-1", status: "pending" as const, error: "", started_at: MONDAY.toISOString(), finished_at: null, cost_usd: null, items: null, usernames: ["micro.investing"], ...over });
const item = (o: Record<string, unknown> = {}) => ({ ownerUsername: "micro.investing", type: "Video", shortCode: "A1", url: "https://www.instagram.com/p/A1/", timestamp: "2026-10-30T12:00:00.000Z", caption: "c", videoPlayCount: 900, ...o });
const validTags = {
  hook_type: "paradox", onscreen_text: "repeats-hook", cover_face: true, cover_text: true, cover_number: false, cta_type: "save", post_style: "text-broll",
  message: "", hook_text: "h", pushes_belief: "max out your 401k", format_note: null,
  tag_confidence: { hook_type: 0.8, onscreen_text: 0.8, message: 0.2, cta_type: 0.8, post_style: 0.8, cover_face: 0.9, cover_text: 0.9, cover_number: 0.9 },
};
const caller = (answer: unknown = validTags) => {
  const call = vi.fn(async (_input: unknown) => answer);
  return { caller: { call } as unknown as ToolCaller, call };
};

describe("startWeeklyPull", () => {
  it("Monday starts one run for all watching creators, 90 days when one is new; Tuesday does not; force does", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator(), creator({ id: "c2", username: "ericsfinancials", last_pulled_at: "2026-10-26T11:00:00Z" })] });
    const { apify, started } = fakeApify();
    expect(await startWeeklyPull(db, apify, TUESDAY, false)).toEqual({ started: false, error: null });
    expect(await startWeeklyPull(db, apify, MONDAY, false)).toEqual({ started: true, error: null });
    expect(started).toEqual([{ usernames: ["micro.investing", "ericsfinancials"], newerThanDays: 90 }]);
    expect(state.runs).toHaveLength(1);
    state.runs[0].status = "ready";
    expect((await startWeeklyPull(db, apify, MONDAY, false)).started).toBe(false); // same week
    expect((await startWeeklyPull(db, apify, TUESDAY, true)).started).toBe(true);
  });

  it("never starts while a run is pending, or with no watching creator", async () => {
    const pending = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    expect((await startWeeklyPull(pending.db, fakeApify().apify, MONDAY, true)).started).toBe(false);
    const none = fakeCompetitorsDb({ creators: [creator({ status: "removed" })] });
    const { apify, started } = fakeApify();
    expect((await startWeeklyPull(none.db, apify, MONDAY, true)).started).toBe(false);
    expect(started).toHaveLength(0);
  });

  it("removed creators are not pulled", async () => {
    const { db } = fakeCompetitorsDb({ creators: [creator(), creator({ id: "c2", username: "gone", status: "removed" })] });
    const { apify, started } = fakeApify();
    await startWeeklyPull(db, apify, MONDAY, false);
    expect(started[0].usernames).toEqual(["micro.investing"]);
  });

  it("reports an Apify error instead of throwing", async () => {
    const { db } = fakeCompetitorsDb({ creators: [creator()] });
    const apify = { ...fakeApify().apify, startRun: async () => { throw new Error("402 payment required"); } };
    expect(await startWeeklyPull(db, apify, MONDAY, false)).toEqual({ started: false, error: "402 payment required" });
  });
});

describe("collectRuns", () => {
  it("a finished run stores only the creator's own Reels and marks run and creators ready", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    const { apify } = fakeApify({
      "apify-1": { status: "ready", datasetId: "ds", costUsd: 0.08, error: "", items: [item(), item({ shortCode: "B2", ownerUsername: "collab.guy" }), item({ shortCode: "C3", type: "Sidecar" })] },
    });
    expect(await collectRuns(db, apify, TUESDAY)).toMatchObject({ stored: 1, failed: 0 });
    expect(state.posts.map((p) => [p.shortcode, p.creator_id, p.views])).toEqual([["A1", "c1", 900]]);
    expect(state.runs[0]).toMatchObject({ status: "ready", items: 1, cost_usd: 0.08 });
    expect(state.creators[0]).toMatchObject({ last_pull_status: "ready", last_pulled_at: TUESDAY.toISOString() });
  });

  it("a re-pull updates the views of a stored post", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], runs: [run()], posts: [competitorPost({ shortcode: "A1", views: 100 })] });
    await collectRuns(db, fakeApify({ "apify-1": { status: "ready", datasetId: "ds", costUsd: 0, error: "", items: [item({ videoPlayCount: 5000 })] } }).apify, TUESDAY);
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0].views).toBe(5000);
  });

  it("a failed run is recorded with its error and marks creators failed", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    expect(await collectRuns(db, fakeApify({ "apify-1": { status: "failed", datasetId: null, costUsd: 0.01, error: "FAILED: blocked" } }).apify, TUESDAY)).toMatchObject({ stored: 0, failed: 1 });
    expect(state.runs[0]).toMatchObject({ status: "failed", error: "FAILED: blocked" });
    expect(state.creators[0].last_pull_status).toBe("failed");
  });

  it("a run pending for more than 48 hours is marked failed 'timed out'; a younger one waits", async () => {
    const pending = { status: "pending" as const, datasetId: null, costUsd: null, error: "" };
    const young = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    await collectRuns(young.db, fakeApify({ "apify-1": pending }).apify, TUESDAY);
    expect(young.state.runs[0].status).toBe("pending");
    const old = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    await collectRuns(old.db, fakeApify({ "apify-1": pending }).apify, new Date(MONDAY.getTime() + 49 * 3_600_000));
    expect(old.state.runs[0]).toMatchObject({ status: "failed", error: "timed out" });
  });

  it("one run throwing does not stop the next", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], runs: [run({ id: "r1", apify_run_id: "missing" }), run({ id: "r2", apify_run_id: "apify-2" })] });
    const { apify } = fakeApify({ "apify-2": { status: "ready", datasetId: "ds2", costUsd: 0, error: "", items: [item()] } });
    const result = await collectRuns(db, apify, TUESDAY);
    expect(result).toMatchObject({ stored: 1, failed: 0 });
    expect(result.errors).toEqual(["run missing: no run missing"]);
    expect(state.runs.map((r) => r.status)).toEqual(["pending", "ready"]);
  });
});

describe("tagPopular", () => {
  // Median 100 over eight Reels; a 3x post is popular.
  const base = Array.from({ length: 8 }, (_, i) => competitorPost({ shortcode: `m${i}`, views: 100, posted_at: "2026-10-01T12:00:00.000Z", tagged_at: "2026-10-02T00:00:00Z" }));

  it("tags only popular fresh posts, best first, at most five", async () => {
    const posts = [
      ...base,
      competitorPost({ shortcode: "pop", views: 300 }),
      competitorPost({ shortcode: "meh", views: 200 }),
      competitorPost({ shortcode: "stale", views: 900, posted_at: "2026-10-10T12:00:00.000Z" }),
      ...Array.from({ length: 6 }, (_, i) => competitorPost({ shortcode: `big${i}`, views: 1000 + i })),
    ];
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], posts });
    const { caller: c, call } = caller();
    expect(await tagPopular(db, c, TUESDAY, () => 250)).toEqual({ tagged: 5 });
    expect(state.posts.filter((p) => p.tagged_at !== null && !p.shortcode.startsWith("m")).map((p) => p.shortcode)).toEqual(["big1", "big2", "big3", "big4", "big5"]); // big0 is the sixth best
    expect(call.mock.calls[0][0]).toMatchObject({ image: { url: "https://cdn.example/t.jpg" }, model: "claude-sonnet-5-5" });
  });

  it("stops when the Today tail would lose its time", async () => {
    const { db } = fakeCompetitorsDb({ creators: [creator()], posts: [...base, competitorPost({ shortcode: "pop", views: 300 })] });
    const { caller: c, call } = caller();
    expect(await tagPopular(db, c, TUESDAY, () => 120)).toEqual({ tagged: 0 });
    expect(call).not.toHaveBeenCalled();
  });

  it("an invalid answer leaves the post untagged; a removed creator's posts are never candidates", async () => {
    const { db, state } = fakeCompetitorsDb({
      creators: [creator(), creator({ id: "c2", username: "gone", status: "removed" })],
      posts: [...base, competitorPost({ shortcode: "pop", views: 300 }), competitorPost({ shortcode: "gone1", creator_id: "c2", views: 99999 })],
    });
    const { caller: c, call } = caller({ hook_type: "nonsense" });
    expect(await tagPopular(db, c, TUESDAY, () => 250)).toEqual({ tagged: 0 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(state.posts.find((p) => p.shortcode === "pop")!.tagged_at).toBeNull();
  });
});

describe("addCreator and the Creators page", () => {
  it("normalizes, rejects junk and re-watches a removed creator", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator({ status: "removed" })] });
    expect(await addCreator(db, "not a name!")).toEqual({ error: "That isn't an Instagram username." });
    expect(await addCreator(db, "@Micro.Investing")).toEqual({ error: null });
    expect(state.creators).toHaveLength(1);
    expect(state.creators[0].status).toBe("watching");
    await addCreator(db, "https://www.instagram.com/ericsfinancials/");
    expect(state.creators.map((c) => c.username)).toEqual(["micro.investing", "ericsfinancials"]);
  });

  it("lists watching creators first with their median and popular posts", () => {
    const posts = [...Array.from({ length: 8 }, (_, i) => competitorPost({ shortcode: `m${i}`, views: 100 })), competitorPost({ shortcode: "pop", views: 400, briefed_at: "2026-11-01T11:00:00Z" })];
    const page = buildCreatorsPage([creator({ id: "c9", username: "aaa", status: "removed" }), creator()], posts, null, TUESDAY);
    expect(page.creators.map((c) => c.username)).toEqual(["micro.investing", "aaa"]);
    expect(page.creators[0]).toMatchObject({ median: 100, count: 9, thin: false });
    expect(page.creators[0].popular).toEqual([{ id: "pop", url: "https://www.instagram.com/p/pop/", posted_at: "2026-10-28T12:00:00.000Z", multiple: 4, briefed: true }]);
    expect(page.creators[1]).toMatchObject({ median: null, count: 0, popular: [] });
  });
});

describe("review fixes", () => {
  it("a failed first run keeps the creator never-pulled, so the next pull still asks for 90 days", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()], runs: [run()] });
    await collectRuns(db, fakeApify({ "apify-1": { status: "failed", datasetId: null, costUsd: 0, error: "FAILED: x" } }).apify, TUESDAY);
    expect(state.creators[0]).toMatchObject({ last_pulled_at: null, last_pull_status: "failed" });
    const { apify, started } = fakeApify();
    await startWeeklyPull(db, apify, TUESDAY, true);
    expect(started[0].newerThanDays).toBe(90);
  });

  it("a run marks only the creators it pulled; one added while it ran is still never-pulled", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator(), creator({ id: "c2", username: "ericsfinancials" })], runs: [run()] });
    await collectRuns(db, fakeApify({ "apify-1": { status: "ready", datasetId: "ds", costUsd: 0, error: "", items: [item(), item({ ownerUsername: "ericsfinancials", shortCode: "E1" })] } }).apify, TUESDAY);
    expect(state.creators.find((c) => c.id === "c1")!.last_pull_status).toBe("ready");
    expect(state.creators.find((c) => c.id === "c2")).toMatchObject({ last_pulled_at: null, last_pull_status: null });
    expect(state.posts.map((p) => p.shortcode)).toEqual(["A1"]);
  });

  it("startWeeklyPull records the usernames it sent", async () => {
    const { db, state } = fakeCompetitorsDb({ creators: [creator()] });
    await startWeeklyPull(db, fakeApify().apify, MONDAY, false);
    expect(state.runs[0].usernames).toEqual(["micro.investing"]);
  });
});
