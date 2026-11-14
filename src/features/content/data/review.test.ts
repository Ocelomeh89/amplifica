import { describe, expect, it, vi } from "vitest";
import type { ToolCaller } from "./claude";
import type { PostRowForView } from "./performance";
import { buildReview } from "./review";
import { fakeReviewDb } from "./review.fake";

vi.mock("server-only", () => ({}));

const DAY = 86_400_000;
const MON = new Date("2026-11-16T13:30:00Z"); // Monday 07:30 Chicago, the review day for week 2026-11-09
const WED = new Date("2026-11-18T18:00:00Z");
const NEXT_MON = new Date("2026-11-23T14:00:00Z");
const W1 = "2026-11-09";
const W2 = "2026-11-16";

/** A Reel with one snapshot a day for 7 days (views climb to v7), another at day 20, and any extra points. */
function reel(id: string, postedAt: string, v7: number, tags: { hook_type?: string; topic?: string; message?: string } = {}, extraPoints: { at: string; views: number }[] = []): PostRowForView {
  const t = new Date(postedAt).getTime();
  const series = [1, 2, 3, 4, 5, 6, 7, 20].map((d) => ({ at: new Date(t + d * DAY).toISOString(), views: d === 20 ? v7 * 1.1 : (v7 * d) / 7, saves: d * 2, shares: d }));
  return {
    id, platform: "instagram", format: "reel", media_type: "reel", posted_at: postedAt, pillar: "", hook_type: tags.hook_type ?? "question", hook_used: "", caption: `Caption ${id}`,
    url: `https://instagram.com/reel/${id}/`, idea_id: null, thumbnail_url: "", onscreen_text: "", message: tags.message ?? "w2-advantage", topic: tags.topic ?? "predictable-income", cta_type: "", post_style: "",
    cover_face: null, cover_text: null, cover_number: null, hook_spoken: `Hook ${id}`, hook_onscreen: "", tag_confidence: {}, tag_locks: [], tagged_at: "2026-10-01T00:00:00Z",
    metrics: {}, first: null, latest_at: null, series: [...series, ...extraPoints],
  } as unknown as PostRowForView;
}
const at = (day: string, hour = 15) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`;

/** 12 typical Reels, 4 promise Reels that lag, 2 ranking Reels that lag, and a good and a bad Reel in the week. */
function world(extra: PostRowForView[] = []): PostRowForView[] {
  const days = ["2026-09-20", "2026-09-22", "2026-09-24", "2026-09-26", "2026-09-28", "2026-09-30", "2026-10-02", "2026-10-04", "2026-10-06", "2026-10-08", "2026-10-10", "2026-10-12"];
  const questions = days.map((d, i) => reel(`q${i}`, at(d), 1000));
  const promises = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((d, i) => reel(`p${i}`, at(d), 100, { hook_type: "promise", topic: "" }));
  const rankings = ["2026-10-21", "2026-10-22"].map((d, i) => reel(`r${i}`, at(d), 100, { hook_type: "ranking", topic: "" }));
  const good = reel("w1", at("2026-11-10"), 4000 * 1.4, { hook_type: "question" }, [{ at: at("2026-11-16", 15), views: 9999 }]);
  const bad = reel("w2", at("2026-11-11"), 60, { hook_type: "ranking", topic: "" });
  return [...questions, ...promises, ...rankings, good, bad, ...extra];
}
const tuesdayPost = () => reel("tue", at("2026-11-17"), 500);

type Call = { text: string };
function scripted(why: (id: string, text: string) => string = () => "A Question hook, the kind that usually holds.") {
  const calls: Call[] = [];
  const caller: ToolCaller & { calls: Call[] } = {
    calls,
    async call(input) {
      calls.push({ text: input.text });
      const ids = [...input.text.matchAll(/^id: (\S+)/gm)].map((m) => m[1]);
      return { summary: "A quiet week.", whys: ids.map((id) => ({ id, why: why(id, input.text) })) };
    },
  };
  return caller;
}
const rowsOf = (db: ReturnType<typeof fakeReviewDb>) => db.focusDb.state.rows.map(({ id: _id, ...r }) => r);

describe("buildReview", () => {
  it("a 4-post, 0-win hook is stored as a skip ending 90 days out, and a 2-post hook is on neither list", async () => {
    const db = fakeReviewDb({ posts: world() });
    const r = await buildReview(db, scripted(), { now: MON });
    expect(r).toMatchObject({ status: 200, body: { ok: true, week_start: W1, url: `/content/review/${W1}`, skip: 1, double_down: 0, why: "ok" } });
    const skips = db.focusDb.state.rows.filter((x) => x.kind === "skip");
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ dimension: "hook_type", value: "promise", won: 0, lost: 4, total: 4, starts_on: "2026-11-16", ends_on: "2027-02-14", review_week: W1, source: "review" });
    expect(db.state.saved.get(W1)!.stop.map((e) => e.value)).toEqual(["promise"]);
  });

  it("Build now midweek returns the same lists as Monday's run", async () => {
    const monday = fakeReviewDb({ posts: world() });
    await buildReview(monday, scripted(), { now: MON });
    // Midweek the store also holds later snapshots and a post from Tuesday; as-of reads leave them out.
    const wednesday = fakeReviewDb({ posts: world([tuesdayPost()]) });
    await buildReview(wednesday, scripted(), { now: WED });
    const a = monday.state.saved.get(W1)!;
    const b = wednesday.state.saved.get(W1)!;
    expect(b.double_down).toEqual(a.double_down);
    expect(b.stop).toEqual(a.stop);
    expect(rowsOf(wednesday)).toEqual(rowsOf(monday));
    expect(b.review.line).toEqual(a.review.line);
    expect(b.review.worked.map((p) => p.id)).toEqual(a.review.worked.map((p) => p.id));
  });

  it("a rebuilt review does not move a running skip's dates", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    await buildReview(db, scripted(), { now: NEXT_MON, weekStart: W2 });
    await buildReview(db, scripted(), { now: NEXT_MON, weekStart: W2 });
    // Week 2 may add skips of its own (the week's lagging ranking Reel has aged into the lists); promise stays as week 1 made it.
    const promise = db.focusDb.state.rows.filter((x) => x.kind === "skip" && x.value === "promise");
    expect(promise).toHaveLength(1);
    expect(promise[0]).toMatchObject({ review_week: W1, starts_on: "2026-11-16", ends_on: "2027-02-14" });
    const second = db.focusDb.state.rows.filter((x) => x.review_week === W2);
    expect(second.map((x) => x.value)).toEqual(["ranking"]);
    expect(second[0]).toMatchObject({ starts_on: "2026-11-23", ends_on: "2027-02-21" });
  });

  it("fixing a tag and rebuilding withdraws the skip that came from it", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip")).toHaveLength(1);
    // Miguel corrects the four mis-tagged posts; promise no longer has the posts that made the skip.
    db.state.posts = db.state.posts.map((p) => (p.hook_type === "promise" ? ({ ...p, hook_type: "question" } as PostRowForView) : p));
    await buildReview(db, scripted(), { now: WED });
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip")).toEqual([]);
  });

  it("a review is a snapshot: rebuilding an older week does not change the newest double-downs", async () => {
    // Three paradox Reels posted in week 1 are too young to count at week 1's review day, and settled by week 2's.
    const paradox = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d, i) => reel(`x${i}`, at(d), 2000, { hook_type: "paradox", topic: "" }));
    const db = fakeReviewDb({ posts: world(paradox) });
    await buildReview(db, scripted(), { now: MON });
    expect(db.state.saved.get(W1)!.double_down).toEqual([]);
    await buildReview(db, scripted(), { now: NEXT_MON, weekStart: W2 });
    const open = () => db.focusDb.state.rows.filter((x) => x.kind === "double_down" && x.ends_on === null).map((x) => x.value);
    expect(open()).toEqual(["paradox"]);
    await buildReview(db, scripted(), { now: new Date("2026-11-24T14:00:00Z"), weekStart: W1 });
    expect(open()).toEqual(["paradox"]);
  });

  it("the why call failing still stores the review and the lists", async () => {
    const db = fakeReviewDb({ posts: world() });
    const down: ToolCaller = { async call() { throw new Error("api down"); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await buildReview(db, down, { now: MON });
    expect(r).toMatchObject({ status: 200, body: { why: "failed", skip: 1 } });
    const saved = db.state.saved.get(W1)!;
    expect(saved.narrative_md).toBe("");
    expect([...saved.review.worked, ...saved.review.didnt].map((p) => p.why)).toEqual(Array(saved.review.worked.length + saved.review.didnt.length).fill("No clear reason."));
    expect(saved.review.worked.length + saved.review.didnt.length).toBeGreaterThan(0);
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip")).toHaveLength(1);
  });

  it("no API key behaves the same", async () => {
    const db = fakeReviewDb({ posts: world() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await buildReview(db, null, { now: MON });
    expect(r).toMatchObject({ status: 200, body: { why: "failed" } });
    expect(db.state.saved.get(W1)!.review.why).toBe("failed");
  });

  it("an invalid why answer counts as a failed why call", async () => {
    const db = fakeReviewDb({ posts: world() });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bad: ToolCaller = { async call() { return { summary: "x", whys: [] }; } };
    expect(await buildReview(db, bad, { now: MON })).toMatchObject({ body: { why: "failed" } });
  });

  it("an ungrounded why is replaced with No clear reason.", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted((id) => (id === "w1" ? "A Question hook, the kind that usually holds." : "It just was not a good day.")), { now: MON });
    const review = db.state.saved.get(W1)!.review;
    expect(review.worked.find((p) => p.id === "w1")!.why).toBe("A Question hook, the kind that usually holds.");
    expect(review.didnt.find((p) => p.id === "w2")!.why).toBe("No clear reason.");
    expect(db.state.saved.get(W1)!.narrative_md).toBe("A quiet week.");
  });

  it("a week with no posts stores an empty review and makes no Claude call", async () => {
    const db = fakeReviewDb({ posts: world().filter((p) => !p.id.startsWith("w")) });
    const c = scripted();
    const r = await buildReview(db, c, { now: MON });
    expect(c.calls).toHaveLength(0);
    expect(r).toMatchObject({ status: 200, body: { why: "none", line: { posts: 0, beat: 0, far_below: 0 } } });
    expect(db.state.saved.get(W1)!.narrative_md).toBe("");
  });

  it("a week that has not finished is a 400, and so is a Tuesday", async () => {
    const db = fakeReviewDb({ posts: world() });
    expect(await buildReview(db, scripted(), { now: new Date("2026-11-15T12:00:00Z"), weekStart: W1 })).toEqual({ status: 400, body: { error: "week_not_finished" } });
    expect(await buildReview(db, scripted(), { now: MON, weekStart: "2026-11-10" })).toEqual({ status: 400, body: { error: "week_start must be a Monday" } });
    expect(db.state.saveCalls).toHaveLength(0);
  });

  it("the unused review columns are not written", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    expect(Object.keys(db.state.saveCalls[0]).sort()).toEqual(["built_at", "double_down", "narrative_md", "review", "stop", "week_start"]);
  });

  it("the review has the week's sections: worked, didn't, pillar spread and tiles", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    const r = db.state.saved.get(W1)!.review;
    expect(r.worked.map((p) => p.id)).toEqual(["w1"]);
    expect(r.worked[0].early).toBe(true);
    expect(r.didnt.map((p) => p.id)).toEqual(["w2"]);
    expect(r.line).toEqual({ posts: 2, beat: 1, far_below: 1 });
    expect(r.pillars.find((p) => p.pillar === "w2-advantage")!.posts).toBe(2);
    expect(r.tiles.views.total).toBeGreaterThan(0);
    expect(r.as_of).toBe("2026-11-16T06:00:00.000Z");
  });
});

describe("buildReview: review findings", () => {
  const untagged = (p: PostRowForView) => ({ ...p, tagged_at: null }) as unknown as PostRowForView;
  const promiseWorld = () => {
    const w = world().filter((p) => !p.id.startsWith("p"));
    const lagging = ["2026-10-13", "2026-10-14", "2026-10-15"].map((d, i) => reel(`pl${i}`, at(d), 100, { hook_type: "promise", topic: "" }));
    const hidden = ["2026-10-16", "2026-10-17", "2026-10-18"].map((d, i) => untagged(reel(`pu${i}`, at(d), 3000, { hook_type: "promise", topic: "" })));
    return [...w, ...lagging, ...hidden];
  };

  it("untagged eligible Reels hold new skips: a half-tagged sample never decides one", async () => {
    const db = fakeReviewDb({ posts: promiseWorld() });
    const r = await buildReview(db, scripted(), { now: MON });
    expect(r).toMatchObject({ status: 200, body: { skip: 0, untagged: 3 } });
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip")).toEqual([]);
    expect(db.state.saved.get(W1)!.review.untagged).toBe(3);
  });

  it("a skip a full sample already decided is left alone while posts are untagged", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip")).toHaveLength(1);
    db.state.posts = db.state.posts.map((p) => (p.id === "q0" || p.id === "q1" ? untagged(p) : p));
    const r = await buildReview(db, scripted(), { now: WED });
    expect(r).toMatchObject({ body: { untagged: 2 } });
    expect(db.focusDb.state.rows.filter((x) => x.kind === "skip" && x.value === "promise")).toHaveLength(1);
  });

  it("with every eligible Reel tagged the review reports none untagged", async () => {
    const db = fakeReviewDb({ posts: world() });
    await buildReview(db, scripted(), { now: MON });
    expect(db.state.saved.get(W1)!.review.untagged).toBe(0);
  });

  it("a build that fails before the review is saved leaves no skip rows behind", async () => {
    const db = fakeReviewDb({ posts: world() });
    db.followers = async () => { throw new Error("db down"); };
    await expect(buildReview(db, scripted(), { now: MON })).rejects.toThrow("db down");
    expect(db.focusDb.state.rows).toEqual([]);
    expect(db.state.saveCalls).toHaveLength(0);
  });

  it("the lists are applied after the review is saved", async () => {
    const db = fakeReviewDb({ posts: world() });
    const order: string[] = [];
    const save = db.save.bind(db);
    db.save = async (row) => { order.push("save"); return save(row); };
    const insert = db.focusDb.insert.bind(db.focusDb);
    db.focusDb.insert = async (rows) => { order.push("insert"); return insert(rows); };
    await buildReview(db, scripted(), { now: MON });
    expect(order).toEqual(["save", "insert"]);
  });
});
