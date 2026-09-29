// Enumerations shared by the schema, the actions, and the UI. The database
// check constraints in migration 0008 are the source of truth; these mirror
// them so a typo is a compile error rather than a 23514 at runtime.

export const FORMATS = ["reel", "youtube", "newsletter", "story", "x"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  reel: "Reel",
  youtube: "YouTube",
  newsletter: "Newsletter",
  story: "Story",
  x: "X",
};

export const SOURCE_KINDS = [
  "granola",
  "wispr",
  "plaud",
  "vault",
  "url",
  "upload",
  "comment",
  "scan",
  "manual",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_STATUSES = ["allowed", "denied", "pending", "mined"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const IDEA_STATUSES = ["inbox", "queued", "rejected", "posted", "archived"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const PLATFORMS = ["instagram", "youtube", "beehiiv", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** One beat of an outline: what happens, and optionally what is on screen. */
export type OutlineBeat = { beat: string; note?: string };

/** Metric keys stored per snapshot (spec "Metric keys"). Null when a platform does not report one. */
export const METRIC_KEYS = [
  "views",
  "reach",
  "impressions",
  "likes",
  "comments",
  "saves",
  "shares",
  "avg_watch_time_s",
  "profile_visits",
  "follows",
  "opens",
  "open_rate",
  "clicks",
  "click_rate",
  "unsubscribes",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export type MetricSnapshot = Partial<Record<MetricKey, number | null>>;
