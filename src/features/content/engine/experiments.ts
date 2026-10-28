import type { PostScore, Status } from "./baseline";
import { CTA_TYPES, HOOK_TYPES, MESSAGES, ONSCREEN_TEXT, POST_STYLES, TAG_LABELS, type PostTags } from "./tags";
import { isEligible, type WinnerPost } from "./winners";

// Today: daily briefs as one-variable tests. Pure logic for the evidence counts,
// control recipe, picker, reason and verdict lives here; nothing in this file
// touches the database.

/** Every choice a brief can test: the six tags (cover is one) plus topic. */
export const VARIABLES = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover", "message", "topic"] as const;
/** The form choices a brief holds still at the control recipe. Message and topic come from the idea. */
export const HELD_STILL = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover"] as const;
export const EXPERIMENT_KINDS = ["proposed", "moment"] as const;
export const EXPERIMENT_STATUSES = ["open", "posted", "judged", "unjudged", "skipped", "discarded"] as const;
export const VERDICTS = ["won", "lost", "flat"] as const;
export const RUN_KINDS = ["cron", "swap", "moment"] as const;
export const RUN_STATUSES = ["pending", "ready", "failed"] as const;

export type Variable = (typeof VARIABLES)[number];
export type HeldStill = (typeof HELD_STILL)[number];
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type RunKind = (typeof RUN_KINDS)[number];

/** A value with fewer eligible posts than this is thin evidence: worth testing, not yet a rule. */
export const EXPLORE_BELOW = 5;
/** The tally marks a value with fewer eligible posts than this as thin. */
export const TALLY_THIN_BELOW = 3;

export type Outcome = "won" | "lost" | "flat";
/** Promising and Viral are wins, Lagging a loss, Normal flat; Pending and no status do not count. */
export function outcomeOf(status: Status | null): Outcome | null {
  if (status === "Promising" || status === "Viral") return "won";
  if (status === "Lagging") return "lost";
  if (status === "Normal") return "flat";
  return null;
}

const FACE = [true, false] as const;
/** The eight cover combinations, face first, none last. */
export const COVER_VALUES: readonly string[] = (() => {
  const out: string[] = [];
  for (const face of FACE) for (const text of FACE) for (const number of FACE) {
    const parts = [face && "face", text && "text", number && "number"].filter(Boolean) as string[];
    if (parts.length > 0) out.push(parts.join("+"));
  }
  return [...out.sort((a, b) => a.split("+").length - b.split("+").length || a.localeCompare(b)), "none"];
})();

export function coverValue(t: Pick<PostTags, "cover_face" | "cover_text" | "cover_number">): string | null {
  if (t.cover_face === null || t.cover_text === null || t.cover_number === null) return null;
  const parts = [t.cover_face && "face", t.cover_text && "text", t.cover_number && "number"].filter(Boolean) as string[];
  return parts.length === 0 ? "none" : parts.join("+");
}

export type Counted = Exclude<Variable, "topic">;
export const COUNTED: readonly Counted[] = [...HELD_STILL, "message"];

export const VARIABLE_LABEL: Record<Variable, string> = {
  hook_type: "Hook type",
  onscreen_text: "On-screen text",
  cta_type: "CTA",
  post_style: "Post style",
  cover: "Cover",
  message: "Message",
  topic: "Topic",
};

/** The slug or combination as the page words it. */
export const valueLabel = (value: string): string => TAG_LABELS[value] ?? value.replace(/^./, (c) => c.toUpperCase());

/** Every value a Reel brief can take for a variable. Reels never carry carousel or image. */
export function valuesOf(variable: Counted): readonly string[] {
  switch (variable) {
    case "hook_type": return HOOK_TYPES;
    case "onscreen_text": return ONSCREEN_TEXT;
    case "cta_type": return CTA_TYPES;
    case "post_style": return POST_STYLES.filter((s) => s !== "carousel" && s !== "image");
    case "message": return MESSAGES;
    case "cover": return COVER_VALUES;
  }
}

export type ValueCount = { value: string; won: number; lost: number; flat: number; total: number; share: number };
export type Evidence = Record<Counted, ValueCount[]>;

function tagOf(p: WinnerPost, variable: Counted): string | null {
  if (variable === "cover") return coverValue(p);
  const v = p[variable];
  return v === "" ? null : v;
}

/** Wins, losses and flats per value, over tagged Reels in the window whose views have settled enough to rank. */
export function evidenceCounts(posts: WinnerPost[], scores: Map<string, PostScore>, windowStart: Date): Evidence {
  const ev = Object.fromEntries(
    COUNTED.map((v) => [v, valuesOf(v).map((value) => ({ value, won: 0, lost: 0, flat: 0, total: 0, share: 0 }))])
  ) as Evidence;
  const since = windowStart.getTime();
  for (const p of posts) {
    if (p.media_type !== "reel" || p.tagged_at === null || new Date(p.posted_at).getTime() < since) continue;
    const s = scores.get(p.id);
    if (!s || !isEligible(s.multiplier)) continue;
    const outcome = outcomeOf(s.status);
    if (!outcome) continue;
    for (const variable of COUNTED) {
      const tag = tagOf(p, variable);
      const row = tag === null ? undefined : ev[variable].find((r) => r.value === tag);
      if (!row) continue;
      row[outcome] += 1;
      row.total += 1;
    }
  }
  for (const variable of COUNTED) for (const r of ev[variable]) r.share = r.total === 0 ? 0 : r.won / r.total;
  return ev;
}

/** Best win share among values with enough posts (ties to the larger count); else the most used; else the first listed. */
function bestValue(rows: ValueCount[]): string {
  const enough = rows.filter((r) => r.total >= EXPLORE_BELOW);
  if (enough.length > 0) {
    return enough.reduce((a, b) => (b.share > a.share || (b.share === a.share && b.total > a.total) ? b : a)).value;
  }
  return rows.reduce((a, b) => (b.total > a.total ? b : a)).value;
}

export type HeldControl = Record<HeldStill, string>;
export type Control = HeldControl;
export function controlRecipe(ev: Evidence): Control {
  return Object.fromEntries(HELD_STILL.map((v) => [v, bestValue(ev[v])])) as Control;
}

export type Test = { variable: Variable; value: string; control: string };
export type LiveTest = { variable: string; value: string };

/** Promising leads with thin evidence first; then untried values; topic only when nothing else is left. */
export function candidateTests(ev: Evidence, control: Control, live: LiveTest[]): Test[] {
  const held = new Set(live.map((l) => `${l.variable}:${l.value}`));
  const controls: Record<Counted, string> = { ...control, message: bestValue(ev.message) };
  const all = COUNTED.flatMap((variable) =>
    ev[variable]
      .filter((r) => r.value !== controls[variable] && !held.has(`${variable}:${r.value}`))
      .map((r) => ({ test: { variable, value: r.value, control: controls[variable] } as Test, row: r }))
  );
  const leads = all
    .filter((c) => c.row.won >= 1 && c.row.total < EXPLORE_BELOW)
    .sort((a, b) => b.row.share - a.row.share || a.row.total - b.row.total || COUNTED.indexOf(a.test.variable as Counted) - COUNTED.indexOf(b.test.variable as Counted));
  if (leads.length > 0) return leads.map((c) => c.test);
  const untried = all.filter((c) => c.row.total === 0);
  if (untried.length > 0) return untried.map((c) => c.test);
  return held.has("topic:new") ? [] : [{ variable: "topic", value: "new", control: "" }];
}

export type PlannedSlot = { slot: 1 | 2; test: Test; ideaId: string };

/** The day's control recipe and up to two tests on different variables, one per idea. */
export function pickDay(ev: Evidence, live: LiveTest[], ideaIds: string[]): { control: Control; slots: PlannedSlot[] } {
  const control = controlRecipe(ev);
  const candidates = candidateTests(ev, control, live);
  const slots: PlannedSlot[] = [];
  const first = candidates[0];
  if (first && ideaIds[0] !== undefined) {
    slots.push({ slot: 1, test: first, ideaId: ideaIds[0] });
    const second = candidates.find((c) => c.variable !== first.variable);
    if (second && ideaIds[1] !== undefined) slots.push({ slot: 2, test: second, ideaId: ideaIds[1] });
  }
  return { control, slots };
}

export function pickMoment(ev: Evidence, live: LiveTest[]): { control: Control; test: Test } | null {
  const control = controlRecipe(ev);
  const test = candidateTests(ev, control, live)[0];
  return test ? { control, test } : null;
}

export function renderReason(test: Test, ev: Evidence): string {
  if (test.variable === "topic") return "Every form choice has enough evidence; a fresh topic is the open question.";
  const row = ev[test.variable].find((r) => r.value === test.value);
  if (!row || row.total === 0) return "No post in the last 90 days has tried this.";
  const thin = row.total < EXPLORE_BELOW ? " That is thin evidence, so it is worth testing." : "";
  const usual = test.control ? ` ${valueLabel(test.control)} is your usual choice.` : "";
  return `${valueLabel(test.value)} won ${row.won} of ${row.total} Reels in the last 90 days.${thin}${usual}`;
}

export type TallyRow = { variable: Counted; label: string; values: (ValueCount & { thin: boolean })[] };
export function tallyRows(ev: Evidence): TallyRow[] {
  return COUNTED.map((variable) => ({
    variable,
    label: VARIABLE_LABEL[variable],
    values: ev[variable].filter((r) => r.total > 0).map((r) => ({ ...r, thin: r.total < TALLY_THIN_BELOW })),
  }));
}
