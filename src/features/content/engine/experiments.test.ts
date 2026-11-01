import { describe, expect, it } from "vitest";
import type { PostScore, Status } from "./baseline";
import { statusOf } from "./baseline";
import type { WinnerPost } from "./winners";
import {
  COVER_VALUES,
  EXPLORE_BELOW,
  NEW_FORMAT,
  SOURCE_VALUES,
  competitorTest,
  type CompetitorTags,
  candidateTests,
  controlRecipe,
  coverValue,
  evidenceCounts,
  judgeExperiment,
  tagsFromRecipe,
  UNJUDGED_AFTER_DAYS,
  outcomeOf,
  pickDay,
  pickMoment,
  renderReason,
  tallyRows,
  valuesOf,
  type Evidence,
} from "./experiments";

const NOW = new Date("2026-10-27T12:00:00Z");
const WINDOW = new Date(NOW.getTime() - 90 * 86_400_000);

let n = 0;
function post(over: Partial<WinnerPost> = {}): WinnerPost {
  n += 1;
  return {
    id: `p${n}`,
    media_type: "reel",
    posted_at: "2026-10-01T12:00:00Z",
    hook_type: "question",
    onscreen_text: "none",
    message: "velocity",
    cta_type: "save",
    post_style: "talking-head",
    cover_face: true,
    cover_text: false,
    cover_number: false,
    hook_spoken: "",
    hook_onscreen: "",
    tag_confidence: {},
    tag_locks: [],
    tagged_at: "2026-10-20T00:00:00Z",
    ...over,
  };
}

function score(id: string, n_views: number | null, mode: "matched" | "settled" | "pending" | "none" = "settled", day: number | null = null): PostScore {
  const multiplier = { n_views, mode, day, thin: false };
  return { id, group: "g", views: 1, multiplier, status: statusOf(multiplier) as Status | null, evergreen: false };
}

const scoresOf = (...s: PostScore[]) => new Map(s.map((x) => [x.id, x]));

/** k posts with the same tag override; the first `won` win, the next `lost` lose, the rest are flat. */
function batch(over: Partial<WinnerPost>, total: number, won: number, lost = 0) {
  const posts: WinnerPost[] = [];
  const scores: PostScore[] = [];
  for (let i = 0; i < total; i++) {
    const p = post(over);
    posts.push(p);
    scores.push(score(p.id, i < won ? 2 : i < won + lost ? 0.3 : 1));
  }
  return { posts, scores };
}

function evidenceOf(...parts: ReturnType<typeof batch>[]): Evidence {
  const posts = parts.flatMap((p) => p.posts);
  const scores = scoresOf(...parts.flatMap((p) => p.scores));
  return evidenceCounts(posts, scores, WINDOW);
}

describe("coverValue", () => {
  it("joins the true flags in face, text, number order", () => {
    expect(coverValue({ cover_face: true, cover_text: false, cover_number: true })).toBe("face+number");
  });
  it("is none when every flag is false", () => {
    expect(coverValue({ cover_face: false, cover_text: false, cover_number: false })).toBe("none");
  });
  it("is null when any flag is null", () => {
    expect(coverValue({ cover_face: true, cover_text: null, cover_number: false })).toBeNull();
  });
  it("COVER_VALUES holds the eight combinations with none last", () => {
    expect(COVER_VALUES).toHaveLength(8);
    expect(COVER_VALUES[7]).toBe("none");
  });
});

describe("outcomeOf and valuesOf", () => {
  it("maps statuses to outcomes", () => {
    expect(outcomeOf("Promising")).toBe("won");
    expect(outcomeOf("Viral")).toBe("won");
    expect(outcomeOf("Lagging")).toBe("lost");
    expect(outcomeOf("Normal")).toBe("flat");
    expect(outcomeOf("Pending")).toBeNull();
    expect(outcomeOf(null)).toBeNull();
  });
  it("post_style never offers carousel or image", () => {
    expect(valuesOf("post_style")).not.toContain("carousel");
    expect(valuesOf("post_style")).not.toContain("image");
  });
});

describe("evidenceCounts", () => {
  it("counts only tagged, eligible Reels in the window", () => {
    const won = batch({ hook_type: "question" }, 1, 1);
    const carousel = batch({ media_type: "carousel", hook_type: "paradox" }, 1, 1);
    const early = post({ hook_type: "warning" });
    const untagged = post({ hook_type: "ranking", tagged_at: null });
    const old = post({ hook_type: "identity", posted_at: "2026-01-01T00:00:00Z" });
    const ev = evidenceCounts(
      [...won.posts, ...carousel.posts, early, untagged, old],
      scoresOf(...won.scores, ...carousel.scores, score(early.id, 2, "matched", 5), score(untagged.id, 2), score(old.id, 2)),
      WINDOW
    );
    const hook = Object.fromEntries(ev.hook_type.map((v) => [v.value, v.total]));
    expect(hook.question).toBe(1);
    expect(hook.paradox).toBe(0);
    expect(hook.warning).toBe(0);
    expect(hook.ranking).toBe(0);
    expect(hook.identity).toBe(0);
  });

  it("counts Promising and Viral as won, Lagging as lost, Normal as flat", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, 5, 2, 2));
    const q = ev.hook_type.find((v) => v.value === "question")!;
    expect([q.won, q.lost, q.flat, q.total]).toEqual([2, 2, 1, 5]);
    expect(q.share).toBeCloseTo(0.4);
  });

  it("leaves a post out of the cover counts when a flag is null", () => {
    const ev = evidenceOf(batch({ cover_text: null }, 3, 3));
    expect(ev.cover.every((v) => v.total === 0)).toBe(true);
    expect(ev.hook_type.find((v) => v.value === "question")!.total).toBe(3);
  });
});

describe("controlRecipe", () => {
  it("picks the highest win share among values with enough posts, ties to the larger count", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, 5, 4), batch({ hook_type: "belief-attacking" }, 6, 6), batch({ hook_type: "paradox" }, 2, 2));
    expect(controlRecipe(ev).hook_type).toBe("belief-attacking");
  });

  it("falls back to the most used value when none has enough posts", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, 3, 1), batch({ hook_type: "paradox" }, 2, 2));
    expect(controlRecipe(ev).hook_type).toBe("question");
  });

  it("falls back to the first listed value when a variable has no posts at all", () => {
    const ev = evidenceOf();
    expect(controlRecipe(ev).hook_type).toBe("belief-attacking");
    expect(controlRecipe(ev).cover).toBe(COVER_VALUES[0]);
  });
});

describe("candidateTests", () => {
  it("ranks win share first, then thinner evidence, and skips the control value", () => {
    const ev = evidenceOf(
      batch({ hook_type: "question" }, EXPLORE_BELOW, 4),
      batch({ hook_type: "paradox" }, 4, 2),
      batch({ hook_type: "warning" }, 2, 1)
    );
    const control = controlRecipe(ev);
    expect(control.hook_type).toBe("question");
    const c = candidateTests(ev, control, []).filter((t) => t.variable === "hook_type");
    expect(c.slice(0, 2).map((t) => t.value)).toEqual(["warning", "paradox"]);
    expect(c[0].control).toBe("question");
  });

  it("drops a pair a live experiment already holds", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, EXPLORE_BELOW, 4), batch({ hook_type: "paradox" }, 4, 2));
    const control = controlRecipe(ev);
    const c = candidateTests(ev, control, [{ variable: "hook_type", value: "paradox" }]);
    expect(c.find((t) => t.variable === "hook_type" && t.value === "paradox")).toBeUndefined();
  });

  it("falls back to zero-post values in list order when no thin lead exists", () => {
    const ev = evidenceOf(batch({}, 6, 0));
    const c = candidateTests(ev, controlRecipe(ev), []);
    expect(c[0].variable).toBe("hook_type");
    expect(c[0].value).toBe("belief-attacking");
  });

  it("offers only topic when nothing else is left", () => {
    const ev = evidenceOf();
    const everything = [
      ...(["hook_type", "onscreen_text", "cta_type", "post_style", "cover", "message"] as const).flatMap((v) =>
        valuesOf(v).map((value) => ({ variable: v as string, value }))
      ),
    ];
    const c = candidateTests(ev, controlRecipe(ev), everything);
    expect(c).toEqual([{ variable: "topic", value: "new", control: "" }]);
  });
});

describe("pickDay", () => {
  it("gives two slots on different variables and different ideas", () => {
    const ev = evidenceOf(
      batch({ hook_type: "question" }, EXPLORE_BELOW, 4),
      batch({ hook_type: "paradox" }, 3, 2),
      batch({ post_style: "talking-head" }, 5, 4),
      batch({ post_style: "text-broll" }, 2, 1)
    );
    const { slots } = pickDay(ev, [], ["i1", "i2", "i3"]);
    expect(slots).toHaveLength(2);
    expect(slots[0].test.variable).not.toBe(slots[1].test.variable);
    expect(slots.map((s) => s.ideaId)).toEqual(["i1", "i2"]);
    expect(slots.map((s) => s.slot)).toEqual([1, 2]);
  });

  it("gives one slot for one idea and none for no ideas, always with a control", () => {
    const ev = evidenceOf(batch({}, 6, 3));
    expect(pickDay(ev, [], ["i1"]).slots).toHaveLength(1);
    const none = pickDay(ev, [], []);
    expect(none.slots).toHaveLength(0);
    expect(none.control.hook_type).toBeTruthy();
  });

  it("still returns two slots when no value of any variable has five posts", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, 4, 2));
    const { slots } = pickDay(ev, [], ["i1", "i2"]);
    expect(slots).toHaveLength(2);
    expect(slots[0].test.variable).not.toBe(slots[1].test.variable);
  });
});

describe("pickMoment", () => {
  it("takes the first candidate not held live", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, EXPLORE_BELOW, 4), batch({ hook_type: "paradox" }, 3, 2));
    const first = pickMoment(ev, [])!;
    const second = pickMoment(ev, [{ variable: first.test.variable, value: first.test.value }])!;
    expect(second.test).not.toEqual(first.test);
  });
});

describe("renderReason", () => {
  it("states the counts", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, EXPLORE_BELOW, 4), batch({ hook_type: "paradox" }, 3, 2));
    const r = renderReason({ variable: "hook_type", value: "paradox", control: "question" }, ev);
    expect(r).toContain("Paradox won 2 of 3");
    expect(r).toContain("Question");
  });
  it("says so when no post tried the value", () => {
    const ev = evidenceOf();
    expect(renderReason({ variable: "hook_type", value: "warning", control: "question" }, ev)).toBe("No post in the last 90 days has tried this.");
  });
});

describe("tallyRows", () => {
  it("omits zero-total values and marks thin ones", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, 5, 3), batch({ hook_type: "paradox" }, 2, 1));
    const row = tallyRows(ev).find((r) => r.variable === "hook_type")!;
    expect(row.values.map((v) => v.value).sort()).toEqual(["paradox", "question"]);
    expect(row.values.find((v) => v.value === "paradox")!.thin).toBe(true);
    expect(row.values.find((v) => v.value === "question")!.thin).toBe(false);
    expect(row.label).toBe("Hook type");
  });
});

describe("judgeExperiment", () => {
  const posted = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  const norm = { n_saves: 1.2, n_watch: 0.9 };

  it("judges a matched day-7 figure at 1.6 as won and stores the figures", () => {
    const r = judgeExperiment({ postedAt: posted(8), multiplier: { n_views: 1.6, mode: "matched", day: 7, thin: false }, normalized: norm, now: NOW });
    expect(r).toEqual({
      status: "judged",
      verdict: "won",
      judge_metrics: { multiplier: 1.6, day: 7, mode: "matched", n_saves: 1.2, n_watch: 0.9 },
    });
  });

  it("judges a settled 0.4 as lost", () => {
    const r = judgeExperiment({ postedAt: posted(20), multiplier: { n_views: 0.4, mode: "settled", day: null, thin: false }, normalized: null, now: NOW });
    expect(r).toMatchObject({ status: "judged", verdict: "lost" });
  });

  it("judges matched day 9 at 1.0 as flat", () => {
    const r = judgeExperiment({ postedAt: posted(10), multiplier: { n_views: 1.0, mode: "matched", day: 9, thin: false }, normalized: norm, now: NOW });
    expect(r).toMatchObject({ status: "judged", verdict: "flat" });
  });

  it("waits at matched day 5", () => {
    expect(judgeExperiment({ postedAt: posted(6), multiplier: { n_views: 2, mode: "matched", day: 5, thin: false }, normalized: null, now: NOW })).toBeNull();
  });

  it("marks an experiment unjudged once it has no day-7 figure after the limit", () => {
    expect(UNJUDGED_AFTER_DAYS).toBe(14);
    const r = judgeExperiment({ postedAt: posted(16), multiplier: { n_views: null, mode: "none", day: null, thin: false }, normalized: null, now: NOW });
    expect(r).toEqual({ status: "unjudged", reason: "No day-7 figure after 14 days." });
  });

  it("keeps waiting before the limit when there is no figure yet", () => {
    expect(judgeExperiment({ postedAt: posted(10), multiplier: { n_views: null, mode: "none", day: null, thin: false }, normalized: null, now: NOW })).toBeNull();
  });
});

describe("tagsFromRecipe", () => {
  const recipe = { hook_type: "paradox", onscreen_text: "adds-to-hook", cta_type: "save", post_style: "text-broll", cover: "face+number", message: "velocity", topic: "x" };
  it("writes the six tags, explicit cover flags and the hook as the spoken hook", () => {
    const t = tagsFromRecipe(recipe, "Your 401k is slow.", NOW);
    expect(t).toMatchObject({
      hook_type: "paradox",
      onscreen_text: "adds-to-hook",
      cta_type: "save",
      post_style: "text-broll",
      message: "velocity",
      cover_face: true,
      cover_text: false,
      cover_number: true,
      hook_spoken: "Your 401k is slow.",
      hook_onscreen: "",
      tagged_at: NOW.toISOString(),
    });
  });
  it("gives 0.8 confidence to each tag it set, above the low-confidence line", () => {
    const t = tagsFromRecipe(recipe, "h", NOW);
    expect(Object.keys(t.tag_confidence).sort()).toEqual(["cover_face", "cover_number", "cover_text", "cta_type", "hook_type", "message", "onscreen_text", "post_style"]);
    expect(Object.values(t.tag_confidence).every((v) => v === 0.8)).toBe(true);
  });
  it("reads none as all three flags false", () => {
    const t = tagsFromRecipe({ ...recipe, cover: "none" }, "h", NOW);
    expect([t.cover_face, t.cover_text, t.cover_number]).toEqual([false, false, false]);
  });
});

describe("one ranked list and held variables", () => {
  it("fills two slots on different variables when thin leads exist on only one variable", () => {
    const ev = evidenceOf(
      batch({ hook_type: "question" }, EXPLORE_BELOW, 4),
      batch({ hook_type: "paradox" }, 3, 2),
      batch({ hook_type: "warning" }, 2, 1)
    );
    const { slots } = pickDay(ev, [], ["i1", "i2"]);
    expect(slots).toHaveLength(2);
    expect(slots[0].test.variable).toBe("hook_type");
    expect(slots[1].test.variable).not.toBe("hook_type");
  });

  it("pickDay never tests a variable a live slot already holds", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, EXPLORE_BELOW, 4), batch({ hook_type: "paradox" }, 3, 2));
    const { slots } = pickDay(ev, [], ["i1", "i2"], ["hook_type"]);
    expect(slots.every((s) => s.test.variable !== "hook_type")).toBe(true);
  });

  it("pickMoment never tests a variable a live slot already holds", () => {
    const ev = evidenceOf(batch({ hook_type: "question" }, EXPLORE_BELOW, 4), batch({ hook_type: "paradox" }, 3, 2));
    const pick = pickMoment(ev, [], ["hook_type"]);
    expect(pick!.test.variable).not.toBe("hook_type");
  });
});

describe("slice 6: the source variable and the competitor test", () => {
  // Control: question hook, talking head, save CTA, no on-screen text, face cover (5 posts each).
  const base = () => batch({}, 5, 3);
  const tags = (over: Partial<CompetitorTags> = {}): CompetitorTags => ({
    hook_type: "question",
    onscreen_text: "none",
    cta_type: "save",
    post_style: "talking-head",
    cover_face: true,
    cover_text: false,
    cover_number: false,
    tag_confidence: { hook_type: 0.9, onscreen_text: 0.9, cta_type: 0.9, post_style: 0.9, cover_face: 0.9, cover_text: 0.9, cover_number: 0.9 },
    pushes_belief: null,
    format_note: null,
    ...over,
  });

  it("a barely-tried, confidently tagged post style seeds a format test", () => {
    const ev = evidenceOf(base(), batch({ post_style: "text-broll" }, 1, 1));
    expect(competitorTest(tags({ post_style: "text-broll" }), ev, controlRecipe(ev), [])).toEqual({
      variable: "post_style",
      value: "text-broll",
      control: "talking-head",
    });
  });

  it("takes the first qualifying choice in held-still order", () => {
    const ev = evidenceOf(base());
    expect(competitorTest(tags({ hook_type: "paradox", post_style: "text-broll" }), ev, controlRecipe(ev), []).variable).toBe("hook_type");
  });

  it("format tags all below LOW_CONFIDENCE seed a topic test: a rebuttal when it pushes a belief", () => {
    const ev = evidenceOf(base());
    const low = { hook_type: 0.4, onscreen_text: 0.4, cta_type: 0.4, post_style: 0.5, cover_face: 0.3, cover_text: 0.9, cover_number: 0.9 };
    const t = competitorTest(tags({ hook_type: "paradox", post_style: "text-broll", cover_face: false, tag_confidence: low, pushes_belief: "max out your 401k" }), ev, controlRecipe(ev), []);
    expect(t).toEqual({ variable: "source", value: "competitor-rebuttal", control: "own" });
  });

  it("a value with 5 or more posts, or held live, does not qualify; no pushed belief makes a take", () => {
    const ev = evidenceOf(base(), batch({ post_style: "text-broll" }, EXPLORE_BELOW, 1));
    expect(competitorTest(tags({ post_style: "text-broll" }), ev, controlRecipe(ev), [])).toEqual({ variable: "source", value: "competitor-take", control: "own" });
    const ev2 = evidenceOf(base());
    expect(competitorTest(tags({ post_style: "text-broll" }), ev2, controlRecipe(ev2), [{ variable: "post_style", value: "text-broll" }]).variable).toBe("source");
  });

  it("matching the control everywhere is a topic test; carousel and image styles never qualify", () => {
    const ev = evidenceOf(base());
    expect(competitorTest(tags(), ev, controlRecipe(ev), []).variable).toBe("source");
    expect(competitorTest(tags({ post_style: "carousel" }), ev, controlRecipe(ev), []).variable).toBe("source");
  });

  it("a format note seeds a new-format post style test even while another new-format test is live", () => {
    const ev = evidenceOf(base());
    expect(competitorTest(tags({ post_style: "", format_note: "split screen, two speakers" }), ev, controlRecipe(ev), [{ variable: "post_style", value: NEW_FORMAT }])).toEqual({
      variable: "post_style",
      value: NEW_FORMAT,
      control: "talking-head",
    });
  });

  it("evidence counts source from the post, own by default; candidateTests never proposes source", () => {
    const a = { ...post(), source: "competitor-take" as const };
    const b = post();
    const ev = evidenceCounts([a, b], scoresOf(score(a.id, 2), score(b.id, 2)), WINDOW);
    expect(ev.source.map((r) => r.value)).toEqual([...SOURCE_VALUES]);
    expect(ev.source.find((r) => r.value === "competitor-take")!.won).toBe(1);
    expect(ev.source.find((r) => r.value === "own")!.won).toBe(1);
    expect(candidateTests(ev, controlRecipe(ev), []).some((t) => t.variable === "source")).toBe(false);
  });

  it("tagsFromRecipe leaves post_style blank for a new-format recipe", () => {
    expect(tagsFromRecipe({ post_style: NEW_FORMAT, cover: "none" }, "hook", NOW).post_style).toBe("");
  });

  it("the tally has a Source row and never lists new-format", () => {
    const ev = evidenceOf(base());
    const rows = tallyRows(ev);
    expect(rows.map((r) => r.label)).toContain("Source");
    expect(rows.flatMap((r) => r.values.map((v) => v.value))).not.toContain(NEW_FORMAT);
  });
});
