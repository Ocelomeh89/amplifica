import { median, viewsAtOrAfter, type SeriesPoint } from "./baseline";
import type { ExtraOutcome } from "./focus";

// Trial Reel tests (slice B): the constants shared by the migration, the picker and the verdict.
// Pure. Migration 0022 mirrors these lists; its test asserts they match.

export const TEST_KINDS = ["opening", "card", "topic"] as const;
export const TEST_VARIABLES = ["hook_type", "onscreen_text", "topic"] as const;
export const TEST_STATUSES = ["proposing", "open", "judged", "skipped", "not_run", "failed"] as const;
export const TEST_VERDICTS = ["a", "b", "none"] as const;
export const TEST_TRIGGERS = ["routine", "button"] as const;

export type TestKind = (typeof TEST_KINDS)[number];
export type TestVariable = (typeof TEST_VARIABLES)[number];
export type TestStatus = (typeof TEST_STATUSES)[number];
export type TestVerdict = (typeof TEST_VERDICTS)[number];
export type TestTrigger = (typeof TEST_TRIGGERS)[number];
export type VersionLabel = "a" | "b";

// ---- The numbers that decide a test (constants, spec Decisions 5 to 7) ----

/** One version wins with this ratio over the other, and at least `WIN_MIN_VIEWS` views. */
export const WIN_RATIO = 1.5;
export const WIN_MIN_VIEWS = 1000;
/** Promote: at least this many views and this many times the median 24-hour views of Miguel's normal Reels. */
export const PROMOTE_MULTIPLE = 3;
export const PROMOTE_MIN_VIEWS = 1000;
export const READ_AFTER_HOURS = 24;
export const NOT_RUN_DAYS = 14;
export const NO_READING_DAYS = 7;
export const PROPOSALS_PER_DAY = 3;
export const STALE_PROPOSING_MINUTES = 10;
export const MAX_DROPPED = 3;
export const DOUBLE_DOWN_MIN_WEEKS = 4;
export const PAIR_REPEAT_DAYS = 90;
export const LINK_WINDOW_DAYS = 7;
export const PROMOTE_LINE = "Worth sharing to your followers.";

const DAY = 86_400_000;

/** `a` or `b` when that version has at least 1.5 times the other's views and at least 1,000; otherwise `none`. */
export function testVerdict(a: number, b: number): TestVerdict {
  if (a >= WIN_MIN_VIEWS && a >= WIN_RATIO * b) return "a";
  if (b >= WIN_MIN_VIEWS && b >= WIN_RATIO * a) return "b";
  return "none";
}

export function shouldPromote(views: number, median24h: number | null): boolean {
  if (median24h === null || median24h <= 0) return false;
  return views >= PROMOTE_MIN_VIEWS && views >= PROMOTE_MULTIPLE * median24h;
}

/** Both versions are read from the later post, so one cron run reads both at the same age. */
export function readingStart(postedA: string, postedB: string): string {
  return new Date(postedA).getTime() >= new Date(postedB).getTime() ? postedA : postedB;
}

/** The median first reading at or after 24 hours of each Reel; Reels with none are skipped. */
export function median24h(reels: { posted_at: string; series: SeriesPoint[] }[]): number | null {
  const views: number[] = [];
  for (const r of reels) {
    const v = viewsAtOrAfter(r.series, r.posted_at, READ_AFTER_HOURS);
    if (v) views.push(v.views);
  }
  return median(views);
}

/** Why an open test should close as "not run", or null while it is still waiting. `linked` counts versions with a post or numbers. */
export function staleReason(t: { opened_at: string; linked: number; laterPostedAt: string | null }, now: Date): string | null {
  if (t.linked < 2) {
    return now.getTime() - new Date(t.opened_at).getTime() >= NOT_RUN_DAYS * DAY ? "No post was linked within 14 days." : null;
  }
  if (t.laterPostedAt && now.getTime() - new Date(t.laterPostedAt).getTime() >= NO_READING_DAYS * DAY) return "No 24-hour number arrived.";
  return null;
}

const num = (n: number) => n.toLocaleString("en-US");

export function verdictLine(t: {
  variable: TestVariable;
  a: { label: string; views: number };
  b: { label: string; views: number };
  verdict: TestVerdict;
}): string {
  if (t.verdict === "a") return `${t.a.label} won: ${num(t.a.views)} views against ${num(t.b.views)} in the first day.`;
  if (t.verdict === "b") return `${t.b.label} won: ${num(t.b.views)} views against ${num(t.a.views)} in the first day.`;
  return `No clear winner: ${num(t.a.views)} views against ${num(t.b.views)} in the first day.`;
}

/** What a judged test adds to the evidence counts: a win and a loss, or a flat for each value. */
export function outcomesOf(t: {
  variable: TestVariable;
  value_a: string;
  value_b: string;
  verdict: TestVerdict;
  judged_at: string;
}): ExtraOutcome[] {
  const at = t.judged_at;
  const mk = (value: string, outcome: ExtraOutcome["outcome"]): ExtraOutcome => ({ variable: t.variable, value, outcome, at });
  if (t.verdict === "a") return [mk(t.value_a, "won"), mk(t.value_b, "lost")];
  if (t.verdict === "b") return [mk(t.value_a, "lost"), mk(t.value_b, "won")];
  return [mk(t.value_a, "flat"), mk(t.value_b, "flat")];
}

/**
 * What Miguel still owes an open test, for the review. `linked` counts versions that have a post or numbers.
 * `mode` is how a version gets its reading: "numbers" (typed from Instagram, while a Trial Reel is not in the
 * pull) or "link" (a post picked from the pull).
 */
export function owesOf(linked: 0 | 1 | 2, mode: "numbers" | "link" = "numbers"): string[] {
  if (linked === 2) return ["Nothing. The result arrives a day after posting."];
  if (mode === "link") return linked === 0 ? ["Record and post both versions", "Link the two posts on the Tests page"] : ["Link the other version's post"];
  return linked === 0
    ? ["Record and post both versions", "Type their numbers on the Tests page a day after posting"]
    : ["Type the other version's numbers"];
}
