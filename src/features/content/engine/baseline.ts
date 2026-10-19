import type { Platform } from "./types";

// Views baselines: one window, one grouping, compared at the same post age.
// Spec: docs/superpowers/specs/2026-10-18-content-engine-baselines-and-status-design.md

export const WINDOW_DAYS = 90;
export const THIN_BASELINE_BELOW = 8;
export const PENDING_HOURS = 48;
export const SETTLED_MIN_AGE_DAYS = 14;
export const CANONICAL_DAY = 7;
export const DAY_TOLERANCE_HOURS = 18;
export const LAGGING_BELOW = 0.5;
export const PROMISING_FROM = 1.5;
export const VIRAL_FROM = 3;
export const EVERGREEN_MIN_AGE_DAYS = 28;
export const EVERGREEN_DAY = 14;
export const EVERGREEN_LATE_SHARE = 0.2;

const HOUR = 3_600_000;

export type SeriesPoint = { at: string; views: number | null };
export type PostForBaseline = {
  id: string;
  platform: Platform;
  format: string;
  media_type: string;
  posted_at: string;
  series: SeriesPoint[];
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear interpolation between closest ranks; `percentile(xs, 50)` equals `median(xs)`. */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const rank = ((s.length - 1) * p) / 100;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

/** Instagram groups by media type, everything else by format. */
export function baselineGroup(p: { platform: Platform; format: string; media_type: string }): string {
  if (p.platform === "instagram") return `instagram:${p.media_type || "unknown"}`;
  return `${p.platform}:${p.format}`;
}

const isNum = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);

/** The newest point that carries a number, so one failed insights call does not erase a post. */
export function latestViews(series: SeriesPoint[]): number | null {
  let best: SeriesPoint | null = null;
  for (const p of series) {
    if (!isNum(p.views)) continue;
    if (!best || p.at > best.at) best = p;
  }
  return best ? best.views : null;
}

/** Views at the snapshot nearest `posted_at + day` days, within the tolerance; ties go to the earlier one. */
export function dayViews(series: SeriesPoint[], postedAt: string, day: number): number | null {
  const target = new Date(postedAt).getTime() + day * 24 * HOUR;
  let best: { dist: number; at: number; views: number } | null = null;
  for (const p of series) {
    if (!isNum(p.views)) continue;
    const at = new Date(p.at).getTime();
    const dist = Math.abs(at - target);
    if (!best || dist < best.dist || (dist === best.dist && at < best.at)) best = { dist, at, views: p.views };
  }
  return best && best.dist <= DAY_TOLERANCE_HOURS * HOUR ? best.views : null;
}

export function ageHours(postedAt: string, now: Date): number {
  return (now.getTime() - new Date(postedAt).getTime()) / HOUR;
}

export type Sample = { median: number | null; count: number; thin: boolean };
export type GroupBaseline = {
  group: string;
  /** Settled posts: in the window, at least SETTLED_MIN_AGE_DAYS old, with views. */
  count: number;
  thin: boolean;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  /** Median views at day N (2 through 7) across posts in the window that have one. */
  day: Record<number, Sample>;
};

const DAYS = [2, 3, 4, 5, 6, 7] as const;

export function viewsBaselines(posts: PostForBaseline[], now: Date): Map<string, GroupBaseline> {
  const since = now.getTime() - WINDOW_DAYS * 24 * HOUR;
  const byGroup = new Map<string, PostForBaseline[]>();
  for (const p of posts) {
    if (new Date(p.posted_at).getTime() < since) continue;
    const g = baselineGroup(p);
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  const out = new Map<string, GroupBaseline>();
  for (const [group, members] of byGroup) {
    const settled: number[] = [];
    for (const p of members) {
      const v = latestViews(p.series);
      if (v !== null && ageHours(p.posted_at, now) / 24 >= SETTLED_MIN_AGE_DAYS) settled.push(v);
    }
    const day: Record<number, Sample> = {};
    for (const n of DAYS) {
      const vals = members.map((p) => dayViews(p.series, p.posted_at, n)).filter(isNum);
      day[n] = { median: median(vals), count: vals.length, thin: vals.length < THIN_BASELINE_BELOW };
    }
    out.set(group, {
      group,
      count: settled.length,
      thin: settled.length < THIN_BASELINE_BELOW,
      p25: percentile(settled, 25),
      p50: percentile(settled, 50),
      p75: percentile(settled, 75),
      p90: percentile(settled, 90),
      day,
    });
  }
  return out;
}

export type MultiplierMode = "pending" | "matched" | "settled" | "none";
export type Multiplier = { n_views: number | null; mode: MultiplierMode; day: number | null; thin: boolean };

/** Views against the typical post at the same age; the settled median only for posts with no matched value. */
export function viewsMultiplier(post: PostForBaseline, baseline: GroupBaseline | undefined, now: Date): Multiplier {
  const hours = ageHours(post.posted_at, now);
  if (hours < PENDING_HOURS) return { n_views: null, mode: "pending", day: null, thin: false };
  const ageDays = Math.floor(hours / 24);
  const none: Multiplier = { n_views: null, mode: "none", day: null, thin: false };
  if (!baseline) return none;
  const n = Math.min(ageDays, CANONICAL_DAY);
  const sample = baseline.day[n];
  const atDay = dayViews(post.series, post.posted_at, n);
  if (atDay !== null && sample?.median != null && sample.median > 0) {
    return { n_views: atDay / sample.median, mode: "matched", day: n, thin: sample.thin };
  }
  const latest = latestViews(post.series);
  if (ageDays >= SETTLED_MIN_AGE_DAYS && latest !== null && baseline.p50 != null && baseline.p50 > 0) {
    return { n_views: latest / baseline.p50, mode: "settled", day: null, thin: baseline.thin };
  }
  return none;
}

export type Status = "Pending" | "Lagging" | "Normal" | "Promising" | "Viral";

export function statusOf(m: Multiplier): Status | null {
  if (m.mode === "pending") return "Pending";
  if (m.mode === "none" || m.n_views === null) return null;
  if (m.n_views < LAGGING_BELOW) return "Lagging";
  if (m.n_views < PROMISING_FROM) return "Normal";
  if (m.n_views < VIRAL_FROM) return "Promising";
  return "Viral";
}

/** A fifth or more of the views arrived after day 14, on a post at least 28 days old. */
export function isEvergreen(post: PostForBaseline, now: Date): boolean {
  if (ageHours(post.posted_at, now) / 24 < EVERGREEN_MIN_AGE_DAYS) return false;
  const latest = latestViews(post.series);
  const early = dayViews(post.series, post.posted_at, EVERGREEN_DAY);
  if (latest === null || early === null || latest <= 0) return false;
  return (latest - early) / latest >= EVERGREEN_LATE_SHARE;
}

export type PostScore = {
  id: string;
  group: string;
  views: number | null;
  multiplier: Multiplier;
  status: Status | null;
  evergreen: boolean;
};

export function scorePosts(posts: PostForBaseline[], now: Date): { baselines: Map<string, GroupBaseline>; scores: PostScore[] } {
  const baselines = viewsBaselines(posts, now);
  const scores = posts.map((p): PostScore => {
    const group = baselineGroup(p);
    const multiplier = viewsMultiplier(p, baselines.get(group), now);
    return { id: p.id, group, views: latestViews(p.series), multiplier, status: statusOf(multiplier), evergreen: isEvergreen(p, now) };
  });
  return { baselines, scores };
}
