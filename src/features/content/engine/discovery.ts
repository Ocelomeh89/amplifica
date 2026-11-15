import { VIRAL_FROM, median } from "./baseline";
import { normalizeUsername } from "./competitors";

// Slice C: creator suggestions. Pure rules for finding creators 2x to 20x Miguel's size
// whose audience looks like Daniel or Stephen. Nothing here touches the database.

export const CANDIDATE_OUTCOMES = [
  "gathered",
  "sized",
  "sampled",
  "fit",
  "suggested",
  "out_of_band",
  "unreadable",
  "quiet",
  "neither",
  "low_confidence",
  "matched_decline",
  "no_room",
  "lapsed",
] as const;
export type CandidateOutcome = (typeof CANDIDATE_OUTCOMES)[number];

/** Looked at and set aside; remembered for CANDIDATE_MEMORY_DAYS. */
export const DROPPED_OUTCOMES: readonly CandidateOutcome[] = [
  "out_of_band",
  "unreadable",
  "quiet",
  "neither",
  "low_confidence",
  "matched_decline",
  "no_room",
  "lapsed",
];
/** Still moving through the pipeline. */
export const IN_PIPELINE: readonly CandidateOutcome[] = ["gathered", "sized", "sampled", "fit"];

export const DISCOVERY_RUN_KINDS = ["gather", "size", "sample"] as const;
export type DiscoveryRunKind = (typeof DISCOVERY_RUN_KINDS)[number];
export const DISCOVERY_TRIGGERS = ["cron", "routine", "button"] as const;

// Constants. Every number below is pinned by the design; change one here and nowhere else.
export const BAND_MIN_MULTIPLE = 2;
export const BAND_MAX_MULTIPLE = 20;
export const FOLLOWER_COUNT_MAX_AGE_DAYS = 14;
export const SAMPLE_MAX_CANDIDATES = 10;
export const SAMPLE_REELS = 12;
export const ACTIVE_MIN_REELS = 4;
export const ACTIVE_WINDOW_DAYS = 30;
export const MIN_CONFIDENCE = 3;
export const MAX_WAITING = 3;
export const LAPSE_DAYS = 28;
export const CANDIDATE_MEMORY_DAYS = 90;
export const DECLINE_REASONS_IN_PROMPT = 20;
/** Separate from COMPETITOR_WEEKLY_CAP_USD: discovery never eats the pull's dollar. */
export const DISCOVERY_WEEKLY_CAP_USD = 1;
export const DISCOVERY_MIN_RUN_USD = 0.05;
export const FIND_NOW_DAILY_CAP = 3;
export const BEST_REEL_MIN_MULTIPLE = 1.5;
export const BEST_REELS_SHOWN = 2;
export const SIZE_MAX_PROFILES = 30;
export const JUDGE_MAX_ATTEMPTS = 2;
export const DECLINE_CHIPS = ["wrong audience", "too salesy", "not my lane", "too big or too small"] as const;

// From the 2026-11-14 spike (see the plan's "Spike result"): the keyword search won.
export const OWN_INSTAGRAM_USERNAME = "amplificawealth";
export const DISCOVERY_SOURCES = ["keywords"] as const;
export const DISCOVERY_HOPS: 1 | 2 = 1;

export type SampleReel = { shortcode: string; url: string; posted_at: string; views: number | null; caption: string };

const DAY_MS = 86_400_000;

export function inBand(followers: number, own: number): boolean {
  return followers >= own * BAND_MIN_MULTIPLE && followers <= own * BAND_MAX_MULTIPLE;
}

export function sizeOutcome(followers: number | null, own: number): "sized" | "out_of_band" | "unreadable" {
  if (followers === null) return "unreadable";
  return inBand(followers, own) ? "sized" : "out_of_band";
}

/** Both dates are `YYYY-MM-DD`. Fresh through the 14th day, stale on the 15th. */
export function followerCountIsFresh(day: string, today: string): boolean {
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS;
  return age <= FOLLOWER_COUNT_MAX_AGE_DAYS;
}

export function slotsFree(waiting: number): number {
  return Math.max(0, MAX_WAITING - waiting);
}

/** A run counts its cost when known, else its cap, pending or failed alike. */
export function budgetLeft(runs: { status: string; cap_usd: number; cost_usd: number | null }[]): number {
  const spent = runs.reduce((sum, r) => sum + (r.cost_usd ?? r.cap_usd), 0);
  return Math.max(0, DISCOVERY_WEEKLY_CAP_USD - spent);
}

export function isLapsed(suggestedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(suggestedAt) > LAPSE_DAYS * DAY_MS;
}

export function canLookAgain(lookedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(lookedAt) >= CANDIDATE_MEMORY_DAYS * DAY_MS;
}

/**
 * Accounts worth gathering: not Miguel, not a creator in any status, not in the pipeline,
 * and not looked at inside the memory window. Usernames are normalized; the first
 * `found_via` of a duplicate wins.
 */
export function newCandidates(
  found: { username: string; found_via: string }[],
  known: { creators: Set<string>; memory: Map<string, { outcome: CandidateOutcome; looked_at: string }> },
  now: Date,
): { username: string; found_via: string }[] {
  const seen = new Set<string>();
  const out: { username: string; found_via: string }[] = [];
  for (const f of found) {
    const username = normalizeUsername(f.username);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    if (username === OWN_INSTAGRAM_USERNAME || known.creators.has(username)) continue;
    const seenBefore = known.memory.get(username);
    if (seenBefore) {
      const waiting = IN_PIPELINE.includes(seenBefore.outcome) || seenBefore.outcome === "suggested";
      if (waiting || !canLookAgain(seenBefore.looked_at, now)) continue;
    }
    out.push({ username, found_via: f.found_via });
  }
  return out;
}

/** The account is posting Reels now: at least 4 in the last 30 days. */
export function isActive(sample: SampleReel[], now: Date): boolean {
  const since = now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS;
  return sample.filter((r) => Date.parse(r.posted_at) >= since).length >= ACTIVE_MIN_REELS;
}

export function sampleMedian(sample: SampleReel[]): number | null {
  return median(sample.flatMap((r) => (r.views === null ? [] : [r.views])));
}

/** Reels at VIRAL_FROM times the sample median or more; 0 when the median is null or 0. */
export function popularCount(sample: SampleReel[]): number {
  const m = sampleMedian(sample);
  if (!m) return 0;
  return sample.filter((r) => r.views !== null && r.views >= m * VIRAL_FROM).length;
}

/** At most two Reels at 1.5x the sample median or more, best first. */
export function bestReels(sample: SampleReel[]): { url: string; multiple: number }[] {
  const m = sampleMedian(sample);
  if (!m) return [];
  return sample
    .flatMap((r) => (r.views === null ? [] : [{ url: r.url, multiple: r.views / m }]))
    .filter((r) => r.multiple >= BEST_REEL_MIN_MULTIPLE)
    .sort((a, b) => b.multiple - a.multiple)
    .slice(0, BEST_REELS_SHOWN);
}

export function rankFits<T extends { confidence: number; popular_count: number; username: string }>(fits: T[]): T[] {
  return [...fits].sort((a, b) => b.confidence - a.confidence || b.popular_count - a.popular_count || a.username.localeCompare(b.username));
}

export function nextRunKind(a: { gathered: number; sized: number; ranThisWeek: DiscoveryRunKind[]; hops: 1 | 2; canGather: boolean }): DiscoveryRunKind | null {
  const ran = (k: DiscoveryRunKind) => a.ranThisWeek.filter((r) => r === k).length;
  if (a.gathered > 0 && ran("size") < a.hops) return "size";
  if (a.sized > 0 && ran("sample") === 0) return "sample";
  if (a.ranThisWeek.length === 0 && a.canGather) return "gather";
  return null;
}

function compact(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${String(Math.round(n / 100) / 10)}k`;
  return String(n);
}

/** "48k followers, 6x yours". */
export function followersLine(followers: number, own: number): string {
  const m = own > 0 ? followers / own : 0;
  const multiple = m >= 10 || Number.isInteger(m) ? String(Math.round(m)) : (Math.round(m * 10) / 10).toFixed(1);
  return `${compact(followers)} followers, ${multiple}x yours`;
}

export function bioLine(bio: string): string {
  return bio.split("\n")[0].trim().slice(0, 120);
}
