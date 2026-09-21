import type { NormalizedPost } from "./normalize";

export type Tier = "none" | "one data point" | "thin" | "usable";
export type TimeCell = { weekday: number; hour: number; count: number; score: number | null; tier: Tier };

/** Monday first, matching the plan's week. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const TIMEZONE = "America/Chicago";

const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short", hour: "numeric", hour12: false });

export function chicagoWeekdayHour(iso: string): { weekday: number; hour: number } {
  const parts = fmt.formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hr = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const weekday = WEEKDAYS.indexOf(wd as (typeof WEEKDAYS)[number]);
  return { weekday: weekday < 0 ? 0 : weekday, hour: hr };
}

/** The calendar date in Chicago for an instant, as YYYY-MM-DD. */
export function chicagoIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function tierFor(count: number): Tier {
  return count === 0 ? "none" : count === 1 ? "one data point" : count === 2 ? "thin" : "usable";
}

/** Weekday×hour buckets over the posted log, scored by mean normalized reach. */
export function bestTimes(posts: NormalizedPost[]): TimeCell[] {
  const sums = new Map<string, { count: number; total: number; scored: number }>();
  for (const p of posts) {
    const { weekday, hour } = chicagoWeekdayHour(p.posted_at);
    const key = `${weekday}:${hour}`;
    const cur = sums.get(key) ?? { count: 0, total: 0, scored: 0 };
    cur.count += 1;
    if (p.n_reach != null) {
      cur.total += p.n_reach;
      cur.scored += 1;
    }
    sums.set(key, cur);
  }
  const cells: TimeCell[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      const s = sums.get(`${weekday}:${hour}`);
      const count = s?.count ?? 0;
      cells.push({ weekday, hour, count, score: s && s.scored ? s.total / s.scored : null, tier: tierFor(count) });
    }
  }
  return cells;
}

const TIER_WEIGHT: Record<Tier, number> = { usable: 3, thin: 2, "one data point": 1, none: 0 };

/** The strongest cells first: more evidence beats a higher score on less. Deterministic. */
export function topCells(cells: TimeCell[], n: number): TimeCell[] {
  return cells
    .filter((c) => c.score != null)
    .sort(
      (a, b) =>
        TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier] || b.score! - a.score! || a.weekday - b.weekday || a.hour - b.hour
    )
    .slice(0, n);
}
