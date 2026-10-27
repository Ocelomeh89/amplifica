import { describe, expect, it } from "vitest";
import type { PostScore } from "./baseline";
import {
  LACKS_MIN_REST,
  MIN_ELIGIBLE,
  SMALL_SAMPLE,
  isEligible,
  winnerInsights,
  type WinnerPost,
} from "./winners";

const WINDOW = new Date("2026-07-01T00:00:00Z");

type Opts = {
  media?: string;
  tags?: Partial<WinnerPost>;
  n?: number | null;
  mode?: "pending" | "matched" | "settled" | "none";
  day?: number | null;
  tagged?: boolean;
};

function mk(id: string, o: Opts = {}): { post: WinnerPost; score: PostScore } {
  const post: WinnerPost = {
    id,
    media_type: o.media ?? "reel",
    posted_at: "2026-09-01T00:00:00Z",
    hook_type: "",
    onscreen_text: "",
    message: "",
    cta_type: "",
    post_style: "",
    cover_face: null,
    cover_text: null,
    cover_number: null,
    hook_spoken: "",
    hook_onscreen: "",
    tag_confidence: {},
    tag_locks: [],
    tagged_at: o.tagged === false ? null : "2026-10-01T00:00:00Z",
    ...o.tags,
  };
  const score: PostScore = {
    id,
    group: "g",
    views: 100,
    multiplier: { n_views: o.n === undefined ? 1 : o.n, mode: o.mode ?? "settled", day: o.day ?? null, thin: false },
    status: null,
    evergreen: false,
  };
  return { post, score };
}

function run(subject: WinnerPost, others: ReturnType<typeof mk>[]) {
  const all = [subject, ...others.map((o) => o.post)];
  const scores = new Map(others.map((o) => [o.score.id, o.score]));
  return winnerInsights(subject, all, scores, WINDOW);
}

/** 30 eligible reels: n_views 30 down to 1, so the top third (10) are ids w30..w21. */
function field(tagFor: (i: number, isWinner: boolean) => Partial<WinnerPost>) {
  return Array.from({ length: 30 }, (_, k) => {
    const rank = k + 1; // 1 is the best
    const isWinner = rank <= 10;
    return mk(`w${rank}`, { n: 31 - rank, tags: tagFor(rank, isWinner) });
  });
}

const subject = mk("me", { tags: { hook_type: "question", cover_number: false } }).post;

describe("isEligible", () => {
  it("accepts settled, and matched from day 7", () => {
    expect(isEligible({ n_views: 2, mode: "settled", day: null, thin: false })).toBe(true);
    expect(isEligible({ n_views: 2, mode: "matched", day: 7, thin: false })).toBe(true);
  });
  it("rejects pending, none, null and matched under day 7", () => {
    expect(isEligible({ n_views: 2, mode: "pending", day: null, thin: false })).toBe(false);
    expect(isEligible({ n_views: null, mode: "none", day: null, thin: false })).toBe(false);
    expect(isEligible({ n_views: 2, mode: "matched", day: 6, thin: false })).toBe(false);
  });
});

describe("winnerInsights", () => {
  it("returns untagged for an untagged post", () => {
    const untagged = mk("me", { tagged: false }).post;
    expect(run(untagged, field(() => ({})))).toEqual({ state: "untagged" });
  });

  it("is thin under 15 eligible posts", () => {
    const few = field(() => ({})).slice(0, MIN_ELIGIBLE - 1);
    expect(run(subject, few)).toEqual({ state: "thin", have: 14, need: 15 });
  });

  it("excludes the post itself from both groups", () => {
    const others = field(() => ({})).slice(0, 15);
    const self = mk("me", { n: 99, tags: subject });
    const r = run(subject, [...others, self]);
    expect(r.state).toBe("ok");
    if (r.state === "ok") expect(r.winners + r.rest).toBe(15);
  });

  it("ignores pending, none and matched-under-day-7 posts", () => {
    const base = field(() => ({})).slice(0, 14);
    const noise = [
      mk("p1", { mode: "pending", n: 50 }),
      mk("p2", { mode: "none", n: null }),
      mk("p3", { mode: "matched", day: 3, n: 50 }),
    ];
    expect(run(subject, [...base, ...noise])).toEqual({ state: "thin", have: 14, need: 15 });
  });

  it("compares within media type only", () => {
    const reels = field(() => ({})).slice(0, 14);
    const carousels = Array.from({ length: 10 }, (_, i) => mk(`c${i}`, { media: "carousel", n: 5 }));
    expect(run(subject, [...reels, ...carousels])).toEqual({ state: "thin", have: 14, need: 15 });
  });

  it("ignores untagged posts and posts before the window", () => {
    const base = field(() => ({})).slice(0, 14);
    const noise = [
      mk("u", { tagged: false }),
      { ...mk("old"), post: { ...mk("old").post, posted_at: "2026-05-01T00:00:00Z" } },
    ];
    expect(run(subject, [...base, ...noise])).toEqual({ state: "thin", have: 14, need: 15 });
  });

  it("makes the top third the winners, at most 10", () => {
    const eighteen = run(subject, field(() => ({})).slice(0, 18));
    const forty5 = run(subject, [
      ...field(() => ({})),
      ...Array.from({ length: 15 }, (_, i) => mk(`x${i}`, { n: 0.5 })),
    ]);
    if (eighteen.state !== "ok" || forty5.state !== "ok") throw new Error("expected ok");
    expect(eighteen.winners).toBe(6);
    expect(forty5.winners).toBe(10);
  });

  it("states raw counts on both sides for hook types and other tags", () => {
    const tagged = field((rank, w) => ({
      hook_type: w ? (rank <= 6 ? "question" : "promise") : rank <= 14 ? "question" : "promise",
      post_style: "talking-head-text",
    }));
    const r = run({ ...subject, post_style: "talking-head-text" }, tagged);
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.shared).toContain("Question hooks: 6 of your top 10, 4 of the other 20.");
    expect(r.shared).toContain("Post style: Talking head text: 10 of your top 10, 20 of the other 20.");
  });

  it("counts posts on the message and how many sit above median", () => {
    const tagged = field((rank) => ({ message: rank === 1 || rank === 2 || rank === 30 ? "velocity" : "" }));
    const r = run({ ...subject, message: "velocity" }, tagged);
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.message).toBe("Message: Velocity. 3 posts carry it, 2 above median.");
  });

  it("has no message line for a blank or none message", () => {
    const r = run(subject, field(() => ({ message: "velocity" })));
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.message).toBeNull();
  });

  it("says what the post lacks when half the winners have it and the rest is 15 or more", () => {
    const tagged = field((rank) => ({ cover_number: rank <= 5 }));
    const r = run(subject, tagged);
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.lacks).toBe("Not in this post: a number on the cover. 5 of your top 10 have one.");
  });

  it("says nothing about a lack under half the winners", () => {
    const r = run(subject, field((rank) => ({ cover_number: rank <= 4 })));
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.lacks).toBeNull();
  });

  it("says nothing about a lack when the rest is under 15", () => {
    // 21 eligible gives 7 winners and a rest of 14
    const r = run(subject, field((rank) => ({ cover_number: rank <= 5 })).slice(0, 21));
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.rest).toBeLessThan(LACKS_MIN_REST);
    expect(r.lacks).toBeNull();
  });

  it("carries the small-sample caveat", () => {
    const r = run(subject, field(() => ({})));
    if (r.state !== "ok") throw new Error("expected ok");
    expect(r.caveat).toBe(SMALL_SAMPLE);
  });
});
