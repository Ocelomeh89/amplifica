import { describe, expect, it } from "vitest";
import { statusOf, type PostScore, type Status } from "./baseline";
import { evidenceCounts, type Evidence } from "./experiments";
import {
  BRING_BACK_PROTECT_DAYS,
  EMPTY_FOCUS,
  FOCUS_MIN_POSTS,
  SKIP_DAYS,
  decideFocus,
  evidenceWithoutSkipped,
  focusBrief,
  focusCounts,
  focusTier,
  isSkipped,
  orderForToday,
  skipEnd,
  type ActiveFocus,
  type FocusPost,
} from "./focus";

const WINDOW = new Date("2026-08-01T00:00:00Z");
let n = 0;
const outcomes = { won: 2, lost: 0.3, flat: 1 } as const;

function reel(tags: Partial<FocusPost>, outcome: keyof typeof outcomes, mode: "settled" | "matched" = "settled", day: number | null = null) {
  n += 1;
  const id = `p${n}`;
  const post: FocusPost = {
    id, media_type: "reel", posted_at: "2026-10-01T12:00:00Z",
    hook_type: "", onscreen_text: "", message: "w2-advantage", topic: "", cta_type: "", post_style: "",
    cover_face: null, cover_text: null, cover_number: null, hook_spoken: "", hook_onscreen: "",
    tag_confidence: {}, tag_locks: [], tagged_at: "2026-10-20T00:00:00Z", ...tags,
  };
  const multiplier = { n_views: outcomes[outcome], mode, day, thin: false };
  const score: PostScore = { id, group: "g", views: 1, multiplier, status: statusOf(multiplier) as Status | null, evergreen: false };
  return { post, score };
}
const many = (tags: Partial<FocusPost>, outcome: keyof typeof outcomes, k: number) => Array.from({ length: k }, () => reel(tags, outcome));
const countsOf = (parts: ReturnType<typeof reel>[], extra?: Parameters<typeof focusCounts>[3]) =>
  focusCounts(parts.map((p) => p.post), new Map(parts.map((p) => [p.score.id, p.score])), WINDOW, extra);
const NO_STATE = { activeSkips: [], protectedValues: [] };

describe("the constants", () => {
  it("are the spec's", () => {
    expect([FOCUS_MIN_POSTS, SKIP_DAYS, BRING_BACK_PROTECT_DAYS]).toEqual([3, 90, 90]);
    expect(skipEnd("2026-11-16")).toBe("2027-02-14");
  });
});

describe("decideFocus", () => {
  it("a hook with 4 eligible posts and 0 wins is skipped", () => {
    const parts = [...many({ hook_type: "promise" }, "lost", 3), ...many({ hook_type: "promise" }, "flat", 1)];
    const d = decideFocus(countsOf(parts), NO_STATE);
    expect(d.skip).toEqual([{ kind: "skip", dimension: "hook_type", value: "promise", won: 0, lost: 3, flat: 1, total: 4 }]);
    expect(d.doubleDown).toEqual([]);
  });

  it("a hook with 2 posts is on neither list", () => {
    const d = decideFocus(countsOf(many({ hook_type: "promise" }, "lost", 2)), NO_STATE);
    expect(d).toEqual({ doubleDown: [], skip: [] });
  });

  it("0 wins but under half lost is not skipped", () => {
    const parts = [...many({ hook_type: "promise" }, "lost", 1), ...many({ hook_type: "promise" }, "flat", 3)];
    expect(decideFocus(countsOf(parts), NO_STATE).skip).toEqual([]);
  });

  it("double down needs at least half won and more won than lost", () => {
    const two = [...many({ hook_type: "question" }, "won", 2), ...many({ hook_type: "question" }, "flat", 1)];
    expect(decideFocus(countsOf(two), NO_STATE).doubleDown.map((e) => e.value)).toEqual(["question"]);
    const tied = [...many({ hook_type: "question" }, "won", 2), ...many({ hook_type: "question" }, "lost", 2)];
    expect(decideFocus(countsOf(tied), NO_STATE).doubleDown).toEqual([]);
    const one = [...many({ hook_type: "question" }, "won", 1), ...many({ hook_type: "question" }, "flat", 2)];
    expect(decideFocus(countsOf(one), NO_STATE).doubleDown).toEqual([]);
  });

  it("one bad post never bans a topic", () => {
    expect(decideFocus(countsOf(many({ topic: "lifestyle-inflation" }, "lost", 1)), NO_STATE)).toEqual({ doubleDown: [], skip: [] });
  });

  it("hooks are listed before topics, most posts first", () => {
    const parts = [
      ...many({ hook_type: "ranking", topic: "a-topic" }, "won", 3),
      ...many({ hook_type: "paradox", topic: "b-topic" }, "won", 5),
      ...many({ hook_type: "question", topic: "b-topic" }, "won", 4),
    ];
    const d = decideFocus(countsOf(parts), NO_STATE);
    expect(d.doubleDown.map((e) => `${e.dimension}:${e.value}:${e.total}`)).toEqual([
      "hook_type:paradox:5", "hook_type:question:4", "hook_type:ranking:3", "topic:b-topic:9", "topic:a-topic:3",
    ]);
  });

  it("a value under an active skip is not re-evaluated", () => {
    const parts = many({ hook_type: "question" }, "won", 4);
    const d = decideFocus(countsOf(parts), { activeSkips: [{ dimension: "hook_type", value: "question" }], protectedValues: [] });
    expect(d).toEqual({ doubleDown: [], skip: [] });
  });

  it("a brought-back value is not skipped again", () => {
    const parts = many({ hook_type: "promise" }, "lost", 4);
    const d = decideFocus(countsOf(parts), { activeSkips: [], protectedValues: [{ dimension: "hook_type", value: "promise" }] });
    expect(d.skip).toEqual([]);
  });
});

describe("focusCounts", () => {
  it("a Reel under 7 days old is not counted", () => {
    const parts = [reel({ hook_type: "promise", topic: "t" }, "won", "matched", 3)];
    const c = countsOf(parts);
    expect(c.hook_type).toEqual([]);
    expect(c.topic).toEqual([]);
  });

  it("a Reel matched at day 7 counts", () => {
    expect(countsOf([reel({ hook_type: "promise" }, "won", "matched", 7)]).hook_type[0]).toMatchObject({ value: "promise", won: 1, total: 1 });
  });

  it("carousels, untagged posts, empty topics and legacy messages are skipped without throwing", () => {
    const parts = [
      reel({ hook_type: "promise", media_type: "carousel" }, "won"),
      reel({ hook_type: "promise", tagged_at: null }, "won"),
      reel({ hook_type: "", topic: "" }, "won"),
      reel({ hook_type: "question", message: "velocity", topic: "" }, "won"),
      reel({ hook_type: "ranking", posted_at: "2026-06-01T00:00:00Z" }, "won"),
    ];
    const c = countsOf(parts);
    expect(c.hook_type.map((r) => r.value)).toEqual(["question"]);
    expect(c.topic).toEqual([]);
  });

  it("an extra outcome counts for its hook or topic, and one outside the window does not", () => {
    const parts = many({ hook_type: "promise", topic: "t1" }, "flat", 2);
    const c = countsOf(parts, [
      { variable: "hook_type", value: "promise", outcome: "won", at: "2026-10-15T00:00:00Z" },
      { variable: "topic", value: "t1", outcome: "lost", at: "2026-10-15T00:00:00Z" },
      { variable: "hook_type", value: "promise", outcome: "won", at: "2026-05-01T00:00:00Z" },
      { variable: "onscreen_text", value: "none", outcome: "won", at: "2026-10-15T00:00:00Z" },
    ]);
    expect(c.hook_type.find((r) => r.value === "promise")).toMatchObject({ won: 1, flat: 2, total: 3 });
    expect(c.topic.find((r) => r.value === "t1")).toMatchObject({ lost: 1, flat: 2, total: 3 });
  });
});

describe("the active lists", () => {
  const focus: ActiveFocus = {
    skip: { hook_type: ["promise"], topic: ["loan-mechanics"] },
    doubleDown: { hook_type: ["question"], topic: ["predictable-income"] },
  };
  it("isSkipped is true on either dimension", () => {
    expect(isSkipped(focus, { hook_type: "promise", topic: "x" })).toBe(true);
    expect(isSkipped(focus, { hook_type: "x", topic: "loan-mechanics" })).toBe(true);
    expect(isSkipped(focus, { hook_type: "x", topic: "y" })).toBe(false);
    expect(isSkipped(focus, { hook_type: "", topic: "" })).toBe(false);
    expect(isSkipped(EMPTY_FOCUS, { hook_type: "promise", topic: "x" })).toBe(false);
  });
  it("focusTier is 2 for hook and topic, 1 for either, 0 for neither", () => {
    expect(focusTier(focus, { hook_type: "question", topic: "predictable-income" })).toBe(2);
    expect(focusTier(focus, { hook_type: "question", topic: "y" })).toBe(1);
    expect(focusTier(focus, { hook_type: "x", topic: "predictable-income" })).toBe(1);
    expect(focusTier(focus, { hook_type: "x", topic: "y" })).toBe(0);
    expect(focusTier(focus, { hook_type: "", topic: "" })).toBe(0);
  });
  it("orderForToday drops skipped ideas and puts double-down topics first, order kept", () => {
    const ideas = [
      { id: "a", hook_type: "x", topic: "y" },
      { id: "b", hook_type: "x", topic: "predictable-income" },
      { id: "c", hook_type: "promise", topic: "predictable-income" },
      { id: "d", hook_type: "x", topic: "z" },
      { id: "e", hook_type: "y", topic: "predictable-income" },
    ];
    expect(orderForToday(ideas, focus).map((i) => i.id)).toEqual(["b", "e", "a", "d"]);
    expect(orderForToday(ideas, EMPTY_FOCUS).map((i) => i.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("evidenceWithoutSkipped removes a skipped hook, and keeps every row when all are skipped", () => {
    const ev = evidenceCounts([], new Map(), WINDOW);
    const without = evidenceWithoutSkipped(ev, focus);
    expect(without.hook_type.map((r) => r.value)).not.toContain("promise");
    expect(without.hook_type).toHaveLength(ev.hook_type.length - 1);
    expect(without.message).toBe(ev.message);
    const all: ActiveFocus = { ...focus, skip: { hook_type: ev.hook_type.map((r) => r.value), topic: [] } };
    expect(evidenceWithoutSkipped(ev, all)).toBe(ev);
  });
  it("focusBrief is empty with no entries and names each list by its label otherwise", () => {
    const label = (_d: string, v: string) => v.toUpperCase();
    expect(focusBrief(EMPTY_FOCUS, label)).toBe("");
    const brief = focusBrief(focus, label);
    expect(brief.startsWith("## From the weekly review")).toBe(true);
    expect(brief).toContain("Do not write an idea with these hook types: PROMISE, or on these topics: LOAN-MECHANICS.");
    expect(brief).toContain("Prefer these hook types: QUESTION and these topics: PREDICTABLE-INCOME. Keep all five pillars.");
    const onlySkip = focusBrief({ ...EMPTY_FOCUS, skip: { hook_type: ["promise"], topic: [] } }, label);
    expect(onlySkip).toContain("Do not write an idea with these hook types: PROMISE.");
    expect(onlySkip).not.toContain("Prefer");
  });
});

describe("evidenceCounts with an extra", () => {
  const ev = (extra?: Parameters<typeof evidenceCounts>[3]): Evidence => evidenceCounts([], new Map(), WINDOW, extra);
  it("counts an extra hook outcome and ignores a topic one", () => {
    const r = ev([
      { variable: "hook_type", value: "promise", outcome: "won", at: "2026-10-15T00:00:00Z" },
      { variable: "topic", value: "t1", outcome: "won", at: "2026-10-15T00:00:00Z" },
      { variable: "hook_type", value: "promise", outcome: "lost", at: "2026-05-15T00:00:00Z" },
    ]);
    expect(r.hook_type.find((x) => x.value === "promise")).toMatchObject({ won: 1, lost: 0, total: 1, share: 1 });
    expect(JSON.stringify(r)).not.toContain("t1");
  });
  it("without extra returns what it did before", () => {
    expect(ev()).toEqual(ev([]));
    expect(ev().hook_type.every((x) => x.total === 0)).toBe(true);
  });
});
