import { THIN_BASELINE_BELOW, WINDOW_DAYS, median } from "./baseline";
import { chicagoIsoDate } from "./best-times";

// Slice 6: competitor posts. Pure logic for the weekly pull's mapping, the per-creator
// median, popularity, freshness and the copy check; nothing here touches the database.

export const CREATOR_STATUSES = ["watching", "removed"] as const;
export const COMPETITOR_RUN_STATUSES = ["pending", "ready", "failed"] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];
export type CompetitorRunStatus = (typeof COMPETITOR_RUN_STATUSES)[number];


/** Apify's own cap on one weekly run, in dollars. */
export const COMPETITOR_WEEKLY_CAP_USD = 1;
export const COMPETITOR_RESULTS_LIMIT = 30;
/** A creator never pulled before gets 90 days; later pulls 21, which overlaps the last week's. */
export const FIRST_PULL_DAYS = 90;
export const REPULL_DAYS = 21;
/** A run still pending this long is marked failed. */
export const RUN_STALE_HOURS = 48;
/** A post seeds a brief only within this many days of posting. */
export const COMPETITOR_FRESH_DAYS = 14;
/** A brief sharing this many consecutive words with the competitor's text is a copy. */
export const COPY_RUN_WORDS = 6;

const DAY = 86_400_000;

export function normalizeUsername(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^instagram\.com\//, "");
  s = s.replace(/[/?#].*$/, "").replace(/^@/, "");
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

export type CompetitorPostIn = {
  shortcode: string;
  url: string;
  username: string;
  posted_at: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/**
 * Keeps a watched creator's own Reels inside their window. Apify's filters leak: collab
 * posts owned by another account and pinned old posts come back too, so both are checked here.
 */
export function mapApifyItems(items: unknown[], since: Map<string, Date>): CompetitorPostIn[] {
  const out: CompetitorPostIn[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const owner = str(it.ownerUsername)?.toLowerCase();
    const from = owner ? since.get(owner) : undefined;
    const shortcode = str(it.shortCode);
    const url = str(it.url);
    const postedAt = str(it.timestamp);
    if (!owner || !from || it.type !== "Video" || !shortcode || !url || !postedAt) continue;
    const t = new Date(postedAt).getTime();
    if (Number.isNaN(t) || t < from.getTime()) continue;
    out.push({
      shortcode,
      url,
      username: owner,
      posted_at: postedAt,
      caption: typeof it.caption === "string" ? it.caption : "",
      views: num(it.videoPlayCount),
      likes: num(it.likesCount),
      comments: num(it.commentsCount),
      duration_seconds: num(it.videoDuration),
      thumbnail_url: str(it.displayUrl),
    });
  }
  return out;
}

export function pullWindowDays(creators: { last_pulled_at: string | null }[]): number {
  return creators.some((c) => c.last_pulled_at === null) ? FIRST_PULL_DAYS : REPULL_DAYS;
}

export type CreatorMedian = { median: number | null; count: number; thin: boolean };

/** Median views of each creator's Reels posted in the last 90 days. */
export function creatorMedians(posts: { creator_id: string; posted_at: string; views: number | null }[], now: Date): Map<string, CreatorMedian> {
  const start = now.getTime() - WINDOW_DAYS * DAY;
  const views = new Map<string, number[]>();
  for (const p of posts) {
    if (p.views === null || new Date(p.posted_at).getTime() < start) continue;
    views.set(p.creator_id, [...(views.get(p.creator_id) ?? []), p.views]);
  }
  return new Map([...views].map(([id, vs]) => [id, { median: median(vs), count: vs.length, thin: vs.length < THIN_BASELINE_BELOW }]));
}

export function multipleOf(views: number | null, m: CreatorMedian | undefined): number | null {
  if (views === null || !m || m.median === null || m.median === 0) return null;
  return views / m.median;
}

/** Posted within 14 days of the Chicago day, both ends counted by calendar date. */
export function isFresh(postedAt: string, day: string): boolean {
  const posted = Date.parse(`${chicagoIsoDate(new Date(postedAt))}T00:00:00Z`);
  return Date.parse(`${day}T00:00:00Z`) - posted <= COMPETITOR_FRESH_DAYS * DAY;
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

export function sharesCopiedRun(text: string, sources: string[], n = COPY_RUN_WORDS): boolean {
  const w = words(text);
  const runs = new Set<string>();
  for (const src of sources) {
    const s = words(src);
    for (let i = 0; i + n <= s.length; i++) runs.add(s.slice(i, i + n).join(" "));
  }
  for (let i = 0; i + n <= w.length; i++) if (runs.has(w.slice(i, i + n).join(" "))) return true;
  return false;
}
