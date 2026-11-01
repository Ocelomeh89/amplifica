import { VIRAL_FROM } from "@/features/content/engine/baseline";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  COMPETITOR_TAG_MODEL,
  COMPETITOR_TAG_TOOL,
  competitorTagSchema,
  competitorTagSystemPrompt,
  competitorTagToolSchema,
  renderCompetitorTagTurn,
  type CompetitorTagsOut,
} from "@/features/content/engine/competitor-tags";
import {
  FIRST_PULL_DAYS,
  REPULL_DAYS,
  RUN_STALE_HOURS,
  creatorMedians,
  isFresh,
  mapApifyItems,
  multipleOf,
  normalizeUsername,
  pullWindowDays,
  type CompetitorPostIn,
  type CreatorMedian,
} from "@/features/content/engine/competitors";
import type { ToolCaller } from "./claude";
import type { ApifyClient } from "./pulls/apify";
import { TODAY_MIN_SECONDS } from "./today";

// Slice 6: watched creators and their Reels. Everything here runs against CompetitorsDb
// and ApifyClient so the flow is tested without a database or a scrape. The cron entry
// points never throw for one bad run or post; they report and move on.

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Popular, fresh posts tagged per cron, at most. */
export const TAG_PER_RUN = 5;
/** Seconds one tagging call is allowed, on top of what the Today tail keeps. */
export const TAG_SECONDS = 45;

export type CreatorRow = { id: string; username: string; status: "watching" | "removed"; last_pulled_at: string | null; last_pull_status: "ready" | "failed" | null };
export type CompetitorRunRow = {
  id: string;
  apify_run_id: string;
  status: "pending" | "ready" | "failed";
  error: string;
  started_at: string;
  finished_at: string | null;
  cost_usd: number | null;
  items: number | null;
};
export type CompetitorTagColumns = {
  hook_type: string;
  onscreen_text: string;
  cover_face: boolean | null;
  cover_text: boolean | null;
  cover_number: boolean | null;
  cta_type: string;
  post_style: string;
  message: string;
  hook_text: string;
  tag_confidence: Record<string, number>;
  pushes_belief: string | null;
  format_note: string | null;
};
export type CompetitorPostRow = CompetitorPostIn & CompetitorTagColumns & { id: string; creator_id: string; tagged_at: string | null; briefed_at: string | null };

export type PopularPost = { id: string; url: string; posted_at: string; multiple: number; briefed: boolean };
export type CreatorsPage = { creators: (CreatorRow & CreatorMedian & { popular: PopularPost[] })[]; lastRun: CompetitorRunRow | null };

export interface CompetitorsDb {
  creators(): Promise<CreatorRow[]>;
  /** Insert, or set an existing creator back to watching. */
  upsertCreator(username: string): Promise<void>;
  removeCreator(id: string): Promise<void>;
  setCreatorPull(ids: string[], at: string, status: "ready" | "failed"): Promise<void>;
  latestRun(): Promise<CompetitorRunRow | null>;
  pendingRuns(): Promise<CompetitorRunRow[]>;
  insertRun(apifyRunId: string, startedAt: string): Promise<string>;
  updateRun(id: string, patch: Partial<Omit<CompetitorRunRow, "id" | "apify_run_id" | "started_at">>): Promise<void>;
  /** Insert, or update views, likes, comments, thumbnail and pulled_at on an existing shortcode. Returns rows written. */
  upsertPosts(posts: (CompetitorPostIn & { creator_id: string })[], pulledAt: string): Promise<number>;
  /** Every stored post since the instant, for the per-creator medians. */
  postsForMedians(since: string): Promise<{ creator_id: string; posted_at: string; views: number | null }[]>;
  /** Untagged posts of watching creators posted since the instant. */
  untaggedRecent(since: string): Promise<CompetitorPostRow[]>;
  saveTags(postId: string, tags: CompetitorTagsOut, at: string): Promise<void>;
  /** Posts of every creator since the instant, for the Creators page. */
  recentPosts(since: string): Promise<CompetitorPostRow[]>;
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");
const isMonday = (now: Date) => new Date(`${chicagoIsoDate(now)}T12:00:00Z`).getUTCDay() === 1;

export async function addCreator(db: CompetitorsDb, raw: string): Promise<{ error: string | null }> {
  const username = normalizeUsername(raw);
  if (!username) return { error: "That isn't an Instagram username." };
  await db.upsertCreator(username);
  return { error: null };
}

/** Monday (or forced): one Apify run for every watching creator. Never while a run is pending. */
export async function startWeeklyPull(db: CompetitorsDb, apify: ApifyClient, now: Date, force: boolean): Promise<{ started: boolean; error: string | null }> {
  try {
    const watching = (await db.creators()).filter((c) => c.status === "watching");
    if (watching.length === 0) return { started: false, error: null };
    if ((await db.pendingRuns()).length > 0) return { started: false, error: null };
    if (!force) {
      if (!isMonday(now)) return { started: false, error: null };
      const latest = await db.latestRun();
      if (latest && now.getTime() - new Date(latest.started_at).getTime() < 6 * DAY) return { started: false, error: null };
    }
    const { runId } = await apify.startRun({ usernames: watching.map((c) => c.username), newerThanDays: pullWindowDays(watching) });
    await db.insertRun(runId, now.toISOString());
    return { started: true, error: null };
  } catch (e) {
    return { started: false, error: message(e) };
  }
}

/** Reads every finished run into posts; marks failed and stale runs. One run's error never stops the next. */
export async function collectRuns(db: CompetitorsDb, apify: ApifyClient, now: Date): Promise<{ stored: number; failed: number }> {
  let stored = 0;
  let failed = 0;
  const runs = await db.pendingRuns();
  if (runs.length === 0) return { stored, failed };
  const watching = (await db.creators()).filter((c) => c.status === "watching");
  const ids = watching.map((c) => c.id);
  const at = now.toISOString();
  const fail = async (run: CompetitorRunRow, error: string) => {
    await db.updateRun(run.id, { status: "failed", error, finished_at: at });
    await db.setCreatorPull(ids, at, "failed");
    failed += 1;
  };
  for (const run of runs) {
    try {
      const state = await apify.getRun(run.apify_run_id);
      if (state.status === "pending") {
        if (now.getTime() - new Date(run.started_at).getTime() > RUN_STALE_HOURS * HOUR) await fail(run, "timed out");
        continue;
      }
      if (state.status === "failed") {
        await fail(run, state.error || "failed");
        continue;
      }
      if (!state.datasetId) {
        await fail(run, "the run returned no dataset");
        continue;
      }
      const since = new Map(
        watching.map((c) => [c.username, new Date(now.getTime() - (c.last_pulled_at === null ? FIRST_PULL_DAYS : REPULL_DAYS) * DAY)])
      );
      const byName = new Map(watching.map((c) => [c.username, c.id]));
      const posts = mapApifyItems(await apify.datasetItems(state.datasetId), since).map((p) => ({ ...p, creator_id: byName.get(p.username) as string }));
      const written = posts.length > 0 ? await db.upsertPosts(posts, at) : 0;
      await db.updateRun(run.id, { status: "ready", finished_at: at, items: written, cost_usd: state.costUsd });
      await db.setCreatorPull(ids, at, "ready");
      stored += written;
    } catch (e) {
      // Left pending: the next cron tries again, and the 48-hour rule ends it.
      console.error("content competitor run", run.apify_run_id, message(e));
    }
  }
  return { stored, failed };
}

/** Popular, fresh, untagged posts, best first. */
export function tagCandidates(posts: CompetitorPostRow[], medians: Map<string, CreatorMedian>, day: string): CompetitorPostRow[] {
  return posts
    .map((p) => ({ p, m: multipleOf(p.views, medians.get(p.creator_id)) }))
    .filter((x) => x.p.tagged_at === null && isFresh(x.p.posted_at, day) && x.m !== null && x.m >= VIRAL_FROM)
    .sort((a, b) => (b.m as number) - (a.m as number))
    .map((x) => x.p);
}

/** Tags up to five popular posts with Claude, while the Today tail still has its time. */
export async function tagPopular(db: CompetitorsDb, caller: ToolCaller, now: Date, timeLeft: () => number): Promise<{ tagged: number }> {
  const medians = creatorMedians(await db.postsForMedians(new Date(now.getTime() - 90 * DAY).toISOString()), now);
  const candidates = tagCandidates(await db.untaggedRecent(new Date(now.getTime() - 15 * DAY).toISOString()), medians, chicagoIsoDate(now)).slice(0, TAG_PER_RUN);
  let tagged = 0;
  for (const p of candidates) {
    if (timeLeft() < TODAY_MIN_SECONDS + TAG_SECONDS) break;
    try {
      const raw = await caller.call({
        system: competitorTagSystemPrompt(),
        text: renderCompetitorTagTurn({ username: p.username, caption: p.caption, duration_seconds: p.duration_seconds }),
        ...(p.thumbnail_url ? { image: { url: p.thumbnail_url } } : {}),
        tool: { name: COMPETITOR_TAG_TOOL, description: "Record the labels for this Reel.", schema: competitorTagToolSchema() },
        model: COMPETITOR_TAG_MODEL,
        maxTokens: 1500,
      });
      const parsed = competitorTagSchema.safeParse(raw);
      if (!parsed.success) continue;
      await db.saveTags(p.id, parsed.data, new Date().toISOString());
      tagged += 1;
    } catch (e) {
      console.error("content competitor tag", p.shortcode, message(e));
    }
  }
  return { tagged };
}

/** Each creator with their median and their popular posts in the window; removed creators last. */
export function buildCreatorsPage(creators: CreatorRow[], posts: CompetitorPostRow[], lastRun: CompetitorRunRow | null, now: Date): CreatorsPage {
  const medians = creatorMedians(posts, now);
  const rows = creators.map((c) => {
    const m = medians.get(c.id) ?? { median: null, count: 0, thin: true };
    const popular = posts
      .filter((p) => p.creator_id === c.id)
      .map((p) => ({ p, multiple: multipleOf(p.views, m) }))
      .filter((x) => x.multiple !== null && x.multiple >= VIRAL_FROM)
      .sort((a, b) => b.p.posted_at.localeCompare(a.p.posted_at))
      .map((x) => ({ id: x.p.id, url: x.p.url, posted_at: x.p.posted_at, multiple: x.multiple as number, briefed: x.p.briefed_at !== null }));
    return { ...c, ...m, popular };
  });
  rows.sort((a, b) => (a.status === b.status ? a.username.localeCompare(b.username) : a.status === "watching" ? -1 : 1));
  return { creators: rows, lastRun };
}
