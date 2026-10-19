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
