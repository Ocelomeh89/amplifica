import { describe, expect, it } from "vitest";
import { statusOf, type PostScore, type Status } from "./baseline";
import type { NormalizedPost } from "./normalize";
import {
  NO_REASON,
  WHY_TOOL_NAME,
  accountTiles,
  asOfFor,
  gateWeek,
  groundedWhy,
  isWeekStart,
  pillarSpread,
  postTitle,
  renderWhyTurn,
  reviewWeekFor,
  summaryLine,
  weekGain,
  weekPosts,
  weekStartOf,
  whyFacts,
  whyOutputSchema,
  whySystemPrompt,
  whyToolSchema,
} from "./review";

const WEEK = "2026-11-09";
const AS_OF = asOfFor(WEEK); // 2026-11-16T06:00:00Z
const post = (id: string, posted_at: string, over: Record<string, unknown> = {}) => ({
  id, platform: "instagram", posted_at, media_type: "reel", url: `https://instagram.com/reel/${id}/`, caption: `Caption ${id}`,
  hook_spoken: `Spoken ${id}`, hook_onscreen: "", hook_used: "", message: "w2-advantage", ...over,
});
function sc(id: string, n_views: number | null, mode: "matched" | "settled" | "pending" | "none" = "matched", day: number | null = 5): PostScore {
  const multiplier = { n_views, mode, day, thin: false };
  return { id, group: "g", views: 1000, multiplier, status: statusOf(multiplier) as Status | null, evergreen: false };
}
const scoresOf = (...s: PostScore[]) => new Map(s.map((x) => [x.id, x]));
const nz = (id: string, o: { n_saves?: number | null; n_shares?: number | null; saves?: number; shares?: number } = {}) =>
  ({ id, n_saves: o.n_saves ?? null, n_shares: o.n_shares ?? null, metrics: { saves: o.saves, shares: o.shares } }) as unknown as NormalizedPost;

describe("the week", () => {
  it("weekStartOf returns the Chicago Monday", () => {
    expect(weekStartOf(new Date("2026-11-16T05:59:00Z"))).toBe("2026-11-09");
    expect(weekStartOf(new Date("2026-11-16T06:00:00Z"))).toBe("2026-11-16");
    expect(weekStartOf(new Date("2026-11-11T18:00:00Z"))).toBe("2026-11-09");
  });
  it("reviewWeekFor on a Wednesday is the Monday nine days before", () => {
    expect(reviewWeekFor(new Date("2026-11-18T18:00:00Z"))).toBe("2026-11-09");
    expect(reviewWeekFor(new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-09");
  });
  it("asOfFor is Chicago midnight in both seasons", () => {
    expect(asOfFor("2026-03-02").toISOString()).toBe("2026-03-09T05:00:00.000Z");
    expect(asOfFor("2026-11-09").toISOString()).toBe("2026-11-16T06:00:00.000Z");
  });
  it("isWeekStart accepts a real Monday only", () => {
    expect(isWeekStart("2026-11-09")).toBe(true);
    expect(isWeekStart("2026-11-10")).toBe(false);
    expect(isWeekStart("2026-02-30")).toBe(false);
    expect(isWeekStart("nonsense")).toBe(false);
  });
});

describe("weekPosts", () => {
  it("a Reel posted 3 days before the review is in section 2 as an early read", () => {
    const p = post("a", "2026-11-13T15:00:00Z");
    const r = weekPosts([p], scoresOf(sc("a", 2, "matched", 3)), [nz("a")], WEEK, AS_OF);
    expect(r.worked).toHaveLength(1);
    expect(r.worked[0]).toMatchObject({ id: "a", early: true, title: "Spoken a", n_views: 2 });
  });

  it("only a post a full 7 days old on the review day is not an early read", () => {
    const first = weekPosts([post("a", "2026-11-09T06:00:00Z")], scoresOf(sc("a", 2, "matched", 7)), [nz("a")], WEEK, AS_OF);
    expect(first.worked[0].early).toBe(false);
    const later = weekPosts([post("b", "2026-11-09T15:00:00Z")], scoresOf(sc("b", 2, "matched", 6)), [nz("b")], WEEK, AS_OF);
    expect(later.worked[0].early).toBe(true);
  });

  it("a Saturday or Sunday post is too early to call", () => {
    const r = weekPosts([post("sat", "2026-11-14T22:00:00Z"), post("sun", "2026-11-15T20:00:00Z")], scoresOf(sc("sat", null, "pending", null), sc("sun", null, "pending", null)), [], WEEK, AS_OF);
    expect(r.too_early.map((x) => x.id)).toEqual(["sat", "sun"]);
    expect(r.worked).toEqual([]);
  });

  it("Promising and Viral are worked, Lagging is didn't, Normal is about usual", () => {
    const ids = ["promising", "viral", "lagging", "normal"];
    const posts = ids.map((id, k) => post(id, `2026-11-1${k}T15:00:00Z`));
    const scores = scoresOf(sc("promising", 1.6), sc("viral", 3.5), sc("lagging", 0.3), sc("normal", 1));
    const r = weekPosts(posts, scores, [], WEEK, AS_OF);
    expect(r.worked.map((x) => x.id)).toEqual(["viral", "promising"]);
    expect(r.didnt.map((x) => x.id)).toEqual(["lagging"]);
    expect(r.usual.map((x) => x.id)).toEqual(["normal"]);
  });

  it("didn't is sorted lowest first", () => {
    const r = weekPosts([post("a", "2026-11-10T15:00:00Z"), post("b", "2026-11-11T15:00:00Z")], scoresOf(sc("a", 0.4), sc("b", 0.1)), [], WEEK, AS_OF);
    expect(r.didnt.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("carousels and images are listed against their own baseline group", () => {
    const p = post("c", "2026-11-10T15:00:00Z", { media_type: "carousel" });
    const r = weekPosts([p], scoresOf({ ...sc("c", 2), group: "instagram:carousel" }), [], WEEK, AS_OF);
    expect(r.worked[0]).toMatchObject({ id: "c", media_type: "carousel" });
  });

  it("leaves out other platforms and posts outside the week", () => {
    const posts = [post("yt", "2026-11-10T15:00:00Z", { platform: "youtube" }), post("old", "2026-11-08T15:00:00Z"), post("next", "2026-11-16T07:00:00Z"), post("in", "2026-11-09T07:00:00Z")];
    const r = weekPosts(posts, scoresOf(sc("yt", 2), sc("old", 2), sc("next", 2), sc("in", 2)), [], WEEK, AS_OF);
    expect(r.worked.map((x) => x.id)).toEqual(["in"]);
  });

  it("second names the stronger of saves and shares and is null when neither exists", () => {
    const posts = [post("s", "2026-11-10T15:00:00Z"), post("h", "2026-11-11T15:00:00Z"), post("n", "2026-11-12T15:00:00Z")];
    const scores = scoresOf(sc("s", 2), sc("h", 2.1), sc("n", 2.2));
    const r = weekPosts(posts, scores, [nz("s", { n_saves: 1.4, n_shares: 0.8, saves: 88, shares: 12 }), nz("h", { n_saves: 0.5, n_shares: 2.2, saves: 5, shares: 51 }), nz("n")], WEEK, AS_OF);
    const by = Object.fromEntries(r.worked.map((x) => [x.id, x.second]));
    expect(by.s).toEqual({ metric: "saves", value: 88, multiple: 1.4 });
    expect(by.h).toEqual({ metric: "shares", value: 51, multiple: 2.2 });
    expect(by.n).toBeNull();
  });
});

describe("postTitle", () => {
  it("takes the spoken hook, then the on-screen hook, then the planned hook, then the caption's start", () => {
    const base = { hook_spoken: "", hook_onscreen: "", hook_used: "", caption: "c".repeat(100) };
    expect(postTitle({ ...base, hook_spoken: "S", hook_onscreen: "O", hook_used: "U" })).toBe("S");
    expect(postTitle({ ...base, hook_onscreen: "O", hook_used: "U" })).toBe("O");
    expect(postTitle({ ...base, hook_used: "U" })).toBe("U");
    expect(postTitle(base)).toHaveLength(60);
  });
});

describe("weekGain and the tiles", () => {
  const from = new Date("2026-11-09T06:00:00Z");
  const to = AS_OF;
  it("weekGain counts growth on old posts and the whole value of a post published in the week", () => {
    const old = { posted_at: "2026-10-01T12:00:00Z", series: [{ at: "2026-11-05T10:00:00Z", views: 100 }, { at: "2026-11-12T10:00:00Z", views: 150 }] };
    const fresh = { posted_at: "2026-11-11T12:00:00Z", series: [{ at: "2026-11-12T10:00:00Z", views: 40 }] };
    expect(weekGain([old, fresh], "views", from, to)).toBe(90);
  });
  it("weekGain is null when no post has a snapshot before the end, and skips a metric a point lacks", () => {
    expect(weekGain([{ posted_at: "x", series: [{ at: "2026-11-20T10:00:00Z", views: 5 }] }], "views", from, to)).toBeNull();
    expect(weekGain([{ posted_at: "x", series: [{ at: "2026-11-12T10:00:00Z", views: 5 }] }], "saves", from, to)).toBeNull();
    expect(weekGain([{ posted_at: "x", series: [{ at: "2026-11-12T10:00:00Z", views: 5, saves: 3 }] }], "saves", from, to)).toBe(3);
  });

  const weekly = [
    { at: "2026-10-11T12:00:00Z", views: 100 }, { at: "2026-10-18T12:00:00Z", views: 200 }, { at: "2026-10-25T12:00:00Z", views: 400 },
    { at: "2026-11-01T12:00:00Z", views: 500 }, { at: "2026-11-08T12:00:00Z", views: 700 }, { at: "2026-11-15T12:00:00Z", views: 1000 },
  ];
  it("usual is the median of the earlier full weeks, and the multiple follows", () => {
    const t = accountTiles([{ posted_at: "2026-10-01T00:00:00Z", series: weekly }], [], WEEK, AS_OF);
    expect(t.views).toEqual({ total: 300, usual: 100, multiple: 3 });
    expect(t.saves).toEqual({ total: null, usual: null, multiple: null });
  });
  it("usual is null when there are no earlier weeks", () => {
    const t = accountTiles([{ posted_at: "2026-11-10T00:00:00Z", series: [{ at: "2026-11-12T12:00:00Z", views: 50 }] }], [], WEEK, AS_OF);
    expect(t.views).toEqual({ total: 50, usual: null, multiple: null });
  });
  it("the multiple is null when usual is 0", () => {
    const flat = [{ at: "2026-10-18T12:00:00Z", views: 100 }, { at: "2026-10-25T12:00:00Z", views: 100 }, { at: "2026-11-01T12:00:00Z", views: 100 }, { at: "2026-11-08T12:00:00Z", views: 100 }, { at: "2026-11-15T12:00:00Z", views: 120 }];
    const t = accountTiles([{ posted_at: "2026-10-01T00:00:00Z", series: flat }], [], WEEK, AS_OF);
    expect(t.views.usual).toBe(0);
    expect(t.views.multiple).toBeNull();
  });
  it("the follows tile is null when a reading is missing at either end", () => {
    const both = [{ day: "2026-11-08", followers: 1000 }, { day: "2026-11-15", followers: 1030 }];
    expect(accountTiles([], both, WEEK, AS_OF).follows.total).toBe(30);
    expect(accountTiles([], [both[1]], WEEK, AS_OF).follows.total).toBeNull();
    expect(accountTiles([], [both[0]], WEEK, AS_OF).follows.total).toBeNull();
    expect(accountTiles([], [{ day: "2026-11-05", followers: 990 }, both[1]], WEEK, AS_OF).follows.total).toBeNull();
  });
  it("the follows tile has a usual from earlier weeks that have both readings", () => {
    const readings = [
      { day: "2026-10-25", followers: 900 }, { day: "2026-11-01", followers: 920 }, { day: "2026-11-08", followers: 950 }, { day: "2026-11-15", followers: 1000 },
    ];
    const f = accountTiles([], readings, WEEK, AS_OF).follows;
    expect(f).toEqual({ total: 50, usual: 25, multiple: 2 });
  });
});

describe("pillarSpread", () => {
  it("lists all five pillars, null for one with no post, and skips a legacy message without throwing", () => {
    const posts = [
      post("a", "2026-11-10T15:00:00Z", { message: "w2-advantage" }),
      post("b", "2026-11-11T15:00:00Z", { message: "w2-advantage" }),
      post("c", "2026-11-12T15:00:00Z", { message: "physics-of-wealth" }),
      post("d", "2026-11-12T16:00:00Z", { message: "velocity" }),
      post("e", "2026-11-12T17:00:00Z", { message: "" }),
    ];
    const spread = pillarSpread(posts, scoresOf(sc("a", 2), sc("b", 3), sc("c", 0.6)), WEEK, AS_OF);
    expect(spread.map((s) => s.pillar)).toEqual(["freedom-paradox", "expensive-tuition", "physics-of-wealth", "w2-advantage", "life-by-design"]);
    expect(spread.find((s) => s.pillar === "w2-advantage")).toMatchObject({ posts: 2, median_multiple: 2.5 });
    expect(spread.find((s) => s.pillar === "physics-of-wealth")).toMatchObject({ posts: 1, median_multiple: 0.6 });
    expect(spread.find((s) => s.pillar === "freedom-paradox")).toMatchObject({ posts: 0, median_multiple: null });
  });
});

describe("gateWeek", () => {
  const FROM = new Date("2026-11-09T06:00:00Z");
  const gate = (verdict: string, rewritten: boolean, at: string, failed: { item: string; reason: string }[] = [], error?: string) => ({ result: { verdict, failed }, rewritten, checked_at: at, ...(error ? { error } : {}) });
  const idea = (id: string, status: string, g: unknown) => ({ id, title: `T${id}`, format: "reel", status, gate: g });
  it("counts passed as written, passed after a rewrite and failed, inside the week only", () => {
    const w = gateWeek(
      [
        idea("a", "inbox", gate("pass", false, "2026-11-10T12:00:00Z")),
        idea("b", "inbox", gate("pass", true, "2026-11-11T12:00:00Z")),
        idea("c", "gate_failed", gate("fail", false, "2026-11-12T12:00:00Z", [{ item: "reader", reason: "Nobody." }])),
        idea("d", "gate_failed", gate("fail", false, "2026-11-12T13:00:00Z", [], "The brand check could not run (3 tries): down")),
        idea("old", "inbox", gate("pass", false, "2026-11-02T12:00:00Z")),
        idea("none", "inbox", null),
        idea("next", "inbox", gate("pass", false, "2026-11-16T07:00:00Z")),
      ],
      FROM,
      AS_OF
    );
    expect(w).toMatchObject({ checked: 4, passed: 1, rewritten: 1, failed: 2 });
    expect(w.failures.map((f) => f.id)).toEqual(["c", "d"]);
    expect(w.failures[0].reasons[0]).toMatch(/: Nobody\.$/);
    expect(w.failures[1].reasons).toEqual(["The brand check could not run (3 tries): down"]);
  });
});

describe("summaryLine", () => {
  it("words 0, 1 and several posts", () => {
    expect(summaryLine({ posts: 0, beat: 0, far_below: 0 })).toBe("No posts last week.");
    expect(summaryLine({ posts: 1, beat: 1, far_below: 0 })).toBe("1 post. 1 beat your usual views, 0 were far below.");
    expect(summaryLine({ posts: 5, beat: 2, far_below: 1 })).toBe("5 posts. 2 beat your usual views, 1 was far below.");
  });
});

describe("the why call", () => {
  it("whyOutputSchema rejects a missing or repeated post id", () => {
    const s = whyOutputSchema(["a", "b"]);
    expect(s.safeParse({ summary: "ok", whys: [{ id: "a", why: "x" }, { id: "b", why: "y" }] }).success).toBe(true);
    expect(s.safeParse({ summary: "ok", whys: [{ id: "a", why: "x" }] }).success).toBe(false);
    expect(s.safeParse({ summary: "ok", whys: [{ id: "a", why: "x" }, { id: "a", why: "y" }, { id: "b", why: "z" }] }).success).toBe(false);
    expect(s.safeParse({ summary: "ok", whys: [{ id: "a", why: "x" }, { id: "b", why: "y" }, { id: "c", why: "z" }] }).success).toBe(false);
    expect(s.safeParse({ summary: "s".repeat(201), whys: [{ id: "a", why: "x" }, { id: "b", why: "y" }] }).success).toBe(false);
  });
  it("groundedWhy keeps a sentence that names a tag and replaces one that names none", () => {
    expect(groundedWhy("A Belief attacking hook, third win on this topic.", ["Belief attacking", "3 of 4"])).toBe("A Belief attacking hook, third win on this topic.");
    expect(groundedWhy("It was just a good day.", ["Belief attacking"])).toBe(NO_REASON);
    expect(groundedWhy(NO_REASON, ["Belief attacking"])).toBe(NO_REASON);
    expect(groundedWhy("3 OF 4 hooks like it beat usual.", ["3 of 4"])).toContain("3 OF 4");
  });
  it("whyFacts lists the hook label, topic label, pillar name and counts", () => {
    const counts = { hook_type: [{ value: "paradox", won: 3, lost: 0, flat: 1, total: 4, share: 0.75 }], topic: [] };
    const f = whyFacts({ hook_type: "paradox", topic: "predictable-income", pillar: "w2-advantage" }, counts);
    expect(f).toContain("Paradox");
    expect(f).toContain("3 of 4");
    expect(f).toContain("Why predictable income supports long-term investing");
    expect(f).toContain("The W-2 Advantage");
  });
  it("the prompt and the turn carry the rules and the counts", () => {
    expect(whySystemPrompt()).toContain(NO_REASON);
    expect(whySystemPrompt()).toMatch(/never invent a cause/i);
    const turn = renderWhyTurn({
      posts: [{ id: "a", title: "Hook A", verdict: "worked", n_views: 2.4, hook_type: "Paradox", topic: "Predictable income", pillar: "The W-2 Advantage", second: "88 saves" }],
      counts: { hook_type: [{ value: "paradox", won: 3, lost: 0, flat: 1, total: 4, share: 0.75 }], topic: [] },
    });
    expect(turn).toContain("id: a");
    expect(turn).toContain("Paradox: 3 of 4");
    expect(turn).toContain("2.4x");
    expect(WHY_TOOL_NAME).toBe("record_review_why");
    expect(Object.keys((whyToolSchema() as { properties: object }).properties)).toEqual(["summary", "whys"]);
  });
});
