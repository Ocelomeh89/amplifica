import { describe, expect, it, vi } from "vitest";
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
const sized = (username: string, followers: number): CandidateRow => candidate({ username, outcome: "sized", followers, own_followers: 8000, bio: "a bio" });

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

// ---- Task 8: judge, suggest, add and decline ----

import type { ToolCaller } from "./claude";
import type { Judgment } from "@/features/content/engine/discovery-judge";
import { addCreator } from "./competitors";
import { addSuggestion, advanceDiscovery, buildDiscoveryPage, declineSuggestion, judgeSampled, suggestFits } from "./discovery";

const CAPTIONS = ["I am 38 and behind on retirement", "Max out your 401k first", "Why the 4% rule broke for me", "A day in my W-2 life", "Quit the grind? Read this"];
const activeSample = (base = MONDAY) =>
  CAPTIONS.map((caption, i) => ({ shortcode: `s${i}`, url: `https://www.instagram.com/reel/s${i}/`, posted_at: daysAgo(i + 1, base), views: 100 * (i + 1), caption }));
const sampledRow = (username: string, followers = 16000, over: Partial<CandidateRow> = {}) =>
  candidate({ username, outcome: "sampled", followers, own_followers: 8000, bio: `${username} bio`, sample: activeSample(), ...over });
const judgment = (over: Partial<Judgment> = {}): Judgment => ({
  reader: "daniel",
  evidence: ["i am 38 and behind on retirement", "max out your 401k first"],
  reason: "The posts speak to a W-2 saver behind on retirement.",
  confidence: 4,
  matches_decline: null,
  ...over,
});
const callerOf = (answer: unknown | ((text: string) => unknown)) => {
  const call = vi.fn(async (input: { text: string }) => {
    const out = typeof answer === "function" ? (answer as (t: string) => unknown)(input.text) : answer;
    if (out instanceof Error) throw out;
    return out;
  });
  return { caller: { call } as unknown as ToolCaller, call };
};
const now = { now: MONDAY, timeLeft: () => 300 };
const settled = run({ id: "dr-done", kind: "gather", status: "ready", cost_usd: 0.1 });

describe("judging sampled candidates", () => {
  it("a candidate judged neither is not suggested, and a week with no fit suggests nobody", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: ["a", "b", "c"].map((u) => sampledRow(u)), runs: [settled] });
    const { caller } = callerOf(judgment({ reader: "neither", evidence: [], reason: "Posts are about crypto trading." }));
    const report = await advanceDiscovery(db, fakeApify().apify, caller, { ...now, force: false, own: OWN, trigger: "routine" });
    expect(state.creators).toEqual([]);
    expect(state.candidates.map((c) => c.outcome)).toEqual(["neither", "neither", "neither"]);
    expect(state.candidates.every((c) => c.reason !== "")).toBe(true);
    expect(report).toMatchObject({ suggested: 0, judged: 3 });
  });

  it("confidence under 3 is dropped; 3 is suggested", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("low", 16000), sampledRow("ok", 17000)] });
    let n = 0;
    const { caller } = callerOf(() => judgment({ confidence: ++n === 1 ? 2 : 3 }));
    await judgeSampled(db, caller, now);
    expect(state.candidates.map((c) => c.outcome)).toEqual(["low_confidence", "fit"]);
    expect((await suggestFits(db, MONDAY)).suggested).toBe(1);
    expect(state.creators.map((c) => c.username)).toEqual(["ok"]);
  });

  it("a fit carries its reader, quotes, confidence and popular Reel count", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a")] });
    await judgeSampled(db, callerOf(judgment()).caller, now);
    expect(state.candidates[0]).toMatchObject({ outcome: "fit", reader: "daniel", confidence: 4, evidence: judgment().evidence, popular_count: 0 });
  });

  it("a quiet account costs no Claude call", async () => {
    const few = activeSample().slice(0, 3);
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("slow", 16000, { sample: few })] });
    const { caller, call } = callerOf(judgment());
    await judgeSampled(db, caller, now);
    expect(call).not.toHaveBeenCalled();
    expect(state.candidates[0]).toMatchObject({ outcome: "quiet", reason: "3 Reels in the last 30 days; it takes 4" });
  });

  it("a stored decline reason appears in the next judgment's prompt", async () => {
    const { db } = fakeDiscoveryDb({ creators: [creatorRow({ username: "salesguy", status: "suggested", suggested_at: daysAgo(1) })], candidates: [sampledRow("next")] });
    expect(await declineSuggestion(db, "cr-salesguy", "too salesy", MONDAY)).toEqual({ error: null });
    const { caller, call } = callerOf(judgment());
    await judgeSampled(db, caller, now);
    const text = (call.mock.calls[0][0] as { text: string }).text;
    expect(text).toContain("Miguel declined these and said why");
    expect(text).toContain("salesguy");
    expect(text).toContain("too salesy");
  });

  it("only the last 20 decline reasons are sent", async () => {
    const declined = Array.from({ length: 25 }, (_, i) => ({ ...creatorRow({ username: `d${String(i).padStart(2, "0")}`, status: "declined" }), decline_reason: "r", decided_at: daysAgo(30 - i) }));
    const { db, state } = fakeDiscoveryDb({ creators: declined, candidates: [sampledRow("next")] });
    const { caller, call } = callerOf(judgment());
    await judgeSampled(db, caller, now);
    expect(state.declineCalls).toEqual([20]);
    const text = (call.mock.calls[0][0] as { text: string }).text;
    expect(text).toContain("d24");
    expect(text).toContain("d05");
    expect(text).not.toContain("d04");
  });

  it("a candidate matching a decline reason is dropped and says so", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a")] });
    await judgeSampled(db, callerOf(judgment({ reader: "neither", evidence: [], matches_decline: "too salesy" })).caller, now);
    expect(state.candidates[0]).toMatchObject({ outcome: "matched_decline", reason: "Matches a reason you gave: too salesy" });
  });

  it("invented quotes are retried once, then the candidate is unreadable", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a")] });
    const { caller, call } = callerOf(judgment({ evidence: ["a line nobody wrote", "another invented line"] }));
    await judgeSampled(db, caller, now);
    expect(state.candidates[0]).toMatchObject({ outcome: "sampled", attempts: 1 });
    await judgeSampled(db, caller, now);
    expect(call).toHaveBeenCalledTimes(2);
    expect(state.candidates[0]).toMatchObject({ outcome: "unreadable", reason: "The judge gave no usable answer" });
  });

  it("an invalid answer counts as an attempt", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a"), sampledRow("b", 17000)] });
    await judgeSampled(db, callerOf({ nonsense: true }).caller, now);
    expect(state.candidates.map((c) => c.attempts)).toEqual([1, 1]);
  });

  it("a thrown Claude call (an outage, a bad key) costs no attempt and stops judging for this call", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a"), sampledRow("b", 17000)] });
    const { caller, call } = callerOf(new Error("overloaded"));
    await judgeSampled(db, caller, now);
    await judgeSampled(db, caller, now);
    expect(call).toHaveBeenCalledTimes(2);
    expect(state.candidates.map((c) => [c.outcome, c.attempts])).toEqual([["sampled", 0], ["sampled", 0]]);
  });

  it("judging stops when time runs short and resumes on the next call", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a", 16000), sampledRow("b", 17000)], runs: [settled] });
    const { caller } = callerOf(judgment());
    const times = [300, 50];
    const first = await advanceDiscovery(db, fakeApify().apify, caller, { now: MONDAY, force: false, own: OWN, trigger: "routine", timeLeft: () => times.shift() ?? 50 });
    expect(first).toMatchObject({ stage: "judging", judged: 1, suggested: 0 });
    expect(state.candidates.map((c) => c.outcome)).toEqual(["fit", "sampled"]);
    const second = await advanceDiscovery(db, fakeApify().apify, caller, { now: MONDAY, force: false, own: OWN, trigger: "routine", timeLeft: () => 300 });
    expect(second).toMatchObject({ stage: "done", suggested: 2 });
    expect(state.creators.map((c) => c.status)).toEqual(["suggested", "suggested"]);
  });

  it("the cron call (no caller) never judges or suggests", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [sampledRow("a")], runs: [settled] });
    const report = await advanceDiscovery(db, fakeApify().apify, null, { ...now, force: false, own: OWN, trigger: "cron" });
    expect(state.candidates[0].outcome).toBe("sampled");
    expect(report.stage).toBe("judging");
    expect(state.calls).toEqual([expect.objectContaining({ trigger: "cron" })]);
  });
});

describe("suggesting fits", () => {
  const fit = (username: string, confidence: number, popular_count = 0): CandidateRow => candidate({ username, outcome: "fit", reader: "daniel", confidence, popular_count, followers: 16000, own_followers: 8000 });

  it("with 2 waiting it suggests at most 1; the rest are no_room", async () => {
    const waiting = ["w1", "w2"].map((u) => creatorRow({ username: u, status: "suggested", suggested_at: daysAgo(1) }));
    const { db, state } = fakeDiscoveryDb({ creators: waiting, candidates: [fit("a", 3), fit("b", 5), fit("c", 4)] });
    expect(await suggestFits(db, MONDAY)).toEqual({ suggested: 1, dropped: 2 });
    expect(state.creators.filter((c) => c.status === "suggested").map((c) => c.username)).toEqual(["w1", "w2", "b"]);
    expect(state.candidates.map((c) => c.outcome)).toEqual(["no_room", "suggested", "no_room"]);
    expect(state.candidates[0].reason).toBe("Passed, but ranked below this week's suggestions");
  });

  it("suggestions are ranked by confidence, then by popular Reels", async () => {
    const seed = () => [fit("a", 4, 0), fit("b", 5, 0), fit("c", 4, 2)];
    const one = fakeDiscoveryDb({ creators: ["x", "y"].map((u) => creatorRow({ username: u, status: "suggested", suggested_at: daysAgo(1) })), candidates: seed() });
    await suggestFits(one.db, MONDAY);
    expect(one.state.creators.filter((c) => c.status === "suggested").map((c) => c.username)).toEqual(["x", "y", "b"]);
    const two = fakeDiscoveryDb({ creators: [creatorRow({ username: "x", status: "suggested", suggested_at: daysAgo(1) })], candidates: seed() });
    await suggestFits(two.db, MONDAY);
    expect(two.state.creators.filter((c) => c.status === "suggested").map((c) => c.username)).toEqual(["x", "b", "c"]);
  });

  it("waits while a candidate is still to be judged or a sample run is pending", async () => {
    const waiting = fakeDiscoveryDb({ candidates: [fit("a", 4), sampledRow("b")] });
    expect(await suggestFits(waiting.db, MONDAY)).toEqual({ suggested: 0, dropped: 0 });
    const pending = fakeDiscoveryDb({ candidates: [fit("a", 4)], runs: [run({ kind: "sample", status: "pending" })] });
    expect(await suggestFits(pending.db, MONDAY)).toEqual({ suggested: 0, dropped: 0 });
  });

  it("a creator hand-added mid-pipeline is never suggested", async () => {
    const { db, state } = fakeDiscoveryDb({ creators: [creatorRow({ username: "a", status: "watching" })], candidates: [fit("a", 5)] });
    expect(await suggestFits(db, MONDAY)).toEqual({ suggested: 0, dropped: 1 });
    expect(state.creators).toHaveLength(1);
    expect(state.creators[0].status).toBe("watching");
    expect(state.candidates[0].outcome).toBe("no_room");
  });
});

describe("adding and declining", () => {
  const waiting = (over = {}) => creatorRow({ username: "sug", status: "suggested", suggested_at: daysAgo(1), ...over });

  it("a decline without a reason is refused", async () => {
    const { db, state } = fakeDiscoveryDb({ creators: [waiting()] });
    for (const reason of ["", "   "]) expect(await declineSuggestion(db, "cr-sug", reason, MONDAY)).toEqual({ error: "Say why, so later suggestions improve." });
    expect(state.creators[0].status).toBe("suggested");
    expect(await declineSuggestion(db, "cr-sug", "x".repeat(300), MONDAY)).toEqual({ error: null });
    expect((state.creators[0] as { decline_reason: string }).decline_reason).toHaveLength(200);
    expect(state.creators[0].status).toBe("declined");
  });

  it("add moves the creator to watching and the next Monday run pulls 90 days for them", async () => {
    const { db, state } = fakeDiscoveryDb({ creators: [waiting()] });
    expect(await addSuggestion(db, "cr-sug", MONDAY)).toEqual({ error: null });
    expect(state.creators[0].status).toBe("watching");
    const comp = fakeCompetitorsDb({
      creators: [
        { id: "cr-sug", username: "sug", status: "watching", last_pulled_at: null, last_pull_status: null },
        { id: "c2", username: "old", status: "watching", last_pulled_at: daysAgo(7), last_pull_status: "ready" },
      ],
    });
    const f = fakeApify();
    await startWeeklyPull(comp.db, f.apify, MONDAY, true);
    expect(f.started[0].newerThanDays).toBe(90);
    expect(f.started[0].usernames).toContain("sug");
  });

  it("a declined creator is never suggested again, and a hand-add overrides the decline", async () => {
    const declined = creatorRow({ username: "nope", status: "declined" });
    const { db, state } = fakeDiscoveryDb({ creators: [declined], runs: [run()] });
    await collectDiscoveryRuns(db, fakeApify({ a1: done([found("nope", 16000)]) }).apify, { now: MONDAY, own: OWN });
    expect(state.candidates).toEqual([]);
    const comp = fakeCompetitorsDb({ creators: [{ id: "cr-nope", username: "nope", status: "declined" as never, last_pulled_at: null, last_pull_status: null }] });
    expect(await addCreator(comp.db, "nope")).toEqual({ error: null });
    expect(comp.state.creators[0].status).toBe("watching");
  });

  it("a second click finds the suggestion gone, also after it lapsed", async () => {
    const { db } = fakeDiscoveryDb({ creators: [waiting()] });
    expect(await addSuggestion(db, "cr-sug", MONDAY)).toEqual({ error: null });
    expect(await addSuggestion(db, "cr-sug", MONDAY)).toEqual({ error: "That suggestion is gone." });
    expect(await declineSuggestion(db, "cr-sug", "wrong audience", MONDAY)).toEqual({ error: "That suggestion is gone." });
    const lapsed = fakeDiscoveryDb({ creators: [waiting({ suggested_at: daysAgo(40) })], candidates: [candidate({ username: "sug", outcome: "suggested" })] });
    await lapseStale(lapsed.db, MONDAY);
    expect(await addSuggestion(lapsed.db, "cr-sug", MONDAY)).toEqual({ error: "That suggestion is gone." });
  });
});

// ---- Task 10: the page ----

describe("buildDiscoveryPage", () => {
  const dropped = (username: string, daysOld: number, outcome: CandidateRow["outcome"] = "neither") => candidate({ username, outcome, reason: `why ${username}`, looked_at: daysAgo(daysOld) });
  const page = (creators: ReturnType<typeof creatorRow>[], candidates: CandidateRow[], over: Partial<Parameters<typeof buildDiscoveryPage>[0]> = {}) =>
    buildDiscoveryPage({ creators, candidates, lastCall: null, buttonCallsToday: 0, ...over });

  it("a dropped candidate shows in Considered and dropped, newest first, with its reason", () => {
    const out = page([], [dropped("older", 20), dropped("newest", 1, "out_of_band"), dropped("middle", 10, "no_room"), candidate({ username: "inflight", outcome: "sampled" })]);
    expect(out.dropped.map((d) => d.username)).toEqual(["newest", "middle", "older"]);
    expect(out.dropped[0]).toEqual({ username: "newest", outcome: "out_of_band", reason: "why newest", lookedAt: daysAgo(1) });
  });

  it("a dropped candidate Miguel added by hand leaves the list; the list stops at 50", () => {
    const out = page([creatorRow({ username: "mine", status: "watching" })], [dropped("mine", 1), ...Array.from({ length: 60 }, (_, i) => dropped(`c${i}`, i + 2))]);
    expect(out.dropped.find((d) => d.username === "mine")).toBeUndefined();
    expect(out.dropped).toHaveLength(50);
  });

  it("a card carries the follower line, the reader, the reason, the quotes and how it was found", () => {
    const fit = candidate({ username: "sug", outcome: "suggested", reader: "stephen", reason: "Posts name an owner with money tied up in the business.", evidence: ["line one", "line two"], followers: 48000, own_followers: 8000, found_via: "search: private lending", sample: [] });
    const out = page([creatorRow({ username: "sug", status: "suggested", suggested_at: daysAgo(1) })], [fit]);
    expect(out.suggestions).toEqual([
      { creatorId: "cr-sug", username: "sug", followersLine: "48k followers, 6x yours", reader: "stephen", reason: fit.reason, evidence: ["line one", "line two"], best: [], foundVia: "search: private lending" },
    ]);
  });

  it("best Reels appear only at 1.5x or more", () => {
    const flat = Array.from({ length: 5 }, (_, i) => ({ shortcode: `f${i}`, url: `u${i}`, posted_at: daysAgo(i + 1), views: i === 4 ? 140 : 100, caption: "" }));
    const topped = [...flat, { shortcode: "t", url: "https://www.instagram.com/reel/t/", posted_at: daysAgo(3), views: 420, caption: "" }];
    const make = (sample: typeof flat) => page([creatorRow({ username: "sug", status: "suggested", suggested_at: daysAgo(1) })], [candidate({ username: "sug", outcome: "suggested", reader: "daniel", followers: 16000, own_followers: 8000, sample })]);
    expect(make(flat).suggestions[0].best).toEqual([]);
    expect(make(topped).suggestions[0].best).toEqual([{ url: "https://www.instagram.com/reel/t/", multiple: 4.2 }]);
  });

  it("suggestions are oldest first; the button count, the last note and the left-today number come through", () => {
    const creators = [creatorRow({ username: "b", status: "suggested", suggested_at: daysAgo(1) }), creatorRow({ username: "a", status: "suggested", suggested_at: daysAgo(5) })];
    const cands = ["a", "b"].map((u) => candidate({ username: u, outcome: "suggested", reader: "daniel", followers: 16000, own_followers: 8000 }));
    const out = page(creators, cands, { lastCall: { note: "Looked at 14 accounts, suggested 2.", at: daysAgo(0) }, buttonCallsToday: 2 });
    expect(out.suggestions.map((s) => s.username)).toEqual(["a", "b"]);
    expect(out.lastNote).toEqual({ note: "Looked at 14 accounts, suggested 2.", at: daysAgo(0) });
    expect(out.findLeftToday).toBe(1);
    expect(page([], [], { buttonCallsToday: 5 }).findLeftToday).toBe(0);
  });
});

// ---- Review fixes ----

describe("review fixes", () => {
  it("two starts racing for the same run start it once", async () => {
    const { db, state } = fakeDiscoveryDb();
    const f = fakeApify();
    const [a, b] = await Promise.all([startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN }), startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN })]);
    expect(f.actors).toHaveLength(3);
    expect(state.runs).toHaveLength(3);
    expect([a.started, b.started].filter(Boolean)).toEqual(["gather"]);
    expect(state.runs.every((r) => r.apify_run_id !== "")).toBe(true);
  });

  it("a start that fails after claiming its row marks the row failed", async () => {
    const { db, state } = fakeDiscoveryDb();
    const apify = { ...fakeApify().apify, startActor: async () => { throw new Error("quota"); } };
    await startNextRun(db, apify, { now: MONDAY, force: false, own: OWN });
    expect(state.runs.every((r) => r.status === "failed" && /quota/.test(r.error))).toBe(true);
  });

  it("a claimed run that never got an Apify id is failed after 15 minutes, not read", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [run({ apify_run_id: "" })] });
    const out = await collectDiscoveryRuns(db, fakeApify().apify, { now: new Date(MONDAY.getTime() + 16 * 60_000), own: OWN });
    expect(state.runs[0]).toMatchObject({ status: "failed", error: "never started" });
    expect(out.errors).toEqual([]);
  });

  it("gathered rows are sized as soon as Miguel's count is known, even when no run is pending", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered", followers: 16000 }), candidate({ username: "y", outcome: "gathered", followers: 900000 })] });
    await collectDiscoveryRuns(db, fakeApify().apify, { now: MONDAY, own: OWN });
    expect(state.candidates.map((c) => c.outcome)).toEqual(["sized", "out_of_band"]);
  });

  it("a size run with nobody to read falls through to the next run instead of blocking", async () => {
    const { db } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered", followers: 16000 })] });
    const f = fakeApify();
    const out = await startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN });
    expect(out.started).toBe("gather");
  });

  it("a run that keeps failing to read is failed after 48 hours", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [run({ kind: "sample", usernames: ["keep"] })], candidates: [sized("keep", 16000)] });
    const later = new Date(MONDAY.getTime() + 49 * 3_600_000);
    await collectDiscoveryRuns(db, fakeApify({}).apify, { now: later, own: OWN });
    expect(state.runs[0].status).toBe("failed");
    expect(state.runs[0].error).toMatch(/^timed out/);
    expect(state.candidates[0].outcome).toBe("sized");
  });

  it("a failed size run does not turn unread candidates unreadable", async () => {
    const { db, state } = fakeDiscoveryDb({ candidates: [candidate({ username: "x", outcome: "gathered", followers: null })], runs: [run({ kind: "size", usernames: ["x"] })] });
    await collectDiscoveryRuns(db, fakeApify({ a1: { status: "failed", datasetId: null, costUsd: null, error: "FAILED" } }).apify, { now: MONDAY, own: OWN });
    expect(state.candidates[0].outcome).toBe("gathered");
  });

  it("candidates with no bio are profiled before they are sampled, and keep their outcome", async () => {
    const nobio = candidate({ username: "nb", outcome: "sized", followers: 16000, own_followers: 8000, bio: "" });
    const { db, state } = fakeDiscoveryDb({ candidates: [nobio, sized("hasbio", 17000)] });
    const f = fakeApify();
    expect((await startNextRun(db, f.apify, { now: MONDAY, force: false, own: OWN })).started).toBe("size");
    expect(f.actors[0].actorId).toBe(PROFILE_ACTOR);
    expect(f.actors[0].body.usernames).toEqual(["nb"]);
    const g = fakeApify({ "apify-1": done([{ username: "nb", followersCount: 16000, biography: "Helping Gen Z invest" }]) });
    await collectDiscoveryRuns(db, g.apify, { now: MONDAY, own: OWN });
    expect(state.candidates[0]).toMatchObject({ outcome: "sized", bio: "Helping Gen Z invest" });
    const h = fakeApify();
    expect((await startNextRun(db, h.apify, { now: MONDAY, force: false, own: OWN })).started).toBe("sample");
    expect(h.actors[0].body.username).toEqual(["nb", "hasbio"]);
  });

  it("no log is written when the caller says the click already logged the call", async () => {
    const { db, state } = fakeDiscoveryDb({ runs: [settled] });
    await advanceDiscovery(db, fakeApify().apify, null, { ...now, force: false, own: OWN, trigger: "button", logAs: null });
    expect(state.calls).toEqual([]);
    await advanceDiscovery(db, fakeApify().apify, null, { ...now, force: false, own: OWN, trigger: "button", logAs: "routine" });
    expect(state.calls).toEqual([expect.objectContaining({ trigger: "routine" })]);
  });
});
