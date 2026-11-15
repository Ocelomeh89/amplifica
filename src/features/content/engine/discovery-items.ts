import { mapApifyItems, normalizeUsername } from "./competitors";
import { SAMPLE_REELS, type SampleReel } from "./discovery";

// Slice C: Apify inputs and mappers for creator discovery. Actor ids and field names were
// recorded in the 2026-11-14 spike (see the plan's "Spike result" and the fixtures in
// data/pulls/fixtures/discovery-*.json). The Reel run is the weekly pull's actor,
// apify~instagram-post-scraper, asked for 12 posts per account.

export const PROFILE_ACTOR = "apify~instagram-profile-scraper";
export const SEARCH_ACTOR = "apify~instagram-search-scraper";
/** Two to three word phrases only: a long phrase returned no items in the spike. */
export const SEARCH_PHRASES = ["financial freedom", "private lending", "cash flow investing"] as const;

export function profilesInput(usernames: string[]): Record<string, unknown> {
  return { usernames };
}

export function reelsInput(usernames: string[]): Record<string, unknown> {
  return { username: usernames, resultsLimit: SAMPLE_REELS, dataDetailLevel: "detailedData", skipPinnedPosts: true };
}

export function searchInput(phrase: string): Record<string, unknown> {
  return { search: phrase, searchType: "user", searchLimit: 30 };
}

export type ProfileIn = { username: string; followers: number | null; bio: string; related: { username: string; followers: number | null }[] };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function mapProfileItems(items: unknown[]): ProfileIn[] {
  const out: ProfileIn[] = [];
  for (const raw of items) {
    const it = obj(raw);
    const username = typeof it?.username === "string" ? normalizeUsername(it.username) : null;
    if (!it || !username) continue;
    const related = Array.isArray(it.relatedProfiles)
      ? it.relatedProfiles.flatMap((r) => {
          const rel = obj(r);
          const name = typeof rel?.username === "string" ? normalizeUsername(rel.username) : null;
          return rel && name ? [{ username: name, followers: num(rel.followersCount) }] : [];
        })
      : [];
    out.push({ username, followers: num(it.followersCount), bio: typeof it.biography === "string" ? it.biography : "", related });
  }
  return out;
}

/**
 * Reels only, owned by a listed username, newest first, 12 at most each. This actor reports
 * views as videoViewCount (the weekly pull's mapper reads videoPlayCount), so the one is
 * copied into the other before mapping.
 */
export function mapSampleItems(items: unknown[], usernames: string[]): Map<string, SampleReel[]> {
  const epoch = new Date(0);
  const wanted = usernames.map((u) => u.toLowerCase());
  const since = new Map(wanted.map((u) => [u, epoch]));
  const prepared = items.map((raw) => {
    const it = obj(raw);
    if (!it) return raw;
    const shortCode = typeof it.shortCode === "string" ? it.shortCode : null;
    return {
      ...it,
      url: typeof it.url === "string" && it.url ? it.url : shortCode ? `https://www.instagram.com/p/${shortCode}/` : undefined,
      videoPlayCount: num(it.videoViewCount) ?? num(it.videoPlayCount),
    };
  });
  const out = new Map<string, SampleReel[]>(wanted.map((u) => [u, []]));
  for (const p of mapApifyItems(prepared, since)) {
    out.get(p.username)?.push({ shortcode: p.shortcode, url: p.url, posted_at: p.posted_at, views: p.views, caption: p.caption });
  }
  for (const [u, reels] of out) out.set(u, reels.sort((a, b) => b.posted_at.localeCompare(a.posted_at)).slice(0, SAMPLE_REELS));
  return out;
}

export type SearchFound = { username: string; found_via: string; followers: number | null; isPrivate: boolean };

/** User-search rows carry their own follower count, so no sizing run is needed. Error rows are skipped. */
export function mapSearchItems(items: unknown[], phrase: string): SearchFound[] {
  const out: SearchFound[] = [];
  for (const raw of items) {
    const it = obj(raw);
    const username = typeof it?.username === "string" ? normalizeUsername(it.username) : null;
    if (!it || !username || it.error) continue;
    out.push({ username, found_via: foundVia("keywords", phrase), followers: num(it.followersCount), isPrivate: it.private === true });
  }
  return out;
}

export function foundVia(source: "related" | "mentions" | "keywords", from: string): string {
  if (source === "related") return `related to ${from}`;
  if (source === "mentions") return `tagged by ${from}`;
  return `search: ${from}`;
}
