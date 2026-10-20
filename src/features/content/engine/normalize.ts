import type { MetricSnapshot, Platform } from "./types";

/** What the performance math needs from a post: identity, grouping fields, and its snapshots. */
export type PostForMath = {
  id: string;
  platform: Platform;
  format: string;
  media_type: string;
  pillar: string;
  hook_type: string;
  hook_used: string;
  posted_at: string;
  /** Latest snapshot. */
  metrics: MetricSnapshot;
  /** Earliest snapshot, or null when there is only one. Its reach stands in for 24-hour reach. */
  first: MetricSnapshot | null;
};

export type NormalizedPost = PostForMath & {
  reach: number | null;
  saves_rate: number | null;
  shares_rate: number | null;
  watch_s: number | null;
  /** Each rate divided by the 90-day median of the same baseline group; null without a baseline. */
  n_saves: number | null;
  n_shares: number | null;
  n_watch: number | null;
  n_reach: number | null;
};

import { WINDOW_DAYS, baselineGroup, median } from "./baseline";

export { median };

export function rate(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den <= 0) return null;
  return num / den;
}

function ratio(x: number | null, base: number | null): number | null {
  if (x == null || base == null || base <= 0) return null;
  return x / base;
}

const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function reachOf(m: MetricSnapshot): number | null {
  return num(m.reach) ?? num(m.views);
}

/**
 * Rates per post, then each rate divided by the rolling median of the same
 * baseline group (see `baselineGroup`) over the last `windowDays`. Every post is normalized,
 * even old ones, against the current baseline, so the table can show history.
 */
export function normalizePosts(posts: PostForMath[], now: Date, windowDays = WINDOW_DAYS): NormalizedPost[] {
  const since = now.getTime() - windowDays * 86_400_000;
  const withRates = posts.map((p) => {
    const reach = reachOf(p.metrics);
    const firstReach = p.first ? reachOf(p.first) : null;
    return {
      ...p,
      reach,
      saves_rate: rate(num(p.metrics.saves), reach),
      shares_rate: rate(num(p.metrics.shares), reach),
      watch_s: num(p.metrics.avg_watch_time_s),
      reach24: firstReach ?? reach,
    };
  });

  const groupKey = baselineGroup;
  const baselines = new Map<string, { saves: number | null; shares: number | null; watch: number | null; reach: number | null }>();
  for (const p of withRates) {
    const key = groupKey(p);
    if (baselines.has(key)) continue;
    const inWindow = withRates.filter((q) => groupKey(q) === key && new Date(q.posted_at).getTime() >= since);
    const pick = (f: (q: (typeof withRates)[number]) => number | null) =>
      median(inWindow.map(f).filter((x): x is number => x != null));
    baselines.set(key, {
      saves: pick((q) => q.saves_rate),
      shares: pick((q) => q.shares_rate),
      watch: pick((q) => q.watch_s),
      reach: pick((q) => q.reach24),
    });
  }

  return withRates.map(({ reach24, ...p }) => {
    const b = baselines.get(groupKey(p))!;
    return {
      ...p,
      n_saves: ratio(p.saves_rate, b.saves),
      n_shares: ratio(p.shares_rate, b.shares),
      n_watch: ratio(p.watch_s, b.watch),
      n_reach: ratio(reach24, b.reach),
    };
  });
}
