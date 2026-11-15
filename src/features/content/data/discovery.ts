import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  DISCOVERY_HOPS,
  DISCOVERY_MIN_RUN_USD,
  OWN_INSTAGRAM_USERNAME,
  SAMPLE_MAX_CANDIDATES,
  SIZE_MAX_PROFILES,
  budgetLeft,
  followerCountIsFresh,
  followersLine,
  isLapsed,
  newCandidates,
  nextRunKind,
  slotsFree,
  sizeOutcome,
  type CandidateOutcome,
  type DiscoveryRunKind,
  type SampleReel,
} from "@/features/content/engine/discovery";
import { PROFILE_ACTOR, SEARCH_ACTOR, SEARCH_PHRASES, mapProfileItems, mapSampleItems, mapSearchItems, profilesInput, reelsInput, searchInput } from "@/features/content/engine/discovery-items";
import { RUN_STALE_HOURS } from "@/features/content/engine/competitors";
import { weekStartOf } from "@/features/content/engine/review";
import { APIFY_ACTOR, type ApifyClient } from "./pulls/apify";
import type { CreatorRow } from "./competitors";

// Slice C: the creator-discovery flow. The candidate row is the state machine: every
// candidate carries an outcome and each call moves whatever is ready one step.

export type CandidateRow = {
  id: string;
  username: string;
  outcome: CandidateOutcome;
  reason: string;
  found_via: string;
  followers: number | null;
  own_followers: number | null;
  bio: string;
  sample: SampleReel[];
  reader: "" | "daniel" | "stephen" | "neither";
  confidence: number | null;
  evidence: string[];
  popular_count: number;
  attempts: number;
  looked_at: string;
};

export type DiscoveryRunRow = {
  id: string;
  week_start: string;
  kind: DiscoveryRunKind;
  /** A gather run holds its search phrase in `usernames[0]`. */
  apify_run_id: string;
  usernames: string[];
  status: "pending" | "ready" | "failed";
  error: string;
  cap_usd: number;
  cost_usd: number | null;
  own_followers: number | null;
  items: number | null;
  started_at: string;
  finished_at: string | null;
};

export interface DiscoveryDb {
  /** Every status. */
  creators(): Promise<(CreatorRow & { suggested_at: string | null })[]>;
  candidates(outcomes: CandidateOutcome[]): Promise<CandidateRow[]>;
  candidatesByUsername(usernames: string[]): Promise<CandidateRow[]>;
  /** Insert, or overwrite an existing row for the username. */
  upsertCandidates(rows: (Partial<CandidateRow> & { username: string; outcome: CandidateOutcome })[], at: string): Promise<void>;
  /** Writes only while the row still has `expect` as its outcome. False when it moved. */
  setCandidate(id: string, expect: CandidateOutcome, patch: Partial<CandidateRow>, at: string): Promise<boolean>;
  runsForWeek(weekStart: string): Promise<DiscoveryRunRow[]>;
  pendingRuns(): Promise<DiscoveryRunRow[]>;
  insertRun(row: Omit<DiscoveryRunRow, "id" | "finished_at" | "cost_usd" | "own_followers" | "error">): Promise<string>;
  updateRun(id: string, patch: Partial<DiscoveryRunRow>): Promise<void>;
  /** Inserts the creator as `suggested`. False when the username already exists. */
  suggest(username: string, at: string): Promise<boolean>;
  /** Deletes the creator row while it is still `suggested`; sets the candidate to `lapsed`. */
  lapse(creatorId: string, username: string, at: string): Promise<void>;
  /** Suggested to watching or declined. False when the row is no longer `suggested`. */
  decide(creatorId: string, to: "watching" | "declined", reason: string, at: string): Promise<boolean>;
  declines(limit: number): Promise<{ username: string; bio: string; reason: string }[]>;
  logCall(trigger: "cron" | "routine" | "button", note: string, at: string): Promise<void>;
  callsSince(trigger: "button", since: string): Promise<number>;
}

export type OwnCount = { followers: number; day: string } | null;

// ---- Runs: lapse, collect, start ----


const HOUR = 3_600_000;
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");
export const OWN_UNKNOWN_NOTE = "Discovery did not run: your follower count could not be read.";
export const WAITING_NOTE = "Three suggestions are waiting, so nothing was searched.";

/** Lapses every suggestion Miguel left unanswered for over 4 weeks: the creator row goes, the candidate says why. */
export async function lapseStale(db: DiscoveryDb, now: Date): Promise<number> {
  let lapsed = 0;
  for (const c of await db.creators()) {
    if (c.status !== "suggested" || !c.suggested_at || !isLapsed(c.suggested_at, now)) continue;
    await db.lapse(c.id, c.username, now.toISOString());
    lapsed += 1;
  }
  return lapsed;
}

/** The stored count when fresh, else the newest `own_followers` a run read this week, else unknown. */
function ownFollowers(own: OwnCount, runs: DiscoveryRunRow[], now: Date): number | null {
  if (own && followerCountIsFresh(own.day, chicagoIsoDate(now))) return own.followers;
  const read = runs.filter((r) => r.own_followers !== null).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return read?.own_followers ?? null;
}

/** Sizes every `gathered` candidate whose follower count is known. `attempted`: a size run already tried to read the rest. */
async function sizeGathered(db: DiscoveryDb, own: number, now: Date, attempted: boolean): Promise<void> {
  const at = now.toISOString();
  for (const c of await db.candidates(["gathered"])) {
    if (c.followers === null && !attempted) continue;
    const outcome = sizeOutcome(c.followers, own);
    if (outcome === "sized") await db.setCandidate(c.id, "gathered", { outcome, own_followers: own }, at);
    else if (outcome === "out_of_band") await db.setCandidate(c.id, "gathered", { outcome, own_followers: own, reason: `${followersLine(c.followers as number, own).replace(", ", " is ")}; the band is 2x to 20x` }, at);
    else await db.setCandidate(c.id, "gathered", { outcome, own_followers: own, reason: "No follower count (private or gone)" }, at);
  }
}

type CollectOut = { collected: number; failed: number; errors: string[]; note: string | null };

/** Reads every pending discovery run once. A run that cannot be read stays pending and is reported in `errors`. */
export async function collectDiscoveryRuns(db: DiscoveryDb, apify: ApifyClient, a: { now: Date; own: OwnCount }): Promise<CollectOut> {
  const out: CollectOut = { collected: 0, failed: 0, errors: [], note: null };
  const runs = await db.pendingRuns();
  if (runs.length === 0) return out;
  const at = a.now.toISOString();
  const failRun = async (r: DiscoveryRunRow, error: string) => {
    await db.updateRun(r.id, { status: "failed", error, finished_at: at });
    out.failed += 1;
  };
  let sizeRead = false;
  for (const r of runs) {
    try {
      const state = await apify.getRun(r.apify_run_id);
      if (state.status === "pending") {
        if (a.now.getTime() - new Date(r.started_at).getTime() > RUN_STALE_HOURS * HOUR) await failRun(r, "timed out");
        continue;
      }
      if (state.status === "failed") {
        await failRun(r, state.error || "failed");
        continue;
      }
      if (!state.datasetId) {
        await failRun(r, "the run returned no dataset");
        continue;
      }
      const items = await apify.datasetItems(state.datasetId);
      let ownRead: number | null = null;
      if (r.kind === "gather") await collectGather(db, items, r.usernames[0] ?? "", a.now);
      else if (r.kind === "size") {
        ownRead = await collectSize(db, items, r.usernames, a.now);
        sizeRead = true;
      } else await collectSample(db, items, r.usernames, a.now);
      await db.updateRun(r.id, { status: "ready", finished_at: at, items: items.length, cost_usd: state.costUsd, ...(ownRead !== null ? { own_followers: ownRead } : {}) });
      out.collected += 1;
    } catch (e) {
      // Left pending: the next call tries again, and the 48-hour rule ends it.
      console.error("content discovery run", r.apify_run_id, message(e));
      out.errors.push(`run ${r.apify_run_id}: ${message(e)}`);
    }
  }
  const week = await db.runsForWeek(weekStartOf(a.now));
  const own = ownFollowers(a.own, week, a.now);
  const attempted = sizeRead || week.some((r) => r.kind === "size" && r.status !== "pending");
  if (own === null) {
    if (attempted && (await db.candidates(["gathered"])).length > 0) out.note = OWN_UNKNOWN_NOTE;
  } else {
    await sizeGathered(db, own, a.now, attempted);
  }
  return out;
}

async function collectGather(db: DiscoveryDb, items: unknown[], phrase: string, now: Date): Promise<void> {
  const rows = mapSearchItems(items, phrase);
  const creators = new Set((await db.creators()).map((c) => c.username));
  const memory = new Map((await db.candidatesByUsername(rows.map((r) => r.username))).map((c) => [c.username, { outcome: c.outcome, looked_at: c.looked_at }]));
  const fresh = new Map(newCandidates(rows.map((r) => ({ username: r.username, found_via: r.found_via })), { creators, memory }, now).map((c) => [c.username, c]));
  const at = now.toISOString();
  const upserts = rows
    .filter((r) => fresh.has(r.username))
    .map((r) =>
      r.isPrivate
        ? { username: r.username, outcome: "unreadable" as const, reason: "Private account", found_via: r.found_via, followers: r.followers }
        : { username: r.username, outcome: "gathered" as const, found_via: r.found_via, followers: r.followers },
    );
  // The same account can come back from two phrases; the first wins.
  const seen = new Set<string>();
  const unique = upserts.filter((u) => (seen.has(u.username) ? false : (seen.add(u.username), true)));
  if (unique.length > 0) await db.upsertCandidates(unique, at);
}

/** Writes followers and bio to the profiled candidates; returns Miguel's own count when the run read it. */
async function collectSize(db: DiscoveryDb, items: unknown[], usernames: string[], now: Date): Promise<number | null> {
  const at = now.toISOString();
  const profiles = new Map(mapProfileItems(items).map((p) => [p.username, p]));
  const mine = profiles.get(OWN_INSTAGRAM_USERNAME)?.followers ?? null;
  for (const c of await db.candidatesByUsername(usernames.filter((u) => u !== OWN_INSTAGRAM_USERNAME))) {
    const p = profiles.get(c.username);
    if (!p) continue;
    if (p.isPrivate) await db.setCandidate(c.id, "gathered", { outcome: "unreadable", reason: "Private account", followers: p.followers, bio: p.bio }, at);
    else await db.setCandidate(c.id, "gathered", { followers: p.followers, bio: p.bio }, at);
  }
  return mine;
}

async function collectSample(db: DiscoveryDb, items: unknown[], usernames: string[], now: Date): Promise<void> {
  const at = now.toISOString();
  const samples = mapSampleItems(items, usernames);
  for (const c of await db.candidatesByUsername(usernames)) {
    const sample = samples.get(c.username) ?? [];
    if (sample.length === 0) await db.setCandidate(c.id, "sized", { outcome: "quiet", reason: "No Reels found", sample: [] }, at);
    else await db.setCandidate(c.id, "sized", { outcome: "sampled", sample }, at);
  }
}

/**
 * Starts the one next run, if any. Nothing starts while a discovery run is pending, while three
 * suggestions wait, or when this week's dollar is spent. A gather starts on Monday or when forced;
 * a size or sample run follows on any day.
 */
export async function startNextRun(db: DiscoveryDb, apify: ApifyClient, a: { now: Date; force: boolean; own: OwnCount }): Promise<{ started: DiscoveryRunKind | null; note: string | null }> {
  try {
    if ((await db.pendingRuns()).length > 0) return { started: null, note: null };
    const waiting = (await db.creators()).filter((c) => c.status === "suggested").length;
    if (slotsFree(waiting) === 0) return { started: null, note: WAITING_NOTE };
    const weekStart = weekStartOf(a.now);
    const week = await db.runsForWeek(weekStart);
    const left = budgetLeft(week);
    if (left < DISCOVERY_MIN_RUN_USD) return { started: null, note: "This week's search budget is used." };

    const own = ownFollowers(a.own, week, a.now);
    const gathered = await db.candidates(["gathered"]);
    const sizedRows = await db.candidates(["sized"]);
    const isMonday = chicagoIsoDate(a.now) === weekStart;
    const kind = nextRunKind({ gathered: gathered.length, sized: sizedRows.length, ranThisWeek: week.map((r) => r.kind), hops: DISCOVERY_HOPS, canGather: a.force || isMonday });
    if (!kind) return { started: null, note: null };
    const base = { week_start: weekStart, status: "pending" as const, items: null, started_at: a.now.toISOString() };

    if (kind === "gather") {
      const n = Math.min(SEARCH_PHRASES.length, Math.floor(left / DISCOVERY_MIN_RUN_USD));
      const cap = Math.floor((left / n) * 100) / 100;
      for (const phrase of SEARCH_PHRASES.slice(0, n)) {
        const { runId } = await apify.startActor({ actorId: SEARCH_ACTOR, body: searchInput(phrase), maxTotalChargeUsd: cap });
        await db.insertRun({ ...base, kind, apify_run_id: runId, usernames: [phrase], cap_usd: cap });
      }
      return { started: kind, note: null };
    }
    if (kind === "size") {
      const names = gathered.filter((c) => c.followers === null).map((c) => c.username).slice(0, SIZE_MAX_PROFILES - 1);
      const usernames = own === null ? [OWN_INSTAGRAM_USERNAME, ...names] : names;
      if (usernames.length === 0) return { started: null, note: null };
      const { runId } = await apify.startActor({ actorId: PROFILE_ACTOR, body: profilesInput(usernames), maxTotalChargeUsd: left });
      await db.insertRun({ ...base, kind, apify_run_id: runId, usernames, cap_usd: left });
      return { started: kind, note: null };
    }
    const usernames = [...sizedRows].sort((x, y) => (x.followers ?? 0) - (y.followers ?? 0)).slice(0, SAMPLE_MAX_CANDIDATES).map((c) => c.username);
    const { runId } = await apify.startActor({ actorId: APIFY_ACTOR, body: reelsInput(usernames), maxTotalChargeUsd: left });
    await db.insertRun({ ...base, kind, apify_run_id: runId, usernames, cap_usd: left });
    return { started: kind, note: null };
  } catch (e) {
    console.error("content discovery start", message(e));
    return { started: null, note: `Could not start a search: ${message(e)}` };
  }
}
