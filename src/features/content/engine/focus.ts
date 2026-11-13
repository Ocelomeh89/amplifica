import type { PostScore } from "./baseline";
import { topicLabel } from "./brand";
import { TAG_LABELS } from "./tags";
import type { Evidence, ValueCount } from "./experiments";
import { outcomeOf } from "./experiments";
import { isEligible, type WinnerPost } from "./winners";

// The weekly review's two lists, as pure math. A hook type or a topic is double-down when it keeps winning and
// skip when it keeps losing, judged on Miguel's eligible Instagram Reels in the 90-day window. Nothing here
// touches the database; data/focus.ts stores the lists and loads the active ones.

/** A value needs this many eligible posts before it can be on either list, so one bad post never bans a hook. */
export const FOCUS_MIN_POSTS = 3;
/** A skip lasts this many days from the review day, then the value is allowed back. */
export const SKIP_DAYS = 90;
/** Bring back stops the same value being skipped again for this many days. */
export const BRING_BACK_PROTECT_DAYS = 90;

export const FOCUS_DIMENSIONS = ["hook_type", "topic"] as const;
export type FocusDimension = (typeof FOCUS_DIMENSIONS)[number];
export type FocusKind = "double_down" | "skip";

/** A result that did not come from a normal post (a Trial Reel test supplies these). */
export type ExtraOutcome = { variable: "hook_type" | "onscreen_text" | "topic"; value: string; outcome: "won" | "lost" | "flat"; at: string };

export type FocusPost = WinnerPost & { topic: string };

/**
 * Wins, losses and flats per hook type and per topic. Same guards as evidenceCounts: tagged Reels in the window
 * with a settled enough multiplier. Rows are built from the values seen, so topics need no fixed list; an empty
 * value is not counted. An extra counts when its variable is a dimension and its date is in the window.
 */
export function focusCounts(
  posts: FocusPost[],
  scores: Map<string, PostScore>,
  windowStart: Date,
  extra: ExtraOutcome[] = []
): Record<FocusDimension, ValueCount[]> {
  const rows: Record<FocusDimension, Map<string, ValueCount>> = { hook_type: new Map(), topic: new Map() };
  const add = (dimension: FocusDimension, value: string, outcome: "won" | "lost" | "flat") => {
    if (value === "") return;
    const row = rows[dimension].get(value) ?? { value, won: 0, lost: 0, flat: 0, total: 0, share: 0 };
    row[outcome] += 1;
    row.total += 1;
    rows[dimension].set(value, row);
  };
  const since = windowStart.getTime();
  for (const p of posts) {
    if (p.media_type !== "reel" || p.tagged_at === null || new Date(p.posted_at).getTime() < since) continue;
    const s = scores.get(p.id);
    if (!s || !isEligible(s.multiplier)) continue;
    const outcome = outcomeOf(s.status);
    if (!outcome) continue;
    add("hook_type", p.hook_type, outcome);
    add("topic", p.topic ?? "", outcome);
  }
  for (const x of extra) {
    if (x.variable !== "hook_type" && x.variable !== "topic") continue;
    if (new Date(x.at).getTime() < since) continue;
    add(x.variable, x.value, x.outcome);
  }
  const out = {} as Record<FocusDimension, ValueCount[]>;
  for (const d of FOCUS_DIMENSIONS) {
    out[d] = [...rows[d].values()].map((r) => ({ ...r, share: r.total === 0 ? 0 : r.won / r.total }));
  }
  return out;
}

export type FocusState = {
  /** Skips started by other weeks and still running on the review day. */
  activeSkips: { dimension: FocusDimension; value: string }[];
  /** Values Miguel brought back, still protected. */
  protectedValues: { dimension: FocusDimension; value: string }[];
};
export type FocusEntry = { kind: FocusKind; dimension: FocusDimension; value: string; won: number; lost: number; flat: number; total: number };

const has = (list: { dimension: FocusDimension; value: string }[], dimension: FocusDimension, value: string) =>
  list.some((x) => x.dimension === dimension && x.value === value);

/** Double down: at least half won and more won than lost. Skip: none won and at least half lost. Hooks first, then topics. */
export function decideFocus(counts: Record<FocusDimension, ValueCount[]>, state: FocusState): { doubleDown: FocusEntry[]; skip: FocusEntry[] } {
  const doubleDown: FocusEntry[] = [];
  const skip: FocusEntry[] = [];
  for (const dimension of FOCUS_DIMENSIONS) {
    const rows = [...counts[dimension]].sort((a, b) => b.total - a.total || a.value.localeCompare(b.value));
    for (const r of rows) {
      if (r.total < FOCUS_MIN_POSTS) continue;
      // A value under an active skip is not re-evaluated: it stays skipped until its end date.
      if (has(state.activeSkips, dimension, r.value)) continue;
      const entry = { dimension, value: r.value, won: r.won, lost: r.lost, flat: r.flat, total: r.total };
      if (r.won * 2 >= r.total && r.won > r.lost) doubleDown.push({ kind: "double_down", ...entry });
      else if (r.won === 0 && r.lost * 2 >= r.total && !has(state.protectedValues, dimension, r.value)) skip.push({ kind: "skip", ...entry });
    }
  }
  return { doubleDown, skip };
}

export type ActiveFocus = { skip: Record<FocusDimension, string[]>; doubleDown: Record<FocusDimension, string[]> };
export const EMPTY_FOCUS: ActiveFocus = {
  skip: { hook_type: [], topic: [] },
  doubleDown: { hook_type: [], topic: [] },
};

type Tagged = { hook_type: string; topic: string };

/** True when the idea's hook type or its topic is on the skip list. An empty value never matches. */
export function isSkipped(focus: ActiveFocus, item: Tagged): boolean {
  return (item.hook_type !== "" && focus.skip.hook_type.includes(item.hook_type)) || (item.topic !== "" && focus.skip.topic.includes(item.topic));
}

/** 2 when both the hook type and the topic are double-down, 1 for either, 0 for neither. */
export function focusTier(focus: ActiveFocus, item: Tagged): 0 | 1 | 2 {
  const hook = item.hook_type !== "" && focus.doubleDown.hook_type.includes(item.hook_type);
  const topic = item.topic !== "" && focus.doubleDown.topic.includes(item.topic);
  return ((hook ? 1 : 0) + (topic ? 1 : 0)) as 0 | 1 | 2;
}

/** For Today: drops skipped ideas, then puts ideas with a double-down topic first. The given order holds inside each group. */
export function orderForToday<T extends Tagged>(ideas: T[], focus: ActiveFocus): T[] {
  const kept = ideas.filter((i) => !isSkipped(focus, i));
  const liked = (i: T) => i.topic !== "" && focus.doubleDown.topic.includes(i.topic);
  return [...kept.filter(liked), ...kept.filter((i) => !liked(i))];
}

/** The hook rows minus skipped hooks, so Today's control recipe never uses a skipped hook. Unchanged when that would leave none. */
export function evidenceWithoutSkipped(ev: Evidence, focus: ActiveFocus): Evidence {
  const rows = ev.hook_type.filter((r) => !focus.skip.hook_type.includes(r.value));
  if (rows.length === 0 || rows.length === ev.hook_type.length) return ev;
  return { ...ev, hook_type: rows };
}

/** The block the daily routine and the generator prompts carry. Empty when all four lists are empty. */
export function focusBrief(focus: ActiveFocus, label: (d: FocusDimension, v: string) => string): string {
  const list = (d: FocusDimension, values: string[]) => values.map((v) => label(d, v)).join(", ");
  const sentence = (lead: string, hooks: string[], topics: string[], joiner: string) => {
    const parts = [hooks.length ? `these hook types: ${list("hook_type", hooks)}` : "", topics.length ? `${lead === "skip" ? "on " : ""}these topics: ${list("topic", topics)}` : ""].filter(Boolean);
    return parts.join(joiner);
  };
  const lines: string[] = [];
  const s = focus.skip;
  if (s.hook_type.length || s.topic.length) {
    const withHooks = s.hook_type.length ? `with these hook types: ${list("hook_type", s.hook_type)}` : "";
    const onTopics = s.topic.length ? `on these topics: ${list("topic", s.topic)}` : "";
    lines.push(`Do not write an idea ${[withHooks, onTopics].filter(Boolean).join(", or ")}.`);
  }
  const d = focus.doubleDown;
  if (d.hook_type.length || d.topic.length) {
    lines.push(`Prefer ${sentence("prefer", d.hook_type, d.topic, " and ")}. Keep all five pillars.`);
  }
  return lines.length ? `## From the weekly review\n${lines.join("\n")}` : "";
}

/** The review block for a prompt: each list by its display label. `topics` adds labels for topics beyond the seed list. */
export function reviewBlock(focus: ActiveFocus, topics: { slug: string; label: string }[] = []): string {
  return focusBrief(focus, (d, v) => (d === "topic" ? topicLabel(v, topics) : (TAG_LABELS[v] ?? v)));
}

/** A calendar day (YYYY-MM-DD) plus n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The date a skip that starts on `startsOn` (YYYY-MM-DD) ends. */
export function skipEnd(startsOn: string): string {
  return addDays(startsOn, SKIP_DAYS);
}
