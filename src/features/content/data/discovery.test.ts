import { describe, expect, it } from "vitest";
import { OWN_INSTAGRAM_USERNAME } from "@/features/content/engine/discovery";
import { PROFILE_ACTOR, SEARCH_ACTOR, SEARCH_PHRASES } from "@/features/content/engine/discovery-items";
import { fakeApify, fakeCompetitorsDb } from "./competitors.fake";
import { startWeeklyPull } from "./competitors";
import { collectDiscoveryRuns, lapseStale, startNextRun, type CandidateRow, type DiscoveryRunRow } from "./discovery";
import { candidate, creatorRow, fakeDiscoveryDb } from "./discovery.fake";

const MONDAY = new Date("2026-11-16T12:00:00Z");
const TUESDAY = new Date("2026-11-17T12:00:00Z");
const WEEK = "2026-11-16";
const OWN = { followers: 8000, day: "2026-11-15" };
const daysAgo = (n: number, from = MONDAY) => new Date(from.getTime() - n * 86_400_000).toISOString();

const run = (over: Partial<DiscoveryRunRow> = {}): DiscoveryRunRow => ({
  id: "dr-1",
  week_start: WEEK,
  kind: "gather",
  apify_run_id: "a1",
  usernames: ["financial freedom"],
  status: "pending",
  error: "",
  cap_usd: 0.3,
  cost_usd: null,
  own_followers: null,
  items: null,
  started_at: MONDAY.toISOString(),
  finished_at: null,
  ...over,
});
const done = (items: unknown[], costUsd = 0.02) => ({ status: "ready" as const, datasetId: "ds1", costUsd, error: "", items });
const found = (username: string, followersCount: number | null, over: Record<string, unknown> = {}) => ({ username, followersCount, private: false, ...over });
const reelItem = (owner: string, n: number, base = MONDAY) => ({
  shortCode: `${owner}-${n}`,
  ownerUsername: owner,
  type: "Video",
  productType: "clips",
  videoViewCount: 100 * (n + 1),
  timestamp: daysAgo(n + 1, base),
  caption: `caption ${n}`,
});
const sized = (username: string, followers: number): CandidateRow => candidate({ username, outcome: "sized", followers, own_followers: 8000 });

describe("collecting discovery runs", () => {
  it("a candidate at 1.5x or 25x is dropped with its reason; 2x and 20x pass size", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [run()] });
    const { apify } = fakeApify({ a1: done([found("low", 12000), found("two", 16000), found("twenty", 160000), found("high", 200000)]) });
    await collectDiscoveryRuns(db, apify, { now: MONDAY, own: OWN });
    const byName = Object.fromEntries(state.candidates.map((c) => [c.username, c]));
    expect(Object.fromEntries(Object.entries(byName).map(([k, c]) => [k, c.outcome]))).toEqual({ low: "out_of_band", two: "sized", twenty: "sized", high: "out_of_band" });
    expect(byName.low.reason).toBe("12k followers is 1.5x yours; the band is 2x to 20x");
    expect(byName.high.reason).not.toBe("");
    expect(byName.low.looked_at).toBe(MONDAY.toISOString());
    expect(byName.two.found_via).toBe("search: financial freedom");
    expect(state.runs[0]).toMatchObject({ status: "ready", cost_usd: 0.02, items: 4 });
  });

  it("a creator in any status in content_creators is never gathered", async () => {
    const creators = (["watching", "removed", "suggested", "declined"] as const).map((status) => creatorRow({ username: `u-${status}`, status }));
    const { db, state } = fakeDiscoveryDb({ creators, runs: [run()] });
    const { apify } = fakeApify({ a1: done(creators.map((c) => found(c.username, 16000))) });
    await collectDiscoveryRuns(db, apify, { now: MONDAY, own: OWN });
    expect(state.candidates).toEqual([]);
  });

  it("Miguel's own account is never a candidate", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [run()] });
    const { apify } = fakeApify({ a1: done([found(OWN_INSTAGRAM_USERNAME, 16000)]) });
    await collectDiscoveryRuns(db, apify, { now: MONDAY, own: OWN });
    expect(state.candidates).toEqual([]);
  });

  it("a dropped candidate is not re-read within 90 days; at 91 days it is gathered again", async () => {
    const recent = candidate({ username: "dropped", outcome: "neither", reason: "x", looked_at: daysAgo(30) });
    const { db, state } = fakeDiscoveryDb({ candidates: [recent, sized("other", 16000)], runs: [run()] });
    const before = { ...recent };
    const { apify } = fakeApify({ a1: done([found("dropped", 16000)]) });
    await collectDiscoveryRuns(db, apify, { now: MONDAY, own: OWN });
    expect(state.candidates.find((c) => c.username === "dropped")).toEqual(before);
    const f = fakeApify();
    await startNextRun(db, f.apify, { now: TUESDAY, force: false, own: OWN });
    expect(f.actors[0].body.username).toEqual(["other"]);

    const old = fakeDiscoveryDb({ candidates: [candidate({ username: "dropped", outcome: "neither", reason: "x", looked_at: daysAgo(91) })], runs: [run()] });
    await collectDiscoveryRuns(old.db, fakeApify({ a1: done([found("dropped", 16000)]) }).apify, { now: MONDAY, own: null });
    expect(old.state.candidates[0]).toMatchObject({ username: "dropped", outcome: "gathered", reason: "" });
  });

  it("a private search result is unreadable, not sampled", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [run()] });
    await collectDiscoveryRuns(db, fakeApify({ a1: done([found("hidden", 16000, { private: true })]) }).apify, { now: MONDAY, own: OWN });
    expect(state.candidates[0]).toMatchObject({ outcome: "unreadable", reason: "Private account" });
  });

  it("with no follower count anywhere, nothing is sized and the note says why", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered" })], runs: [run({ kind: "size", usernames: [OWN_INSTAGRAM_USERNAME, "x"] })] });
    const apify = fakeApify({ a1: done([{ username: "x", followersCount: 16000, biography: "bio", private: false }]) }).apify;
    const out = await collectDiscoveryRuns(db, apify, { now: MONDAY, own: null });
    expect(state.candidates[0]).toMatchObject({ outcome: "gathered", followers: 16000, bio: "bio" });
    expect(out.note).toBe("Discovery did not run: your follower count could not be read.");
  });

  it("a size run reads Miguel's own count, then sizes", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered" }), candidate({ username: "gone", outcome: "gathered" })], runs: [run({ kind: "size", usernames: [OWN_INSTAGRAM_USERNAME, "x", "gone"] })] });
    const apify = fakeApify({ a1: done([{ username: OWN_INSTAGRAM_USERNAME, followersCount: 8000 }, { username: "x", followersCount: 16000, biography: "bio" }]) }).apify;
    const out = await collectDiscoveryRuns(db, apify, { now: MONDAY, own: null });
    expect(state.runs[0].own_followers).toBe(8000);
    expect(state.candidates.find((c) => c.username === "x")).toMatchObject({ outcome: "sized", own_followers: 8000 });
    expect(state.candidates.find((c) => c.username === "gone")).toMatchObject({ outcome: "unreadable", reason: "No follower count (private or gone)" });
    expect(out.note).toBeNull();
  });

  it("a private profile is unreadable and a creator with no Reels is quiet", async () => {
    const priv = fakeDiscoveryDb({ candidates: [candidate({ username: "priv", outcome: "gathered" })], runs: [run({ kind: "size", usernames: ["priv"] })] });
    await collectDiscoveryRuns(priv.db, fakeApify({ a1: done([{ username: "priv", followersCount: 16000, private: true }]) }).apify, { now: MONDAY, own: OWN });
    expect(priv.state.candidates[0]).toMatchObject({ outcome: "unreadable", reason: "Private account" });

    const sampled = fakeDiscoveryDb({ candidates: [sized("busy", 16000), sized("quietone", 20000)], runs: [run({ kind: "sample", usernames: ["busy", "quietone"] })] });
    await collectDiscoveryRuns(sampled.db, fakeApify({ a1: done([reelItem("busy", 0), reelItem("busy", 1), { shortCode: "p", ownerUsername: "quietone", type: "Image", timestamp: daysAgo(1) }]) }).apify, { now: MONDAY, own: OWN });
    const [busy, quiet] = sampled.state.candidates;
    expect(busy).toMatchObject({ outcome: "sampled" });
    expect(busy.sample).toHaveLength(2);
    expect(quiet).toMatchObject({ outcome: "quiet", reason: "No Reels found" });
  });

  it("a failed or stale run fails cleanly; a read error leaves it pending", async () => {
    const pre = [sized("keep", 16000)];
    const failed = fakeDiscoveryDb({ candidates: pre, runs: [run({ kind: "sample", usernames: ["keep"] })] });
    await collectDiscoveryRuns(failed.db, fakeApify({ a1: { status: "failed", datasetId: null, costUsd: null, error: "FAILED: x" } }).apify, { now: MONDAY, own: OWN });
    expect(failed.state.runs[0]).toMatchObject({ status: "failed", error: "FAILED: x", cost_usd: null });
    expect(failed.state.candidates[0].outcome).toBe("sized");

    const stale = fakeDiscoveryDb({ candidates: pre, runs: [run({ kind: "sample", usernames: ["keep"] })] });
    await collectDiscoveryRuns(stale.db, fakeApify({ a1: { status: "pending", datasetId: null, costUsd: null, error: "" } }).apify, { now: new Date(new Date(stale.state.runs[0].started_at).getTime() + 49 * 3_600_000), own: OWN });
    expect(stale.state.runs[0]).toMatchObject({ status: "failed", error: "timed out" });

    const broken = fakeDiscoveryDb({ candidates: pre, runs: [run()] });
    const out = await collectDiscoveryRuns(broken.db, fakeApify({}).apify, { now: MONDAY, own: OWN });
    expect(broken.state.runs[0].status).toBe("pending");
    expect(out.errors[0]).toMatch(/no run a1/);
    expect(broken.state.candidates[0].outcome).toBe("sized");
  });
});

describe("starting discovery runs", () => {
  it("with 3 suggestions waiting, no Apify run starts", async () => {
    const creators = ["a", "b", "c"].map((u) => creatorRow({ username: u, status: "suggested", suggested_at: daysAgo(1) }));
    for (const [now, force] of [[MONDAY, false], [MONDAY, true]] as const) {
      const { db } = fakeDiscoveryDb({ creators, candidates: [sized("z", 16000)] });
      const f = fakeApify();
      const out = await startNextRun(db, f.apify, { now, force, own: OWN });
      expect(f.actors).toEqual([]);
      expect(f.started).toEqual([]);
      expect(out).toEqual({ started: null, note: "Three suggestions are waiting, so nothing was searched." });
    }
  });

  it("each run is capped at what is left of the week's dollar", async () => {
    const spent = run({ id: "dr-0", kind: "gather", status: "ready", cap_usd: 0.3, cost_usd: 0.3 });
    const { db, state } = fakeDiscoveryDb({ candidates: [sized("z", 16000)], runs: [spent] });
    const f = fakeApify();
    await startNextRun(db, f.apify, { now: TUESDAY, force: false, own: OWN });
    expect(f.actors[0].maxTotalChargeUsd).toBeCloseTo(0.7);
    expect(state.runs.at(-1)).toMatchObject({ kind: "sample", status: "pending" });
    expect(state.runs.at(-1)!.cap_usd).toBeCloseTo(0.7);

    const broke = fakeDiscoveryDb({ candidates: [sized("z", 16000)], runs: [{ ...spent, cost_usd: 0.97 }] });
    const g = fakeApify();
    const out = await startNextRun(broke.db, g.apify, { now: TUESDAY, force: false, own: OWN });
    expect(g.actors).toEqual([]);
    expect(out.started).toBeNull();
  });

  it("a gather splits the week's dollar across the search phrases", async () => {
    const { db, state } = fakeDiscoveryDb();
    const f = fakeApify();
    const out = await startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN });
    expect(out.started).toBe("gather");
    expect(f.actors.map((a) => a.actorId)).toEqual([SEARCH_ACTOR, SEARCH_ACTOR, SEARCH_ACTOR]);
    expect(f.actors.map((a) => a.body.search)).toEqual([...SEARCH_PHRASES]);
    for (const a of f.actors) expect(a.maxTotalChargeUsd).toBeCloseTo(0.33);
    expect(state.runs.map((r) => r.usernames[0])).toEqual([...SEARCH_PHRASES]);
  });

  it("discovery spend is separate from the competitor pull", async () => {
    const comp = fakeCompetitorsDb({
      creators: [{ id: "c1", username: "micro.investing", status: "watching", last_pulled_at: null, last_pull_status: null }],
      runs: [{ id: "r1", apify_run_id: "x", status: "ready", error: "", started_at: daysAgo(1), finished_at: daysAgo(1), cost_usd: 0.9, items: 1, usernames: ["micro.investing"] }],
    });
    // The pull's $0.90 does not shrink discovery's dollar.
    const fresh = fakeDiscoveryDb();
    const f = fakeApify();
    await startNextRun(fresh.db, f.apify, { now: MONDAY, force: true, own: OWN });
    expect(f.actors.reduce((sum, a) => sum + a.maxTotalChargeUsd, 0)).toBeGreaterThan(0.95);
    // A pending discovery run blocks discovery, and does not block the weekly pull.
    const busy = fakeDiscoveryDb({ runs: [run()] });
    expect((await startNextRun(busy.db, fakeApify().apify, { now: MONDAY, force: true, own: OWN })).started).toBeNull();
    const weekly = fakeApify();
    await startWeeklyPull(comp.db, weekly.apify, MONDAY, true);
    expect(weekly.started).toHaveLength(1);
  });

  it("a gather starts only on Monday unless forced; follow-up runs start any day", async () => {
    const empty = fakeDiscoveryDb();
    const a = fakeApify();
    expect((await startNextRun(empty.db, a.apify, { now: TUESDAY, force: false, own: OWN })).started).toBeNull();
    expect((await startNextRun(empty.db, a.apify, { now: TUESDAY, force: true, own: OWN })).started).toBe("gather");
    const follow = fakeDiscoveryDb({ candidates: [sized("z", 16000)] });
    expect((await startNextRun(follow.db, fakeApify().apify, { now: TUESDAY, force: false, own: OWN })).started).toBe("sample");
  });

  it("at most 10 candidates are sampled, smallest first", async () => {
    const { db } = fakeDiscoveryDb({ candidates: Array.from({ length: 14 }, (_, i) => sized(`c${String(i).padStart(2, "0")}`, 30000 - i * 1000)) });
    const f = fakeApify();
    await startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN });
    const names = f.actors[0].body.username as string[];
    expect(names).toHaveLength(10);
    expect(names[0]).toBe("c13");
    expect(new Set(names)).toEqual(new Set(Array.from({ length: 10 }, (_, i) => `c${String(13 - i).padStart(2, "0")}`)));
    expect(f.actors[0].body.resultsLimit).toBe(12);
  });

  it("a stored count older than 14 days adds Miguel's own profile to the run", async () => {
    const gathered = () => fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered", followers: null })] });
    const stale = fakeApify();
    await startNextRun(gathered().db, stale.apify, { now: MONDAY, force: false, own: { followers: 8000, day: "2026-11-01" } });
    expect(stale.actors[0].actorId).toBe(PROFILE_ACTOR);
    expect(stale.actors[0].body.usernames).toEqual([OWN_INSTAGRAM_USERNAME, "x"]);
    const fresh = fakeApify();
    await startNextRun(gathered().db, fresh.apify, { now: MONDAY, force: false, own: { followers: 8000, day: "2026-11-02" } });
    expect(fresh.actors[0].body.usernames).toEqual(["x"]);
  });

  it("with candidates sized by the search and no count for Miguel, a size run still reads his profile", async () => {
    const { db } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered", followers: 16000 })] });
    const f = fakeApify();
    expect((await startNextRun(db, f.apify, { now: MONDAY, force: false, own: null })).started).toBe("size");
    expect(f.actors[0].body.usernames).toEqual([OWN_INSTAGRAM_USERNAME]);
  });

  it("an Apify error on start is a note, not a throw", async () => {
    const { db } = fakeDiscoveryDb();
    const apify = { ...fakeApify().apify, startActor: async () => { throw new Error("quota"); } };
    const out = await startNextRun(db, apify, { now: MONDAY, force: false, own: OWN });
    expect(out.started).toBeNull();
    expect(out.note).toMatch(/quota/);
  });
});

describe("lapsing", () => {
  it("a suggestion unanswered for 4 weeks lapses", async () => {
    const waiting = (days: number) => [creatorRow({ username: "old", status: "suggested", suggested_at: daysAgo(days) })];
    const lapsed = fakeDiscoveryDb({ creators: waiting(29), candidates: [candidate({ username: "old", outcome: "suggested" })] });
    expect(await lapseStale(lapsed.db, MONDAY)).toBe(1);
    expect(lapsed.state.creators).toEqual([]);
    expect(lapsed.state.candidates[0]).toMatchObject({ outcome: "lapsed", reason: "Not answered in 4 weeks" });
    const kept = fakeDiscoveryDb({ creators: waiting(28), candidates: [candidate({ username: "old", outcome: "suggested" })] });
    expect(await lapseStale(kept.db, MONDAY)).toBe(0);
    expect(kept.state.creators).toHaveLength(1);
  });
});
